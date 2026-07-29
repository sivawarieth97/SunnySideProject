package com.lifeplanner.api

import com.lifeplanner.model.{LoginUser, RegisterUser}
import com.lifeplanner.service.AuthService
import zio.{ZIO, Duration}
import zio.json.*
import zio.http.{Cookie, Method, Path, Request, Response, Routes, Status, handler}

object AuthRoutes {

  private val isProduction = sys.env.get("APP_ENV").contains("production")

  private val secureCookies = isProduction || sys.env.get("COOKIE_SECURE").exists(_.equalsIgnoreCase("true"))

  private def sessionCookie(token: String): Cookie.Response =
    Cookie.Response(
      name = AuthService.SessionCookieName,
      content = token,
      path = Some(Path.root),
      isSecure = secureCookies,
      isHttpOnly = true,
      maxAge = Some(Duration.fromSeconds(AuthService.SessionTtlSeconds)),
      sameSite = Some(Cookie.SameSite.Lax)
    )

  val routes : Routes[AuthService, Nothing] = Routes(
    Method.POST / "auth" / "register" -> handler { (req : Request) =>
      for
        body <- req.body.asString.orDie
        requ = body.fromJson[RegisterUser]
        response <- requ match
          case Left(_) =>
            ZIO.succeed(Response.json("""{"error" : "InvalidJson"}""").status(Status.BadRequest))
          case Right(r) =>
            if r.email.trim.isEmpty || r.password.trim.isEmpty then
              ZIO.succeed(Response.json("""{"error" : "Email id and password cannot be empty"}""").status(Status.BadRequest))
            else
              AuthService.register(r).map(user => Response.json(user.toJson).status(Status.Created))
                .catchAll(e => ZIO.succeed(Response.json(s"""{"error" : "${e.getMessage}"}""").status(Status.Conflict)))

      yield response
    },
    Method.POST / "auth" / "login" -> handler { (req : Request) =>
      for
        body <- req.body.asString.orDie
        requ = body.fromJson[LoginUser]
        response <- requ match
          case Left(_) =>
            ZIO.succeed(Response.json("""{"error" : "InvalidJson"}""").status(Status.BadRequest))
          case Right(r) =>
            if r.email.trim.isEmpty || r.password.trim.isEmpty then
              ZIO.succeed(Response.json("""{"error" : "Email id and password cannot be empty"}""").status(Status.BadRequest))
            else
              AuthService.login(r).map { auth =>
                  Response
                    .json("""{"authenticated":true}""")
                    .addCookie(sessionCookie(auth.token))
                }
                .catchAll(e => ZIO.succeed(Response.json(s"""{"error" : "${e.getMessage}"}""").status(Status.Unauthorized)))

      yield response

    },
    Method.POST / "auth" / "logout" -> handler {
      val expiredCookie =
        sessionCookie("").copy(maxAge = Some(Duration.Zero))
      Response
        .json("""{"loggedOut":true}""")
        .addCookie(expiredCookie)
    }
  )

}
