package com.lifeplanner.repository

import com.lifeplanner.model.{Goal, GoalRollover, RolloverSummary}
import com.lifeplanner.util.PeriodUtils
import zio.*

import java.sql.{ResultSet, Types}
import java.util.UUID
import javax.sql.DataSource
import scala.collection.mutable.ListBuffer

case class InvalidParentGoal(parentGoalId: UUID)
  extends Exception(s"Parent goal $parentGoalId does not belong to this user")

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
          SELECT gen_random_uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE ?::uuid IS NULL
             OR EXISTS (
               SELECT 1
               FROM goals parent
               WHERE parent.id = ? AND parent.user_id = ?
             )
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
        stmt.setObject(11, parentGoalId.orNull)
        stmt.setObject(12, parentGoalId.orNull)
        stmt.setObject(13, userid)


        val rs = stmt.executeQuery()
        if !rs.next() then
          throw InvalidParentGoal(parentGoalId.get)

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

  def update(id : UUID, title: String, description:Option[String], level:Option[String], priority:Option[String], status: Option[String],
             isRecurring : Option[Boolean], recurrenceEnd : Option[Option[String]], userId: UUID) : ZIO[GoalRepository, Throwable, Option[Goal]] =
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
            is_recurring = COALESCE(?, is_recurring),
            recurrence_end = CASE
              WHEN COALESCE(?, is_recurring) = FALSE THEN NULL
              WHEN ? THEN ?
              ELSE recurrence_end
            END,
            status_updated_at = CASE WHEN ? IS NOT NULL THEN NOW() ELSE status_updated_at END
          WHERE id = ? AND user_id = ?
          RETURNING *
          """)
      stmt.setString(1, title)
      stmt.setString(2, description.orNull)
      stmt.setString(3, level.orNull)
      stmt.setString(4, priority.orNull)
      stmt.setString(5, status.orNull)

      isRecurring match
        case Some(value) =>
          stmt.setBoolean(6, value)
          stmt.setBoolean(7, value)

        case None =>
          stmt.setNull(6, Types.BOOLEAN)
          stmt.setNull(7, Types.BOOLEAN)

      stmt.setBoolean(8, recurrenceEnd.isDefined)
      stmt.setString(9, recurrenceEnd.flatten.orNull)
      stmt.setString(10, status.orNull)
      stmt.setObject(11, id)
      stmt.setObject(12, userId)


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


  def rolloverPastGoals(userId: UUID) : ZIO[GoalRepository, Throwable, RolloverSummary] =
    withConnection { conn =>
      val previousAutoCommit = conn.getAutoCommit
      conn.setAutoCommit(false)

      try
        val counts = PeriodUtils.SupportedLevels.map { level =>
          val current = PeriodUtils.currentPeriod(level)

          // Keep the same goal id and hierarchy, but record the period transition
          // before moving it. Recurring goals are excluded because they already
          // occur in every applicable period and should never be shifted.
          val historyStmt = conn.prepareStatement(
            """
              INSERT INTO goal_rollovers (goal_id, from_period, to_period)
              SELECT id, period, ?
              FROM goals
              WHERE user_id = ?
                AND level = ?
                AND status = 'PENDING'
                AND period IS NOT NULL
                AND period < ?
                AND is_recurring = FALSE
              ON CONFLICT (goal_id, from_period, to_period) DO NOTHING
              """)

          try
            historyStmt.setString(1, current)
            historyStmt.setObject(2, userId)
            historyStmt.setString(3, level)
            historyStmt.setString(4, current)
            historyStmt.executeUpdate()
          finally historyStmt.close()

          val updateStmt = conn.prepareStatement(
            """
              UPDATE goals
              SET period = ?, updated_at = NOW()
              WHERE user_id = ?
                AND level = ?
                AND status = 'PENDING'
                AND period IS NOT NULL
                AND period < ?
                AND is_recurring = FALSE
              """)

          val moved =
            try
              updateStmt.setString(1, current)
              updateStmt.setObject(2, userId)
              updateStmt.setString(3, level)
              updateStmt.setString(4, current)
              updateStmt.executeUpdate()
            finally updateStmt.close()

          level -> moved
        }.toMap

        conn.commit()
        RolloverSummary(
          rolledOver = counts.values.sum,
          byLevel = counts
        )
      catch
        case error: Throwable =>
          conn.rollback()
          throw error
      finally
        conn.setAutoCommit(previousAutoCommit)
    }

  def findRolloverHistory(goalId: UUID, userId: UUID): ZIO[Any, Throwable, List[GoalRollover]] =
    withConnection { conn =>
      val stmt = conn.prepareStatement(
        """
          SELECT r.from_period, r.to_period, r.rolled_over_at
          FROM goal_rollovers r
          JOIN goals g ON g.id = r.goal_id
          WHERE r.goal_id = ? AND g.user_id = ?
          ORDER BY r.rolled_over_at DESC
          """)

      try
        stmt.setObject(1, goalId)
        stmt.setObject(2, userId)
        val rs = stmt.executeQuery()
        val history = ListBuffer[GoalRollover]()
        while rs.next do
          history += GoalRollover(
            fromPeriod = rs.getString("from_period"),
            toPeriod = rs.getString("to_period"),
            rolledOverAt = rs.getTimestamp("rolled_over_at").toInstant
          )
        history.toList
      finally stmt.close()
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

  def update(id : UUID, title: String, descripion:Option[String], level:Option[String], priority:Option[String], status: Option[String],
             isRecurring : Option[Boolean], recurrenceEnd : Option[Option[String]], userId: UUID) : ZIO[GoalRepository, Throwable, Option[Goal]] =
    ZIO.serviceWithZIO[GoalRepository](_.update(id, title, descripion, level, priority, status, isRecurring, recurrenceEnd, userId))

  def delete(id : UUID, userId: UUID) : ZIO[GoalRepository, Throwable, Boolean] =
    ZIO.serviceWithZIO[GoalRepository](_.delete(id, userId))

  def rolloverPastGoals(userId: UUID) : ZIO[GoalRepository, Throwable, RolloverSummary] =
    ZIO.serviceWithZIO[GoalRepository](_.rolloverPastGoals(userId))

  def findRolloverHistory(goalId: UUID, userId: UUID): ZIO[GoalRepository, Throwable, List[GoalRollover]] =
    ZIO.serviceWithZIO[GoalRepository](_.findRolloverHistory(goalId, userId))

  def addCompletion(goalId: UUID, period: String, userId: UUID): ZIO[GoalRepository, Throwable, Boolean] =
    ZIO.serviceWithZIO[GoalRepository](_.addCompletion(goalId, period, userId))

  def removeCompletion(goalId: UUID, period: String, userId: UUID): ZIO[GoalRepository, Throwable, Boolean] =
    ZIO.serviceWithZIO[GoalRepository](_.removeCompletion(goalId, period, userId))
