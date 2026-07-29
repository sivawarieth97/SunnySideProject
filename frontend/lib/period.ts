import type { GoalLevel } from '@/types'

export const PLANNER_TIME_ZONE = 'Asia/Kolkata'

type CalendarDate = {
  year: number
  month: number
  day: number
}

const plannerDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PLANNER_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function plannerDateFromInstant(date: Date): CalendarDate {
  const parts = plannerDateFormatter.formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(part => part.type === type)?.value)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  }
}

function localCalendarDate(date: Date): CalendarDate {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  }
}

function utcCalendarDate(date: Date): CalendarDate {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function shiftCalendarDate(
  date: CalendarDate,
  options: { days?: number; months?: number },
): CalendarDate {
  return utcCalendarDate(new Date(Date.UTC(
    date.year,
    date.month - 1 + (options.months ?? 0),
    date.day + (options.days ?? 0),
  )))
}

function periodForCalendarDate(level: GoalLevel, date: CalendarDate): string {
  switch (level) {
    case 'DAILY':
      return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
    case 'WEEKLY': {
      const januaryFirst = Date.UTC(date.year, 0, 1)
      const dateValue = Date.UTC(date.year, date.month - 1, date.day)
      const januaryFirstDay = new Date(januaryFirst).getUTCDay()
      const week = Math.ceil(
        ((dateValue - januaryFirst) / 86400000 + januaryFirstDay + 1) / 7
      )
      return `${date.year}-W${String(week).padStart(2, '0')}`
    }
    case 'MONTHLY':
      return `${date.year}-${String(date.month).padStart(2, '0')}`
    case 'QUARTERLY':
      return `${date.year}-Q${Math.floor((date.month - 1) / 3) + 1}`
    case 'YEARLY':
      return String(date.year)
  }
}

/** Returns the current period string for a given level — mirrors PeriodUtils.scala */
export function currentPeriod(level: GoalLevel, now = new Date()): string {
  return periodForCalendarDate(level, plannerDateFromInstant(now))
}

/**
 * Like currentPeriod, but shifted forward by `offset` periods of that level.
 * offset 0 = the current period (same as currentPeriod), 1 = the next one, etc.
 * Used by AI Mode to stagger a generated plan's "Week 1", "Week 2", "Day 1"...
 * items across real future periods instead of dumping them all into "now".
 */
export function periodAtOffset(level: GoalLevel, offset: number): string {
  const today = plannerDateFromInstant(new Date())
  switch (level) {
    case 'DAILY':
      return periodForCalendarDate('DAILY', shiftCalendarDate(today, { days: offset }))
    case 'WEEKLY':
      return periodForCalendarDate('WEEKLY', shiftCalendarDate(today, { days: offset * 7 }))
    case 'MONTHLY':
      return periodForCalendarDate(
        'MONTHLY',
        shiftCalendarDate({ ...today, day: 1 }, { months: offset }),
      )
    case 'QUARTERLY': {
      const quarterStart = {
        ...today,
        month: Math.floor((today.month - 1) / 3) * 3 + 1,
        day: 1,
      }
      return periodForCalendarDate(
        'QUARTERLY',
        shiftCalendarDate(quarterStart, { months: offset * 3 }),
      )
    }
    case 'YEARLY':
      return String(today.year + offset)
  }
}

/**
 * The period string a specific calendar date falls into, for a given level.
 * Used by the date picker on create forms ("this goal is for Aug 15" →
 * "2026-08-15" / "2026-W33" / "2026-08" / "2026-Q3" / "2026") and by the
 * calendar when projecting goals onto day cells.
 */
export function periodForDate(level: GoalLevel, date: Date): string {
  return periodForCalendarDate(level, localCalendarDate(date))
}

function dateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Converts a stored period into a representative date for an HTML date input.
 * Saving that date through periodForDate() produces the original period again.
 * An empty string represents an invalid period or a recurrence with no end.
 */
export function dateInputForPeriod(
  period: string | null,
  level: GoalLevel,
): string {
  if (!period) return ''

  switch (level) {
    case 'DAILY': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return ''
      const [year, month, day] = period.split('-').map(Number)
      const date = localDate(year, month - 1, day)
      return periodForDate('DAILY', date) === period ? period : ''
    }
    case 'WEEKLY': {
      const match = period.match(/^(\d{4})-W(\d{2})$/)
      if (!match) return ''

      const year = Number(match[1])
      const week = Number(match[2])
      if (week < 1 || week > 53) return ''

      const januaryFirst = localDate(year, 0, 1)
      const weekStart = localDate(
        year,
        0,
        1 - januaryFirst.getDay() + ((week - 1) * 7),
      )
      // Week 1 can begin in the previous calendar year. The date input must
      // remain inside the stored year because periodForDate prefixes that year.
      const representative = weekStart < januaryFirst ? januaryFirst : weekStart
      return periodForDate('WEEKLY', representative) === period
        ? dateInputValue(representative)
        : ''
    }
    case 'MONTHLY': {
      const match = period.match(/^(\d{4})-(\d{2})$/)
      if (!match) return ''
      const year = Number(match[1])
      const month = Number(match[2])
      if (month < 1 || month > 12) return ''
      return dateInputValue(localDate(year, month - 1, 1))
    }
    case 'QUARTERLY': {
      const match = period.match(/^(\d{4})-Q([1-4])$/)
      if (!match) return ''
      const year = Number(match[1])
      const quarter = Number(match[2])
      return dateInputValue(localDate(year, (quarter - 1) * 3, 1))
    }
    case 'YEARLY': {
      if (!/^\d{4}$/.test(period)) return ''
      return `${period}-01-01`
    }
  }
}

export function isPast(period: string, level: GoalLevel): boolean {
  return period < currentPeriod(level)
}

export function friendlyPeriod(period: string, level: GoalLevel): string {
  switch (level) {
    case 'DAILY':
      return new Date(period).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
    case 'WEEKLY':
      return `Week ${period.split('-W')[1]}, ${period.split('-W')[0]}`
    case 'MONTHLY': {
      const [year, month] = period.split('-')
      return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-GB', {
        month: 'long', year: 'numeric',
      })
    }
    case 'QUARTERLY': {
      const [year, q] = period.split('-Q')
      return `Q${q} ${year}`
    }
    case 'YEARLY':
      return period
  }
}

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day)
}

/**
 * Expands a stored period into the date (or inclusive date range) it covers.
 * Keeping this derived in the frontend avoids storing duplicate display data.
 */
export function periodDateRange(period: string, level: GoalLevel): string {
  let start: Date
  let end: Date

  switch (level) {
    case 'DAILY': {
      const [year, month, day] = period.split('-').map(Number)
      start = localDate(year, month - 1, day)
      end = start
      break
    }
    case 'WEEKLY': {
      const [yearText, weekText] = period.split('-W')
      const year = Number(yearText)
      const week = Number(weekText)
      const januaryFirst = localDate(year, 0, 1)

      // periodForDate() starts a new numbered week on Sunday.
      start = localDate(year, 0, 1 - januaryFirst.getDay() + ((week - 1) * 7))
      end = localDate(start.getFullYear(), start.getMonth(), start.getDate() + 6)
      break
    }
    case 'MONTHLY': {
      const [year, month] = period.split('-').map(Number)
      start = localDate(year, month - 1, 1)
      end = localDate(year, month, 0)
      break
    }
    case 'QUARTERLY': {
      const [yearText, quarterText] = period.split('-Q')
      const year = Number(yearText)
      const startMonth = (Number(quarterText) - 1) * 3
      start = localDate(year, startMonth, 1)
      end = localDate(year, startMonth + 3, 0)
      break
    }
    case 'YEARLY': {
      const year = Number(period)
      start = localDate(year, 0, 1)
      end = localDate(year, 11, 31)
      break
    }
  }

  const startLabel = shortDateFormatter.format(start)
  const endLabel = shortDateFormatter.format(end)
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`
}
