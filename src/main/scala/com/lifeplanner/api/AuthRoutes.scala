package com.lifeplanner.api

import com.lifeplanner.model.{LoginUser, RegisterUser}
import com.lifeplanner.service.AuthService
import zio.ZIO
import zio.json.*
import zio.http.{Method, Request, Response, Routes, Status, handler}

object AuthRoutes {

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
              AuthService.login(r).map(user => Response.json(user.toJson))
                .catchAll(e => ZIO.succeed(Response.json(s"""{"error" : "${e.getMessage}"}""").status(Status.Unauthorized)))

      yield response

    }
  )

}
