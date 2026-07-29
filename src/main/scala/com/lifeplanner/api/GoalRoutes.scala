package com.lifeplanner.api

import com.lifeplanner.model.{CompletionRequest, CreateGoalRequest, UpdateGoalRequest}
import com.lifeplanner.repository.{GoalRepository, InvalidParentGoal}
import com.lifeplanner.service.AuthService
import zio.ZIO
import zio.http.*
import zio.http.Status.BadRequest
import zio.json.{DecoderOps, EncoderOps}

import java.util.UUID


object GoalRoutes {

  private val validStatuses = Set("PENDING", "COMPLETED", "ROLLED_OVER")

  private def extractUserId(req: Request): ZIO[AuthService, Throwable, String] = {
    val bearerToken = req.headers
          .get("Authorization")
          .filter(_.startsWith("Bearer "))
          .map(_.stripPrefix("Bearer ").trim)
          .filter(_.nonEmpty)

    val cookieToken = req.cookie(AuthService.SessionCookieName)
          .map(_.content)
          .filter(_.nonEmpty)

    ZIO
      .fromOption(bearerToken.orElse(cookieToken))
      .orElseFail(new Exception("Missing token"))
      .flatMap(AuthService.verifyToken)
  }

  val routes : Routes[GoalRepository & AuthService, Nothing] =
    Routes (
      Method.POST / "goals" / "rollover" -> handler { (req: Request) =>
        val result = for
          userId <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          summary <- GoalRepository.rolloverPastGoals(userUUID)
            .mapError(_ => Response.json("""{"error":"Could not roll over goals"}""").status(Status.InternalServerError))
        yield Response.json(summary.toJson)
        result.merge
      },

      Method.POST / "goals" -> handler { (req: Request) =>

        for
          userId <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          body <- req.body.asString.orDie
          request = body.fromJson[CreateGoalRequest]

          resp <- request match
            case Left(error) => ZIO.succeed(Response.json("""{"error":"Invalid Json"}""").status(BadRequest))

            case Right(r) if r.title.trim.isEmpty =>
              ZIO.succeed(Response.json("""{"error":"title cannod be empty"}""").status(BadRequest))


            case Right(r) =>
              GoalRepository.insert(r.title, r.description, r.level, r.priority, r.period, r.parentGoalId, userUUID, r.isRecurring, r.recurrenceEnd)
                .map(goal => Response.json(goal.toJson).status(Status.Created))
                .catchSome {
                  case _: InvalidParentGoal =>
                    ZIO.succeed(
                      Response
                        .json("""{"error":"Parent goal not found"}""")
                        .status(Status.BadRequest)
                    )
                }
                .orDie

        yield resp



      },

      Method.GET / "goals" / string("id") -> handler { (idStr: String, req : Request) =>
        val result = for
          userId <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          id <- ZIO.attempt(UUID.fromString(idStr))
            .orElseFail(Response.text("Invalid UUID").status(Status.BadRequest))

          found <- GoalRepository.findById(id, userUUID).orDie


          resp = found match
            case Some(g) => Response.json(g.toJson)
            case None    => Response.json("""{"error":"goal not found"}""")
              .status(Status.NotFound)

        yield resp
        result.merge
      },

      Method.GET / "goals" / string("id") / "rollovers" -> handler { (idStr: String, req: Request) =>
        val result = for
          userId <- extractUserId(req)
            .mapError(_ => Response.json("""{"error":"Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          id <- ZIO.attempt(UUID.fromString(idStr))
            .orElseFail(Response.json("""{"error":"invalid UUID"}""").status(Status.BadRequest))
          history <- GoalRepository.findRolloverHistory(id, userUUID)
            .mapError(_ => Response.json("""{"error":"Could not load rollover history"}""").status(Status.InternalServerError))
        yield Response.json(s"""{"rollovers":${history.toJson}}""")
        result.merge
      },

      Method.GET / "goals" -> handler { (req: Request) =>
        val result = for
          userId <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          goals <- GoalRepository.findAll(userUUID).orDie
        yield Response.json(s"""{"goals":${goals.toJson}}""")
        result.merge

      },

      Method.PUT / "goals" / string("id") -> handler { (idStr: String, req: Request) =>
        val result = for
          userId <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          body <- req.body.asString.orDie
          request = body.fromJson[UpdateGoalRequest]

          resp <- request match
            case Left(error) =>
              ZIO.succeed(Response.json(s"""{"error":$error}""").status(BadRequest))

            case Right(r) if r.title.trim.isEmpty =>
              ZIO.succeed(Response.json(s"""{"error":"Title shouldn't be empty"}""").status(BadRequest))

            case Right(r) if r.status.exists(s => !validStatuses.contains(s)) =>
              ZIO.succeed(Response.json(s"""{"error":"status must be one of ${validStatuses.mkString(", ")}"}""").status(BadRequest))

            case Right(r) =>
              ZIO.attempt(UUID.fromString(idStr)).orDie.flatMap { id =>
                GoalRepository.update(id, r.title, r.description, r.level, r.priority, r.status, r.isRecurring, r.recurrenceEnd, userUUID)
                  .map {
                    case Some(goal) => Response.json(goal.toJson)
                    case None => Response.json(s"""{"error":"Goal not found"}""").status(Status.NotFound)
                  }.orDie
              }
        yield resp
        result.merge
      },

      Method.DELETE / "goals" / string("id") -> handler { (idStr: String, req: Request) =>
        val result = 
          for
            userId <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
            userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
            id <- ZIO.attempt(UUID.fromString(idStr)).orElseFail(Response.json("""{"error":"invalid UUID"}""").status(Status.BadRequest))
  
            deleted <-  GoalRepository.delete(id, userUUID).orDie
            resp = if deleted
                then Response.status(Status.NoContent)
                else Response.json("""{"error":"goal not found"}""").status(Status.NotFound)

          yield resp
        result.merge

      },

      Method.POST / "goals" / string("id") / "completions" -> handler { (idStr: String, req: Request) =>
        val result = for
          userId   <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
          userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
          id       <- ZIO.attempt(UUID.fromString(idStr))
            .orElseFail(Response.json("""{"error":"invalid UUID"}""").status(Status.BadRequest))
          body     <- req.body.asString.orDie

          resp <- body.fromJson[CompletionRequest] match
            case Left(_) =>
              ZIO.succeed(Response.json("""{"error":"Invalid Json"}""").status(BadRequest))

            case Right(c) if c.period.trim.isEmpty =>
              ZIO.succeed(Response.json("""{"error":"period cannot be empty"}""").status(BadRequest))

            case Right(c) =>
              GoalRepository.addCompletion(id, c.period.trim, userUUID)
                .map { added =>
                  if added then Response.json("""{"completed":true}""").status(Status.Created)
                  else Response.json("""{"error":"goal not found"}""").status(Status.NotFound)
                }.orDie
        yield resp
        result.merge
      },

      Method.DELETE / "goals" / string("id") / "completions" / string("period") -> handler {
        (idStr: String, period: String, req: Request) =>
          val result = for
            userId   <- extractUserId(req).mapError(_ => Response.json("""{"error" : "Unauthorized"}""").status(Status.Unauthorized))
            userUUID <- ZIO.attempt(UUID.fromString(userId)).orDie
            id       <- ZIO.attempt(UUID.fromString(idStr))
              .orElseFail(Response.json("""{"error":"invalid UUID"}""").status(Status.BadRequest))
            removed  <- GoalRepository.removeCompletion(id, period, userUUID).orDie
            resp = if removed then Response.status(Status.NoContent)
            else Response.json("""{"error":"completion not found"}""").status(Status.NotFound)
          yield resp
          result.merge
      },
      Method.GET / "health" -> handler { (_: Request) => Response.text("ok") }

    )
}
