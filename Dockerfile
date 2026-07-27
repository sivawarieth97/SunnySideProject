# ---- Build stage: compile the Scala backend into one fat jar ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# Install sbt (pinned to the project's version from project/build.properties)
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fL https://github.com/sbt/sbt/releases/download/v1.12.11/sbt-1.12.11.tgz | tar xz -C /usr/local \
 && ln -s /usr/local/sbt/bin/sbt /usr/local/bin/sbt

# Copy build definition first so dependency resolution is cached between
# builds — source-only changes skip the slow "download the internet" step.
COPY build.sbt ./
COPY project ./project
RUN sbt update

COPY src ./src
RUN sbt assembly

# ---- Run stage: slim JRE only ----
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/scala-3.8.3/app.jar ./app.jar

# Render's free instance has 512MB RAM — cap the JVM so it isn't OOM-killed.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"

EXPOSE 8080
CMD ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
