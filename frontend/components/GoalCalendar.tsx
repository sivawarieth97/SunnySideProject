'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { getToken, authHeaders } from '@/lib/auth'
import { periodForDate } from '@/lib/period'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { useGoals, mutateGoals } from '@/lib/useGoals'
import Coin from '@/components/ui/Coin'
import type { Goal } from '@/app/page'

// Rendered once in the root layout, so it appears at the end of every page
// ("the other half"). Hides itself on auth pages and when logged out.
//
// Projection rules:
//  - one-off DAILY goal          → its period date only (solid chip)
//  - recurring DAILY goal        → every day from its start (originalPeriod)
//                                  until recurrenceEnd / forever (↻ chip)
//  - one-off WEEKLY goal         → shown on the week band for its week
//  - recurring WEEKLY goal       → on every week band in its active range
// Completed = one-offs by status, recurring by completedPeriods for that day.

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A recurring goal is active on a period if start ≤ period ≤ end.
// Period strings of the same level compare correctly as plain strings.
function activeOn(goal: Goal, period: string): boolean {
  const start = goal.originalPeriod ?? goal.period
  if (start && period < start) return false
  if (goal.recurrenceEnd && period > goal.recurrenceEnd) return false
  return true
}

export default function GoalCalendar() {
  const pathname = usePathname()
  // Shared store — same data the page views use, fetched once for everyone.
  const { goals, loaded } = useGoals()
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // goalId while toggling

  const hidden = pathname === '/login' || pathname === '/register'

  if (hidden || !loaded || !getToken()) return null

  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Monday-first offset: getDay() is 0=Sun..6=Sat → 0=Mon..6=Sun
  const firstOffset = (monthStart.getDay() + 6) % 7
  const todayIso = isoOf(new Date())

  const dailyGoals  = goals.filter(g => g.level === 'DAILY')
  const weeklyGoals = goals.filter(g => g.level === 'WEEKLY')

  // Bigger-picture goals for the month being viewed: its month, its quarter,
  // its year. Recurring ones project onto every period in their range.
  const monthPeriod   = periodForDate('MONTHLY', monthStart)
  const quarterPeriod = periodForDate('QUARTERLY', monthStart)
  const yearPeriod    = periodForDate('YEARLY', monthStart)

  function goalsForPeriod(level: string, period: string): Goal[] {
    return goals.filter(g =>
      g.level === level && (g.isRecurring ? activeOn(g, period) : g.period === period)
    )
  }

  const bigPicture: { emoji: string; label: string; period: string; items: Goal[] }[] = [
    { emoji: '🌙', label: monthStart.toLocaleDateString('en-GB', { month: 'long' }), period: monthPeriod, items: goalsForPeriod('MONTHLY', monthPeriod) },
    { emoji: '🍂', label: quarterPeriod.split('-')[1], period: quarterPeriod, items: goalsForPeriod('QUARTERLY', quarterPeriod) },
    { emoji: '⭐', label: yearPeriod, period: yearPeriod, items: goalsForPeriod('YEARLY', yearPeriod) },
  ].filter(row => row.items.length > 0)

  function goalsForDay(iso: string): Goal[] {
    return dailyGoals.filter(g =>
      g.isRecurring ? activeOn(g, iso) : g.period === iso
    )
  }

  function isDoneOn(g: Goal, period: string): boolean {
    return g.isRecurring ? g.completedPeriods.includes(period) : g.status === 'COMPLETED'
  }

  async function toggleDay(g: Goal, period: string) {
    setBusy(g.id)
    const wasDone = g.isRecurring ? g.completedPeriods.includes(period) : g.status === 'COMPLETED'
    // Optimistic: flip locally first so the tick is instant, reconcile after.
    mutateGoals(prev => prev.map(x => {
      if (x.id !== g.id) return x
      return g.isRecurring
        ? { ...x, completedPeriods: wasDone ? x.completedPeriods.filter(p => p !== period) : [...x.completedPeriods, period] }
        : { ...x, status: wasDone ? 'PENDING' : 'COMPLETED' }
    }))
    try {
      if (g.isRecurring) {
        if (wasDone) {
          await fetch(`/api/goals/${g.id}/completions/${period}`, {
            method: 'DELETE', headers: authHeaders(),
          })
        } else {
          await fetch(`/api/goals/${g.id}/completions`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ period }),
          })
        }
      } else {
        // one-off: flip the goal's own status (same call the goal cards make)
        await fetch(`/api/goals/${g.id}`, {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({
            title: g.title, description: g.description, level: g.level, priority: g.priority,
            status: wasDone ? 'PENDING' : 'COMPLETED',
          }),
        })
      }
      notifyGoalsChanged()
    } finally {
      setBusy(null)
    }
  }

  // Build calendar cells: leading blanks + one per day
  const cells: (string | null)[] = [
    ...Array.from({ length: firstOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => isoOf(new Date(year, month, i + 1))),
  ]
  // Chunk into weeks for per-week bands
  const weekRows: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weekRows.push(cells.slice(i, i + 7))

  function weeklyGoalsForRow(row: (string | null)[]): Goal[] {
    const firstDay = row.find(c => c !== null)
    if (!firstDay) return []
    const [y, m, d] = firstDay.split('-').map(Number)
    const weekPeriod = periodForDate('WEEKLY', new Date(y, m - 1, d))
    return weeklyGoals.filter(g =>
      g.isRecurring ? activeOn(g, weekPeriod) : g.period === weekPeriod
    )
  }

  const monthLabel = monthStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const selectedGoals = selectedDay ? goalsForDay(selectedDay) : []

  return (
    <section>
      <div className="rounded-cute border border-blossom-100 bg-white/70 p-4 shadow-cute backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-peachy-400">
            <Coin emoji="🗓️" gradient="from-sunny-200 to-peachy-200" />
            Calendar
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonthStart(new Date(year, month - 1, 1))}
              className="rounded-full border border-sunny-200 bg-sunny-50 px-2.5 py-0.5 text-sm font-bold text-peachy-400 hover:bg-sunny-100"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="w-36 text-center font-display text-sm font-bold text-[#5b3a2e]">{monthLabel}</span>
            <button
              onClick={() => setMonthStart(new Date(year, month + 1, 1))}
              className="rounded-full border border-sunny-200 bg-sunny-50 px-2.5 py-0.5 text-sm font-bold text-peachy-400 hover:bg-sunny-100"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        </div>

        <p className="mt-1 text-[11px] font-semibold text-[#5b3a2e]/65">
          Solid = one-time · <span className="font-bold">↻</span> = repeats · tinted = done that day
        </p>

        {/* Bigger picture — the viewed month's monthly / quarterly / yearly goals.
            Click a chip to mark it done for that period. */}
        {bigPicture.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-xl border border-blossom-100 bg-blossom-50/40 p-2.5">
            {bigPicture.map(row => (
              <div key={row.period} className="flex flex-wrap items-center gap-1.5">
                <span className="w-20 shrink-0 text-[11px] font-bold text-blossom-300">
                  {row.emoji} {row.label}
                </span>
                {row.items.map(g => {
                  const done = isDoneOn(g, row.period)
                  return (
                    <button
                      key={g.id}
                      onClick={() => toggleDay(g, row.period)}
                      disabled={busy === g.id}
                      title={done ? 'Click to mark not done' : 'Click to mark done'}
                      className={`max-w-[14rem] truncate rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition disabled:opacity-40
                                  ${done
                                    ? 'border-blossom-200 bg-blossom-200 text-white line-through'
                                    : 'border-white bg-white/80 text-[#5b3a2e] hover:border-peachy-200'}`}
                    >
                      {g.isRecurring ? '↻ ' : ''}{g.title}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map(d => (
            <div key={d} className="text-[11px] font-bold text-blossom-300">{d}</div>
          ))}
        </div>

        <motion.div
          key={monthLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="mt-1 space-y-1"
        >
          {weekRows.map((row, ri) => {
            const weekBand = weeklyGoalsForRow(row)
            return (
              <div key={ri}>
                {weekBand.length > 0 && (
                  <div className="mb-0.5 flex flex-wrap gap-1 rounded-lg bg-blossom-50/70 px-2 py-0.5">
                    {weekBand.map(g => (
                      <span key={g.id} className="truncate text-[10px] font-bold text-blossom-400">
                        📆 {g.isRecurring ? '↻ ' : ''}{g.title}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-7 gap-1">
                  {row.map((iso, ci) => {
                    if (!iso) return <div key={ci} />
                    const dayNum = Number(iso.slice(-2))
                    const dayGoals = goalsForDay(iso)
                    const isToday = iso === todayIso
                    const isSelected = iso === selectedDay
                    return (
                      <button
                        key={ci}
                        onClick={() => setSelectedDay(isSelected ? null : iso)}
                        className={`min-h-[4rem] rounded-xl border p-1 text-left align-top transition
                                    ${isSelected ? 'border-peachy-300 bg-peachy-50 ring-1 ring-peachy-300'
                                      : isToday ? 'border-transparent bg-sunny-50'
                                      : ci >= 5 ? 'border-transparent bg-blossom-50/50 hover:border-sunny-200'
                                      : 'border-transparent bg-white/60 hover:border-sunny-200'}`}
                      >
                        <span className={`flex items-center gap-1 font-display text-[11px] font-bold
                                          ${isToday ? 'text-peachy-400' : 'text-[#5b3a2e]/60'}`}>
                          {dayNum}
                          {isToday && <span className="h-1.5 w-1.5 rounded-full bg-peachy-400" />}
                        </span>
                        <span className="mt-0.5 flex flex-col gap-0.5">
                          {dayGoals.slice(0, 3).map(g => {
                            const done = isDoneOn(g, iso)
                            return (
                              <span
                                key={g.id}
                                className={`truncate rounded px-1 py-0.5 text-[10px] font-bold leading-tight
                                            ${done ? 'bg-blossom-200/90 text-white line-through'
                                              : g.isRecurring ? 'bg-sunny-200/90 text-[#5b3a2e]'
                                              : 'bg-peachy-200/90 text-[#5b3a2e]'}`}
                              >
                                {g.isRecurring ? '↻ ' : ''}{g.title}
                              </span>
                            )
                          })}
                          {dayGoals.length > 3 && (
                            <span className="text-[10px] font-bold text-peachy-400">+{dayGoals.length - 3} more</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </motion.div>

        {selectedDay && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-xl border border-sunny-200 bg-sunny-50/60 p-3"
          >
            <p className="font-display text-sm font-bold text-[#5b3a2e]">
              {new Date(selectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {selectedGoals.length === 0 ? (
              <p className="mt-1 text-xs font-semibold text-[#5b3a2e]/65">Nothing scheduled this day 🌸</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {selectedGoals.map(g => {
                  const done = isDoneOn(g, selectedDay)
                  return (
                    <li key={g.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white/70 px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={done}
                          disabled={busy === g.id}
                          onChange={() => toggleDay(g, selectedDay)}
                          className="accent-peachy-300"
                        />
                        <span className={`text-xs font-semibold ${done ? 'text-[#5b3a2e]/40 line-through' : 'text-[#5b3a2e]'}`}>
                          {g.isRecurring ? '↻ ' : ''}{g.title}
                        </span>
                        {g.isRecurring && g.recurrenceEnd && (
                          <span className="ml-auto text-[10px] font-bold text-peachy-300">until {g.recurrenceEnd}</span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        )}
      </div>
    </section>
  )
}
