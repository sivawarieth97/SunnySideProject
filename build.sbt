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
    )
  )
