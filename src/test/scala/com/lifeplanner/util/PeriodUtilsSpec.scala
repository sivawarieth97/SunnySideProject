package com.lifeplanner.util

import java.time.LocalDate
import zio.test.*

object PeriodUtilsSpec extends ZIOSpecDefault:
  def spec = suite("PeriodUtils")(
    test("rollover supports every goal level, including quarterly") {
      assertTrue(
        PeriodUtils.SupportedLevels ==
          List("DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY")
      )
    },
    test("every supported level resolves to a non-empty current period") {
      assertTrue(
        PeriodUtils.SupportedLevels.forall(level =>
          PeriodUtils.currentPeriod(level).nonEmpty
        )
      )
    },
    test("quarterly periods use the sortable year-quarter format") {
      assertTrue(
        PeriodUtils.currentPeriod("QUARTERLY").matches("""\d{4}-Q[1-4]""")
      )
    },
    test("weekly periods use deterministic Sunday-based calendar weeks") {
      assertTrue(
        PeriodUtils.periodForDate("WEEKLY", LocalDate.of(2026, 1, 1)) == "2026-W01",
        PeriodUtils.periodForDate("WEEKLY", LocalDate.of(2026, 1, 3)) == "2026-W01",
        PeriodUtils.periodForDate("WEEKLY", LocalDate.of(2026, 1, 4)) == "2026-W02",
        PeriodUtils.periodForDate("WEEKLY", LocalDate.of(2026, 12, 31)) == "2026-W53",
        PeriodUtils.periodForDate("WEEKLY", LocalDate.of(2027, 1, 1)) == "2027-W01"
      )
    }
  )
