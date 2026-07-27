// Builds the backend into a single runnable "fat jar" (sbt assembly) —
// what the Dockerfile's build stage produces and the run stage executes.
addSbtPlugin("com.eed3si9n" % "sbt-assembly" % "2.3.1")
