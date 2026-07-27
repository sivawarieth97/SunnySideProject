package com.lifeplanner.repository

import com.lifeplanner.model.Goal
import com.lifeplanner.util.PeriodUtils
import zio.*

import java.sql.ResultSet
import java.util.UUID
import javax.sql.DataSource
import scala.collection.mutable.ListBuffer

class GoalRepository(ds: DataSource) :
  private def toGoal(rs: ResultSet) : Goal =
    Goal(
      id = rs.getObject("id", classOf[UUID]),
      title = rs.getString("title"),
      description = Option(rs.getString("description")),
      status = rs.getString("status"),
      level = rs.getString("level"),
      priority = rs.getString("priority"),
      period = Option(rs.getString("period")),
      originalPeriod = Option(rs.getString("original_period")),
      parentGoalId = Option(rs.getObject("parent_goal_id", classOf[UUID])),
      createdAt = rs.getTimestamp("created_at").toInstant,
      isRecurring = rs.getBoolean("is_recurring"),
      recurrenceEnd = Option(rs.getString("recurrence_end")),
      completedPeriods = Nil
    )

  private def withConnection[A](f: java.sql.Connection => A) : ZIO[Any, Throwable, A] =
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

  def insert(title: String, description : Option[String], level: Option[String], priority : Option[String], period: Option[String],
             parentGoalId : Option[UUID], userid: UUID, isRecurring : Option[Boolean], recurrenceEnd : Option[String]) : ZIO[Any, Throwable, Goal] =
    withConnection { conn =>
        val resolvedLevel = level.getOrElse("DAILY")
        val resolvedPeriod = period.getOrElse(PeriodUtils.currentPeriod(resolvedLevel))
        val sql = """
          INSERT into goals (id, title, description, level, priority, period, original_period, parent_goal_id,  user_id, is_recurring, recurrence_end)
          VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING *
          """

        val stmt = conn.prepareStatement(sql)
        stmt.setString(1, title)
        stmt.setString(2, description.orNull)
        stmt.setString(3, resolvedLevel)
        stmt.setString(4, priority.getOrElse("MEDIUM"))
        stmt.setString(5, resolvedPeriod)
        stmt.setString(6, resolvedPeriod)
        stmt.setObject(7, parentGoalId.orNull)
        stmt.setObject(8, userid)
        stmt.setBoolean(9, isRecurring.getOrElse(false))
        stmt.setObject(10, recurrenceEnd.orNull)


        val rs = stmt.executeQuery()
        rs.next()

        toGoal(rs)
    }

  def findById(id: UUID, userId: UUID) : ZIO[Any, Throwable, Option[Goal]] =
    withConnection { conn =>
        val sql = "SELECT * FROM goals where id = ? AND user_id = ?"
        val stmt = conn.prepareStatement(sql)
        stmt.setObject(1, id)
        stmt.setObject(2, userId)

        val rs = stmt.executeQuery()
        if rs.next() then Some(toGoal(rs)) else None
      }


  def findAll(userId: UUID): ZIO[GoalRepository, Throwable, List[Goal]] =
    withConnection { conn =>
      // 1. Load the goals — exactly what you have today
      val sql = "SELECT * from goals WHERE user_id = ? ORDER BY created_at DESC"
      val stmt = conn.prepareStatement(sql)
      stmt.setObject(1, userId)
      val rs = stmt.executeQuery()
      val buf = ListBuffer[Goal]()
      while rs.next do buf += toGoal(rs)          // completedPeriods is Nil here
      val goals = buf.toList

      // 2. Load ALL completions belonging to this user's goals, in one query
      val compStmt = conn.prepareStatement(
        """SELECT c.goal_id, c.period
         FROM goal_completions c
         JOIN goals g ON g.id = c.goal_id
         WHERE g.user_id = ?""")
      compStmt.setObject(1, userId)
      val crs = compStmt.executeQuery()
      val compBuf = ListBuffer[(UUID, String)]()
      while crs.next do
        compBuf += ((crs.getObject("goal_id", classOf[UUID]), crs.getString("period")))

      // 3. Group completions by goal id: Map[UUID, List[String]]
      val completionsByGoal: Map[UUID, List[String]] =
        compBuf.toList.groupMap(_._1)(_._2)

      // 4. Attach each goal's completions (empty list if it has none)
      goals.map(g => g.copy(completedPeriods = completionsByGoal.getOrElse(g.id, Nil)))
    }

  def update(id : UUID, title: String, description:Option[String],
             level:Option[String], priority:Option[String], status: Option[String], userId: UUID) : ZIO[GoalRepository, Throwable, Option[Goal]] =
    withConnection { conn =>
      // level/priority/status use COALESCE so that omitting them in the request
      // (e.g. the "mark complete" button only sends a status change) keeps the
      // existing value instead of silently resetting it to a default.
      val stmt = conn.prepareStatement(
        """
          UPDATE goals SET
            title = ?,
            description = ?,
            updated_at = NOW(),
            level = COALESCE(?, level),
            priority = COALESCE(?, priority),
            status = COALESCE(?, status),
            status_updated_at = CASE WHEN ? IS NOT NULL THEN NOW() ELSE status_updated_at END
          WHERE id = ? AND user_id = ?
          RETURNING *
          """)
      stmt.setString(1, title)
      stmt.setString(2, description.orNull)
      stmt.setString(3, level.orNull)
      stmt.setString(4, priority.orNull)
      stmt.setString(5, status.orNull)
      stmt.setString(6, status.orNull)
      stmt.setObject(7, id)
      stmt.setObject(8, userId)

      val rs = stmt.executeQuery()
      if rs.next() then Some(toGoal(rs)) else None

    }

  def delete(id : UUID, userId: UUID) : ZIO[GoalRepository, Throwable, Boolean] =
    withConnection { conn =>
      val stmt = conn.prepareStatement("DELETE from goals where id = ? AND user_id = ?")
      stmt.setObject(1, id)
      stmt.setObject(2, userId)

      val res = stmt.executeUpdate()
      res > 0
    }


  def rolloverPastGoals(userId: UUID) : ZIO[GoalRepository, Throwable, Int] =
   withConnection { conn =>
     val levels = List("DAILY", "WEEKLY", "MONTHLY", "YEARLY")
     levels.map { level =>
       val current = PeriodUtils.currentPeriod(level)
       // is_recurring = FALSE: recurring goals live on every applicable day by
       // definition, so "rolling them forward" would be meaningless/destructive.
       val stmt = conn.prepareStatement(
         """
           UPDATE goals SET period = ?
           where user_id = ? AND level = ? AND status = 'PENDING' AND period IS NOT NULL AND period < ?
             AND is_recurring = FALSE
           """)
       stmt.setString(1, current)
       stmt.setObject(2, userId)
       stmt.setString(3, level)
       stmt.setString(4, current)
       stmt.executeUpdate()
     }.sum
   }

  def addCompletion(goalId: UUID, period: String, userId: UUID): ZIO[Any, Throwable, Boolean] =
    withConnection { conn =>
      val stmt = conn.prepareStatement(
        """INSERT INTO goal_completions (goal_id, period)
          SELECT id, ? FROM goals WHERE id = ? AND user_id = ?
          ON CONFLICT DO NOTHING""")
      stmt.setString(1, period)
      stmt.setObject(2, goalId)
      stmt.setObject(3, userId)
      stmt.executeUpdate() > 0
    }

  def removeCompletion(goalId: UUID, period: String, userId: UUID): ZIO[Any, Throwable, Boolean] =
    withConnection { conn =>
      val stmt = conn.prepareStatement(
        """DELETE FROM goal_completions c USING goals g
          WHERE c.goal_id = g.id AND c.goal_id = ? AND c.period = ? AND g.user_id = ?""")
      stmt.setObject(1, goalId)
      stmt.setString(2, period)
      stmt.setObject(3, userId)
      stmt.executeUpdate() > 0
    }



object GoalRepository:
  val live: ZLayer[DataSource, Nothing, GoalRepository] = ZLayer.fromFunction(ds => GoalRepository(ds))

  def insert(title: String , description: Option[String], level:Option[String], priority:Option[String], period : Option[String], parentGoalId:Option[UUID], userId: UUID, isRecurring : Option[Boolean], recurrenceEnd : Option[String]): ZIO[GoalRepository, Throwable, Goal] =
    ZIO.serviceWithZIO[GoalRepository](_.insert(title, description, level, priority, period, parentGoalId, userId, isRecurring, recurrenceEnd))

  def findById(id: UUID, userId: UUID): ZIO[GoalRepository, Throwable, Option[Goal]] =
    ZIO.serviceWithZIO[GoalRepository](_.findById(id, userId))

  def findAll(userId: UUID) : ZIO[GoalRepository, Throwable, List[Goal]] =
    ZIO.serviceWithZIO[GoalRepository](_.findAll(userId))

  def update(id : UUID, title: String, descripion:Option[String], level:Option[String], priority:Option[String], status: Option[String], userId: UUID) : ZIO[GoalRepository, Throwable, Option[Goal]] =
    ZIO.serviceWithZIO[GoalRepository](_.update(id, title, descripion, level, priority, status, userId))

  def delete(id : UUID, userId: UUID) : ZIO[GoalRepository, Throwable, Boolean] =
    ZIO.serviceWithZIO[GoalRepository](_.delete(id, userId))

  def rolloverPastGoals(userId: UUID) : ZIO[GoalRepository, Throwable, Int] =
    ZIO.serviceWithZIO[GoalRepository](_.rolloverPastGoals(userId))

  def addCompletion(goalId: UUID, period: String, userId: UUID): ZIO[GoalRepository, Throwable, Boolean] =
    ZIO.serviceWithZIO[GoalRepository](_.addCompletion(goalId, period, userId))

  def removeCompletion(goalId: UUID, period: String, userId: UUID): ZIO[GoalRepository, Throwable, Boolean] =
    ZIO.serviceWithZIO[GoalRepository](_.removeCompletion(goalId, period, userId))
