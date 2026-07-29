package com.lifeplanner.model

import zio.json.*

import java.time.Instant
import java.util.UUID

case class Goal(
               id: UUID,
               title : String,
               description : Option[String],
               status : String,
               level : String,
               priority : String,
               period : Option[String],
               originalPeriod : Option[String],
               parentGoalId: Option[UUID],
               createdAt : Instant,
               isRecurring : Boolean,
               recurrenceEnd : Option[String],
               completedPeriods : List[String]
               ) derives JsonDecoder

object Goal:
  given JsonEncoder[UUID] = JsonEncoder[String].contramap(_.toString)
  given JsonEncoder[Instant] = JsonEncoder[String].contramap(_.toString)
  given JsonEncoder[Goal] = DeriveJsonEncoder.gen[Goal]


case class CreateGoalRequest(
                              title : String,
                              description : Option[String],
                              level : Option[String],
                              priority : Option[String],
                              period : Option[String],
                              parentGoalId : Option[UUID],
                              isRecurring : Option[Boolean],
                              recurrenceEnd : Option[String]
                            ) derives JsonDecoder


case class UpdateGoalRequest(
                              title : String,
                              description : Option[String],
                              level : Option[String],
                              priority : Option[String],
                              status : Option[String],
                              isRecurring : Option[Boolean],
                              recurrenceEnd : Option[Option[String]]
                            ) derives JsonDecoder

case class CompletionRequest(period: String) derives JsonDecoder

case class RolloverSummary(
                            rolledOver: Int,
                            byLevel: Map[String, Int]
                          ) derives JsonEncoder

case class GoalRollover(
                         fromPeriod: String,
                         toPeriod: String,
                         rolledOverAt: Instant
                       )

object GoalRollover:
  given JsonEncoder[Instant] = JsonEncoder[String].contramap(_.toString)
  given JsonEncoder[GoalRollover] = DeriveJsonEncoder.gen[GoalRollover]
