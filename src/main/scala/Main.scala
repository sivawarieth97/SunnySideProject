import com.lifeplanner.api.{AuthRoutes, GoalRoutes}
import com.lifeplanner.repository.{GoalRepository, UserRepository}
import com.lifeplanner.service.AuthService
import com.lifeplanner.infra.Database
import org.flywaydb.core.Flyway
import zio.*
import zio.http.*

import javax.sql.DataSource

object Main extends ZIOAppDefault:

  val runMigration: ZIO[DataSource, Throwable, Unit] =
    for
      ds <- ZIO.service[DataSource]
      _ <- ZIO.attempt {
        Flyway.configure()
          .dataSource(ds)
          .locations("classpath:db/migration")
          .load()
          .migrate()
      }.unit
      _ <- Console.printLine("Migrations done")
    yield ()

  val allRoutes = AuthRoutes.routes ++ GoalRoutes.routes

  def run =
    runMigration.provide(Database.live) *>
      Server.serve(allRoutes)
        .provide(
          Server.default,
          GoalRepository.live,
          UserRepository.live,
          AuthService.live,
          Database.live
        )
