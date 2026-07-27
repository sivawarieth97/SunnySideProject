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
  val port = sys.env.get("PORT").flatMap(_.toIntOption).getOrElse(8080)


  def run =
    runMigration.provide(Database.live) *>
      Server.serve(allRoutes)
        .provide(
          Server.defaultWithPort(port),
          GoalRepository.live,
          UserRepository.live,
          AuthService.live,
          Database.live
        )
