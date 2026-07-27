package com.lifeplanner.infra

import com.zaxxer.hikari.{HikariConfig, HikariDataSource}
import zio.*

import javax.sql.DataSource

object Database {

  // Reads DB connection settings from environment variables so the same code
  // works against docker-compose locally and against a real DB in other environments.
  // Falls back to the docker-compose defaults (services.postgres in docker-compose.yml)
  // when a variable isn't set.
  private def config: ZIO[Any, Nothing, HikariConfig] =
    for
      host     <- System.env("DB_HOST").map(_.getOrElse("localhost")).orDie
      port     <- System.env("DB_PORT").map(_.getOrElse("5432")).orDie
      db       <- System.env("DB_NAME").map(_.getOrElse("lifeplanner")).orDie
      user     <- System.env("DB_USER").map(_.getOrElse("mlp_user")).orDie
      password <- System.env("DB_PASSWORD").map(_.getOrElse("mlp_password")).orDie
      sslmode  <- System.env("DB_SSLMODE").map(_.getOrElse("disable")).orDie
    yield {
      val cfg = HikariConfig()
      cfg.setJdbcUrl(s"jdbc:postgresql://$host:$port/$db?sslmode=$sslmode")
      cfg.setUsername(user)
      cfg.setPassword(password)
      cfg.setMaximumPoolSize(4)
      cfg.setMaxLifetime(240000)
      cfg
    }

  // Postgres (e.g. via `docker compose up -d`) can take a moment to accept
  // connections, or might not be started yet when this app boots. Retry a
  // few times with backoff instead of dying on the very first attempt.
  private val connectRetrySchedule =
    Schedule.exponential(500.millis) && Schedule.recurs(5)

  val live: ZLayer[Any, Throwable, DataSource] = {
    ZLayer.scoped {
      ZIO.acquireRelease(
        for
          cfg <- config
          ds <- ZIO.attempt(HikariDataSource(cfg))
            .tapError(e => ZIO.logWarning(s"Failed to connect to Postgres, retrying... (${e.getMessage})"))
            .retry(connectRetrySchedule)
        yield ds
      ) (ds => ZIO.attempt(ds.close()).ignoreLogged)
    }
  }

}
