package com.lifeplanner.util

import java.time.{LocalDate, ZoneId}

object PeriodUtils {

  val PlannerZone: ZoneId = ZoneId.of("Asia/Kolkata")

  val SupportedLevels: List[String] =
    List("DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY")

  def currentPeriod(level: String): String =
    periodForDate(level, LocalDate.now(PlannerZone))

  def periodForDate(level: String, date: LocalDate): String =
    level match {
      case "DAILY" => date.toString
      case "WEEKLY" =>
        // Sunday-based calendar weeks, matching frontend/lib/period.ts.
        // Week 1 contains January 1 and uses the calendar year.
        val januaryFirst = LocalDate.of(date.getYear, 1, 1)
        val sundayBasedOffset = januaryFirst.getDayOfWeek.getValue % 7
        val week = Math.ceil(
          (date.getDayOfYear - 1 + sundayBasedOffset + 1) / 7.0
        ).toInt
        f"${date.getYear}-W${week}%02d"

      case "MONTHLY" => f"${date.getYear}-${date.getMonthValue}%02d"
      case "YEARLY" => date.getYear.toString
      case "QUARTERLY" =>
        val q = (date.getMonthValue - 1) / 3 + 1
        s"${date.getYear}-Q$q"
      case _ => date.toString
    }

  def isPast(period: String, level : String): Boolean =
    val current = currentPeriod(level)
    period < current



}
