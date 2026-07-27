package com.lifeplanner.repository

import com.lifeplanner.model.{Goal, User}
import zio.{ZIO, ZLayer}

import java.sql.{Connection, ResultSet}
import java.util.UUID
import javax.sql.DataSource

class UserRepository(ds: DataSource) :

  private def toUser(rs : ResultSet) : User =
    User(
      id = rs.getObject("id", classOf[UUID]),
      email = rs.getString("email"),
      createdAt = rs.getTimestamp("created_at").toInstant
    )


  private def withConnection[A](f: Connection => A) : ZIO[Any, Throwable, A] =
    ZIO.blocking {
      ZIO.scoped {
        ZIO.acquireRelease(
          ZIO.attempt(ds.getConnection())
        ) (conn =>
        ZIO.attempt(conn.close()).ignoreLogged).flatMap {
          conn => ZIO.attempt(f(conn))
        }
      }
    }

  def insertUser(email : String, hashedPassword: String) : ZIO[Any, Throwable, User] =
    withConnection { conn =>
        val stmt = conn.prepareStatement(
          "INSERT INTO users (email, password) VALUES ( ?, ?) RETURNING id, email, created_at")
        stmt.setString(1, email)
        stmt.setString(2, hashedPassword)

        val rs = stmt.executeQuery()
        rs.next()

        toUser(rs)
    }

  def findByEmail(email: String): ZIO[Any, Throwable, Option[(User, String)]] =
    withConnection { conn =>
      val sql = "SELECT * FROM users where email = ?"
      val stmt = conn.prepareStatement(sql)
      stmt.setObject(1, email)

      val rs = stmt.executeQuery()
      if rs.next() then Some((toUser(rs), rs.getString("password"))) else None

    }

object UserRepository:

  val live: ZLayer[DataSource, Nothing, UserRepository] = ZLayer.fromFunction((ds : DataSource) => new UserRepository(ds))

  def insertUser(email : String, hashedPassword: String) : ZIO[UserRepository, Throwable, User] =
    ZIO.serviceWithZIO[UserRepository](_.insertUser(email, hashedPassword))

  def findByEmail(email : String) : ZIO[UserRepository, Throwable, Option[(User, String)]] =
    ZIO.serviceWithZIO[UserRepository](_.findByEmail(email))




