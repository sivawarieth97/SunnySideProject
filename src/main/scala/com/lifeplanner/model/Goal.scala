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
                              status : Option[String]
                            ) derives JsonDecoder

case class CompletionRequest(period: String) derives JsonDecoder
