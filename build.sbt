ThisBuild / scalaVersion := "3.8.3"

lazy val root = (project in file("."))
  .settings(
    name := "LifePlanner",
    libraryDependencies ++= Seq(
      "dev.zio" %% "zio" % "2.1.9",
      "dev.zio" %% "zio-http" % "3.0.1",
      "dev.zio" %% "zio-json" % "0.7.3",
      "org.postgresql"  % "postgresql" % "42.7.4",
      "com.zaxxer"      % "HikariCP"   % "5.1.0",
      "org.flywaydb"    % "flyway-core"                 % "10.20.1",
      "org.flywaydb"    % "flyway-database-postgresql"  % "10.20.1",
      "com.auth0"    % "java-jwt"  % "4.4.0",
      "at.favre.lib" % "bcrypt"    % "0.10.2",
    ),

    // ---- sbt-assembly (fat jar for the Docker image) ----
    assembly / mainClass := Some("Main"),
    assembly / assemblyJarName := "app.jar",
    assembly / assemblyMergeStrategy := {
      // Flyway discovers its Postgres support via ServiceLoader files —
      // these MUST be concatenated, not discarded, or migrations break.
      case PathList("META-INF", "services", _*) => MergeStrategy.concat
      case PathList("META-INF", _*)             => MergeStrategy.discard
      case "module-info.class"                  => MergeStrategy.discard
      case "reference.conf"                     => MergeStrategy.concat
      case _                                    => MergeStrategy.first
    }
  )
