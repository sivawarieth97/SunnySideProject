'use client'

import { useState } from 'react'
import Coin from '@/components/ui/Coin'
import type { AIPlan } from '@/types/aiPlan'

type Level = 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'

type CreatedGoal = { id: string }

type Props = {
  // Matches planner/page.tsx's createGoalRaw — creates one goal without
  // refetching the whole list (so a batch of plan items doesn't refetch N times).
  createGoalRaw: (
    level: Level,
    parentGoalId: string | null,
    title: string,
    description?: string | null,
    period?: string
  ) => Promise<CreatedGoal | null>
  periodAtOffset: (level: Level, offset: number) => string
  onCreated: () => Promise<void> | void
}

// "Day 25" → the actual calendar date it lands on (day 1 = today).
function dateForDay(day: number): string {
  const d = new Date()
  d.setDate(d.getDate() + (day - 1))
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function AIPlanner({ createGoalRaw, periodAtOffset, onCreated }: Props) {
  const [open, setOpen]         = useState(false)
  const [goalText, setGoalText] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [plan, setPlan]         = useState<AIPlan | null>(null)
  // Checked-state key: "w<weekIndex>" for a week, "w<weekIndex>-d<dayIndex>" for a day.
  const [checked, setChecked]   = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!goalText.trim()) return
    setLoading(true)
    setError('')
    setPlan(null)
    try {
      const res = await fetch('/api/ai-plan', {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ goal: goalText.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not generate a plan.')
        return
      }
      const nextPlan = data as AIPlan
      setPlan(nextPlan)
      const initialChecked: Record<string, boolean> = {}
      nextPlan.weeks.forEach((week, w) => {
        initialChecked[`w${w}`] = true
        week.days.forEach((_, d) => { initialChecked[`w${w}-d${d}`] = true })
      })
      setChecked(initialChecked)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  // Toggling a whole week also toggles all its days — cherry-picking single
  // days back on afterwards still works.
  function toggleWeek(w: number, value: boolean, dayCount: number) {
    setChecked(c => {
      const next = { ...c, [`w${w}`]: value }
      for (let d = 0; d < dayCount; d++) next[`w${w}-d${d}`] = value
      return next
    })
  }

  const selectedCount = plan
    ? plan.weeks.reduce((sum, week, w) => sum + week.days.filter((_, d) => checked[`w${w}-d${d}`]).length, 0)
    : 0

  // Real progress while the plan's goals are created one by one — a 21-day
  // plan is ~24 sequential requests, so "Adding 12/24..." beats a static label.
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  async function handleCreate() {
    if (!plan) return
    setCreating(true)
    let done = 0
    const total = 1 + selectedCount +
      plan.weeks.filter((week, w) => checked[`w${w}`] || week.days.some((_, d) => checked[`w${w}-d${d}`])).length
    setProgress({ done: 0, total })
    const tick = () => setProgress({ done: ++done, total })

    try {
      const container = await createGoalRaw('YEARLY', null, plan.title, plan.description)
      if (!container) return
      tick()

      for (let w = 0; w < plan.weeks.length; w++) {
        const week = plan.weeks[w]
        const checkedDays = week.days.filter((_, d) => checked[`w${w}-d${d}`])
        const wantWeek = checked[`w${w}`] || checkedDays.length > 0
        if (!wantWeek) continue

        // The week goal groups its days in the planner tree; its description
        // carries the week's end-of-week target.
        const weekGoal = await createGoalRaw(
          'WEEKLY', container.id, week.title, week.target ?? null, periodAtOffset('WEEKLY', w)
        )
        tick()
        const parentId = weekGoal?.id ?? container.id

        for (const day of checkedDays) {
          const description = day.deliverable
            ? `${day.plan}\n\nDeliverable: ${day.deliverable}`
            : day.plan
          await createGoalRaw(
            'DAILY', parentId, `Day ${day.day}: ${day.title}`, description,
            periodAtOffset('DAILY', day.day - 1)
          )
          tick()
        }
      }

      await onCreated()
      setPlan(null)
      setGoalText('')
      setOpen(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-cute border border-dashed border-peachy-200 bg-white/60 p-4">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-2">
          <Coin emoji="🪄" gradient="from-peachy-300 to-blossom-300" />
          <span className="min-w-0">
            <span className="font-display text-sm font-bold text-peachy-400">Magic Planner</span>
            <span className="ml-2 hidden text-xs font-semibold text-[#5b3a2e]/55 sm:inline">
              whisper a goal, get your days mapped out
            </span>
          </span>
        </span>
        <span className="text-peachy-300">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={goalText}
              onChange={e => setGoalText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleGenerate(e)
                }
              }}
              placeholder="e.g. learn DSA in 3 weeks · run a 10k by October · read 12 books this year"
              className="w-full rounded-xl border border-sunny-200 bg-sunny-50 px-3 py-2 text-sm
                         font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !goalText.trim()}
              className="shrink-0 rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-5 py-2
                         font-display text-sm font-bold text-white shadow-cute disabled:opacity-40"
            >
              {loading ? '🪄 Sketching...' : '✨ Draft my plan'}
            </button>
          </div>

          {loading && (
            <div className="space-y-2 rounded-xl border border-sunny-200 bg-sunny-50/60 p-3">
              <p className="text-xs font-semibold text-peachy-400">
                Building a day-by-day plan — this can take ~15–30 seconds for longer timeframes...
              </p>
              <div className="h-4 w-2/5 animate-pulse rounded-full bg-sunny-100" />
              <div className="h-3 w-3/5 animate-pulse rounded-full bg-sunny-100" />
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-1.5 rounded-xl border border-white bg-white/70 p-2.5">
                  <div className="h-3 w-1/3 animate-pulse rounded-full bg-peachy-100" />
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-sunny-100" />
                  <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-sunny-100" />
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm font-semibold text-blossom-400">{error}</p>}

          {plan && (
            <div className="space-y-3 rounded-xl border border-sunny-200 bg-sunny-50/60 p-3">
              <div>
                <p className="font-display text-sm font-bold text-[#5b3a2e]">{plan.title}</p>
                {plan.description && (
                  <p className="mt-0.5 text-xs font-semibold text-[#5b3a2e]/60">{plan.description}</p>
                )}
              </div>

              {plan.weeks.map((week, w) => (
                <div key={w} className="rounded-xl border border-white bg-white/70 p-2.5">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!!checked[`w${w}`]}
                      onChange={e => toggleWeek(w, e.target.checked, week.days.length)}
                      className="mt-0.5 accent-peachy-300"
                    />
                    <span className="min-w-0">
                      <span className="font-display text-xs font-bold text-[#5b3a2e]">📆 {week.title}</span>
                      {week.target && (
                        <span className="mt-0.5 block text-[11px] font-semibold text-[#5b3a2e]/55">
                          🎯 By end of week: {week.target}
                        </span>
                      )}
                    </span>
                  </label>

                  {week.days.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-dashed border-peachy-200 pl-3">
                      {week.days.map((day, d) => (
                        <li key={d}>
                          <label className="flex items-start gap-2 rounded-lg bg-sunny-50/70 px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={!!checked[`w${w}-d${d}`]}
                              onChange={e => setChecked(c => ({ ...c, [`w${w}-d${d}`]: e.target.checked }))}
                              className="mt-0.5 accent-peachy-300"
                            />
                            <span className="min-w-0 text-xs font-semibold text-[#5b3a2e]">
                              <span className="font-bold">Day {day.day}</span>
                              <span className="ml-1.5 text-[10px] font-bold text-peachy-300">{dateForDay(day.day)}</span>
                              <span className="ml-1.5">{day.title}</span>
                              <span className="mt-0.5 block text-[11px] font-normal text-[#5b3a2e]/60">{day.plan}</span>
                              {day.deliverable && (
                                <span className="mt-0.5 block text-[11px] font-semibold text-peachy-400">
                                  📦 {day.deliverable}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              {plan.sources.length > 0 && (
                <div className="border-t border-sunny-200 pt-2">
                  <p className="text-[10px] font-bold text-peachy-300">🔎 Based on</p>
                  <ul className="mt-1 space-y-0.5">
                    {plan.sources.map((s, i) => (
                      <li key={i} className="truncate text-[10px] font-semibold text-[#5b3a2e]/50">
                        <a href={s.link} target="_blank" rel="noreferrer" className="hover:text-peachy-400 hover:underline">
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || selectedCount === 0}
                  className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-4 py-1.5
                             font-display text-xs font-bold text-white shadow-cute disabled:opacity-40"
                >
                  {creating
                    ? `Adding ${progress.done}/${progress.total}...`
                    : `✅ Add ${selectedCount} day${selectedCount !== 1 ? 's' : ''} to my goals`}
                </button>
                <button
                  type="button"
                  onClick={() => setPlan(null)}
                  className="px-3 py-1.5 text-xs font-bold text-blossom-300 hover:text-blossom-400"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
