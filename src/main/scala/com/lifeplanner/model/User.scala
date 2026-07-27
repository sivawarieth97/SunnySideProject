package com.lifeplanner.model

import zio.json.{DeriveJsonEncoder, JsonDecoder, JsonEncoder}

import java.time.Instant
import java.util.UUID

case class User(
               id : UUID,
               email : String,
               createdAt : Instant
               )
object User:
  given JsonEncoder[UUID] = JsonEncoder[String].contramap(_.toString)
  given JsonEncoder[Instant] = JsonEncoder[String].contramap(_.toString)
  given JsonEncoder[User] = DeriveJsonEncoder.gen[User]
  
case class RegisterUser(email : String,
                          password : String) derives JsonDecoder

case class LoginUser(email : String,
                        password : String) derives JsonDecoder

case class AuthResponse(token : String) derives JsonEncoder
