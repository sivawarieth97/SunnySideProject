package com.lifeplanner.util

import java.time.temporal.WeekFields
import java.time.{LocalDate, ZoneId}
import java.util.Locale

object PeriodUtils {

  def currentPeriod(level: String) =
    val today = LocalDate.now(ZoneId.of("Asia/Kolkata"))
    level match {
      case "DAILY" => today.toString
      case "WEEKLY" =>
        val week = today.get(WeekFields.of(Locale.getDefault).weekOfWeekBasedYear())
        f"${today.getYear}-W${week}%02d"

      case "MONTHLY" => f"${today.getYear}-${today.getMonthValue}%02d"
      case "YEARLY" => today.getYear.toString
      case "QUARTERLY" =>
        val q = (today.getMonthValue - 1) / 3 + 1
        s"${today.getYear}-Q$q"
      case _ => today.toString
    }

  def isPast(period: String, level : String) =
    val current = currentPeriod(level)
    period < current



}
