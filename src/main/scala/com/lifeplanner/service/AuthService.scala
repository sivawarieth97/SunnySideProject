package com.lifeplanner.service

import at.favre.lib.crypto.bcrypt.BCrypt
import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import com.lifeplanner.model.{AuthResponse, LoginUser, RegisterUser, User}
import com.lifeplanner.repository.UserRepository
import zio.{ZIO, ZLayer}

import java.time.Instant
import java.util.Date

class AuthService (userRepo: UserRepository) :
  // Falls back to a dev-only default so the app still runs locally without extra
  // setup, but a real deployment should always set JWT_SECRET.
  private val secret = sys.env.getOrElse("JWT_SECRET", "my-secret-change-in-production")
  private val algorithm = Algorithm.HMAC256(secret)

  def register(req: RegisterUser) : ZIO[Any, Throwable, User] =
    for
      exisiting <- userRepo.findByEmail(req.email)
      _<- ZIO.when(exisiting.isDefined) (
        ZIO.fail(new Exception("User is already registered"))
      )
      hashed <- ZIO.attempt(BCrypt.withDefaults().hashToString(12, req.password.toCharArray))
      user <- userRepo.insertUser(req.email, hashed)
    yield user

  def verifyToken(token: String): ZIO[AuthService, Throwable, String] =
    ZIO.attempt {
      val decoded = JWT.require(algorithm).build().verify(token)
      decoded.getSubject
    }

  def login(req: LoginUser) : ZIO[Any, Throwable, AuthResponse] = {

    for
      exisiting <- userRepo.findByEmail(req.email)
      (user, hash) <- ZIO.fromOption(exisiting).orElseFail(
        new Exception("Invalid email or password")
      )

      hashed <- ZIO.attempt(BCrypt.verifyer().verify(req.password.toCharArray, hash).verified)

      _ <- ZIO.when(!hashed)(ZIO.fail(new Exception("User/password is incorrect")))
      token = JWT.create()
        .withSubject(user.id.toString())
        .withClaim("email", user.email)
        .withExpiresAt(Date.from(Instant.now().plusSeconds(7 * 24 * 60 * 60)))
        .sign(algorithm)

    yield AuthResponse(token)
  }


object AuthService:
  val live : ZLayer[UserRepository, Nothing, AuthService] = ZLayer.fromFunction((repo: UserRepository) => new AuthService(repo))

  def register(req: RegisterUser): ZIO[AuthService, Throwable, User] =
    ZIO.serviceWithZIO[AuthService](_.register(req))

  def login(req: LoginUser): ZIO[AuthService, Throwable, AuthResponse] =
    ZIO.serviceWithZIO[AuthService](_.login(req))

  def verifyToken(token: String): ZIO[AuthService, Throwable, String] =
    ZIO.serviceWithZIO[AuthService](_.verifyToken(token))





