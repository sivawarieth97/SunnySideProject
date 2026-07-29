import { GoalLevel } from '@/types'

/** Returns the current period string for a given level — mirrors PeriodUtils.scala */
export function currentPeriod(level: GoalLevel): string {
  const now = new Date()
  switch (level) {
    case 'DAILY':
      return now.toISOString().slice(0, 10) // YYYY-MM-DD
    case 'WEEKLY': {
      // ISO week number
      const jan1 = new Date(now.getFullYear(), 0, 1)
      const week = Math.ceil(
        ((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
      )
      return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    case 'MONTHLY':
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    case 'QUARTERLY': {
      const quarter = Math.floor(now.getMonth() / 3) + 1
      return `${now.getFullYear()}-Q${quarter}`
    }
    case 'YEARLY':
      return String(now.getFullYear())
  }
}

/**
 * Like currentPeriod, but shifted forward by `offset` periods of that level.
 * offset 0 = the current period (same as currentPeriod), 1 = the next one, etc.
 * Used by AI Mode to stagger a generated plan's "Week 1", "Week 2", "Day 1"...
 * items across real future periods instead of dumping them all into "now".
 */
export function periodAtOffset(level: GoalLevel, offset: number): string {
  const now = new Date()
  switch (level) {
    case 'DAILY': {
      const d = new Date(now)
      d.setDate(d.getDate() + offset)
      return d.toISOString().slice(0, 10)
    }
    case 'WEEKLY': {
      const d = new Date(now)
      d.setDate(d.getDate() + offset * 7)
      const jan1 = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(
        ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
      )
      return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    case 'MONTHLY': {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    case 'QUARTERLY': {
      const totalQuarter = Math.floor(now.getMonth() / 3) + offset
      const year = now.getFullYear() + Math.floor(totalQuarter / 4)
      const quarter = ((totalQuarter % 4) + 4) % 4 + 1
      return `${year}-Q${quarter}`
    }
    case 'YEARLY':
      return String(now.getFullYear() + offset)
  }
}

/**
 * The period string a specific calendar date falls into, for a given level.
 * Used by the date picker on create forms ("this goal is for Aug 15" →
 * "2026-08-15" / "2026-W33" / "2026-08" / "2026-Q3" / "2026") and by the
 * calendar when projecting goals onto day cells.
 */
export function periodForDate(level: GoalLevel, date: Date): string {
  switch (level) {
    case 'DAILY': {
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    case 'WEEKLY': {
      const jan1 = new Date(date.getFullYear(), 0, 1)
      const week = Math.ceil(
        ((date.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
      )
      return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    case 'MONTHLY':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    case 'QUARTERLY': {
      const quarter = Math.floor(date.getMonth() / 3) + 1
      return `${date.getFullYear()}-Q${quarter}`
    }
    case 'YEARLY':
      return String(date.getFullYear())
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
