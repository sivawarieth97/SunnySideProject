'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { getToken, authHeaders } from '@/lib/auth'
import { currentPeriod, periodAtOffset } from '@/lib/period'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { useGoals, mutateGoals, refreshGoals } from '@/lib/useGoals'
import type { Goal } from '@/app/page'
import PlannerTreeNode from '@/components/PlannerTreeNode'
import AIPlanner from '@/components/AIPlanner'
import Coin from '@/components/ui/Coin'

type Level = 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'
const PRIORITY_CYCLE: Record<string, string> = { LOW: 'MEDIUM', MEDIUM: 'HIGH', HIGH: 'LOW' }

// One quadrant of the "seed sub-goals" grid — lets you queue up any number of
// titles for a given level (not just one) before the yearly goal is created.
function QuickAddQuadrant({
  emoji, label, placeholder, values, onAdd, onRemove,
}: {
  emoji: string
  label: string
  placeholder: string
  values: string[]
  onAdd: (title: string) => void
  onRemove: (index: number) => void
}) {
  const [draft, setDraft] = useState('')

  // This grid sits inside the outer "new yearly goal" <form>, so this control can't
  // be a nested <form> (invalid HTML, breaks hydration) — plain click/Enter instead.
  function handleAdd() {
    if (!draft.trim()) return
    onAdd(draft.trim())
    setDraft('')
  }

  return (
    <div className="rounded-xl border border-dashed border-blossom-200 bg-white/60 p-2">
      <label className="text-[11px] font-bold text-peachy-300">{emoji} {label}</label>
      <div className="mt-1 flex gap-1">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-sunny-200 bg-sunny-50 px-2 py-1.5 text-xs
                     font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg bg-gradient-to-r from-peachy-300 to-blossom-300 px-2.5 text-xs
                     font-bold text-white shadow-cute disabled:opacity-40"
        >
          +
        </button>
      </div>
      {values.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {values.map((v, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-1 rounded-lg bg-sunny-50 px-2 py-1 text-[11px] font-semibold text-[#5b3a2e]"
            >
              <span className="min-w-0 truncate">{v}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-blossom-300 hover:text-blossom-400"
                aria-label={`Remove ${v}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function PlannerPage() {
  const router = useRouter()
  // Shared store — same data (and same single fetch) as the home page and calendar.
  const { goals, loaded, error: loadError } = useGoals()
  const [error, setError]     = useState('')
  const [newYearly, setNewYearly] = useState('')
  const [newYearlyDesc, setNewYearlyDesc] = useState('')
  const [addingYearly, setAddingYearly] = useState(false)
  // Collapsed by default so the goal tree is the first thing you see.
  const [showYearForm, setShowYearForm] = useState(false)
  // Optional same-time quick-adds shown as a grid in the "new yearly goal" box —
  // lets you queue up any number of quarterly/monthly/weekly/daily goals (and even
  // more yearly goals) alongside the main one, instead of adding them one at a
  // time in the tree later.
  const [quickQuarterly, setQuickQuarterly] = useState<string[]>([])
  const [quickMonthly, setQuickMonthly]     = useState<string[]>([])
  const [quickWeekly, setQuickWeekly]       = useState<string[]>([])
  const [quickDaily, setQuickDaily]         = useState<string[]>([])
  const [quickYearly, setQuickYearly]       = useState<string[]>([])

  useEffect(() => {
    if (!getToken()) router.replace('/login')
  }, [router])

  // Talks to the API for creating a goal and returns the created goal (or null on
  // failure) without refreshing the list — used when a batch of goals needs to be
  // created together (see handleAddYearly) so we only refetch once at the end.
  async function createGoalRaw(level: Level, parentGoalId: string | null, title: string, description?: string | null, period?: string) {
    try {
      const res = await fetch('/api/goals', {
        method:  'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title, description: description ?? null, level, priority: 'MEDIUM',
          period: period ?? currentPeriod(level), parentGoalId,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not create goal')
        return null
      }
      notifyGoalsChanged()
      return await res.json() as Goal
    } catch {
      setError('Could not reach the server')
      return null
    }
  }

  // This is the one place most callers use — every node's inline "+ add sub-goal"
  // box funnels through here, creating one goal and refreshing the list.
  async function createGoal(level: Level, parentGoalId: string | null, title: string, description?: string | null) {
    const goal = await createGoalRaw(level, parentGoalId, title, description)
    if (goal) await refreshGoals()
    return goal
  }

  async function handleAddYearly(e: React.FormEvent) {
    e.preventDefault()
    if (!newYearly.trim()) return
    setAddingYearly(true)
    try {
      const yearlyGoal = await createGoalRaw('YEARLY', null, newYearly.trim(), newYearlyDesc.trim() || null)
      if (yearlyGoal) {
        for (const title of quickQuarterly) await createGoalRaw('QUARTERLY', yearlyGoal.id, title)
        for (const title of quickMonthly)   await createGoalRaw('MONTHLY', yearlyGoal.id, title)
        for (const title of quickWeekly)    await createGoalRaw('WEEKLY', yearlyGoal.id, title)
        for (const title of quickDaily)     await createGoalRaw('DAILY', yearlyGoal.id, title)
        for (const title of quickYearly)    await createGoalRaw('YEARLY', null, title)

        setNewYearly('')
        setNewYearlyDesc('')
        setQuickQuarterly([])
        setQuickMonthly([])
        setQuickWeekly([])
        setQuickDaily([])
        setQuickYearly([])
        await refreshGoals()
      }
    } finally {
      setAddingYearly(false)
    }
  }

  async function handleAddChild(parent: Goal, level: Level, title: string, description?: string | null) {
    await createGoal(level, parent.id, title, description)
  }

  // Toggles are optimistic — the UI flips instantly, the server call follows,
  // and notifyGoalsChanged() reconciles every view afterwards.
  async function toggleComplete(g: Goal) {
    const next = g.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    mutateGoals(prev => prev.map(x => x.id === g.id ? { ...x, status: next } : x))
    await fetch(`/api/goals/${g.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        title: g.title, description: g.description, level: g.level, priority: g.priority,
        status: next,
      }),
    })
    notifyGoalsChanged()
  }

  async function cyclePriority(g: Goal) {
    const next = PRIORITY_CYCLE[g.priority] ?? 'MEDIUM'
    mutateGoals(prev => prev.map(x => x.id === g.id ? { ...x, priority: next } : x))
    await fetch(`/api/goals/${g.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ title: g.title, description: g.description, level: g.level, priority: next }),
    })
    notifyGoalsChanged()
  }

  async function saveGoal(g: Goal, patch: { title: string; description: string | null }) {
    mutateGoals(prev => prev.map(x => x.id === g.id ? { ...x, title: patch.title, description: patch.description } : x))
    await fetch(`/api/goals/${g.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ title: patch.title, description: patch.description, level: g.level, priority: g.priority }),
    })
    notifyGoalsChanged()
  }

  async function deleteGoal(g: Goal) {
    const childCount = goals.filter(x => x.parentGoalId === g.id).length
    const warning = childCount > 0
      ? `Delete "${g.title}" and everything nested under it?`
      : `Delete "${g.title}"?`
    if (!confirm(warning)) return
    mutateGoals(prev => prev.filter(x => x.id !== g.id && x.parentGoalId !== g.id))
    await fetch(`/api/goals/${g.id}`, { method: 'DELETE', headers: authHeaders() })
    notifyGoalsChanged()
  }

  const yearlyGoals = goals
    .filter(g => g.level === 'YEARLY' && !g.parentGoalId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="space-y-5">

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2.5 font-display text-2xl font-extrabold text-peachy-400">
            <Coin emoji="🎯" gradient="from-sunny-200 to-blossom-200" size="md" />
            Life Goal Planner
          </h2>
          <p className="pl-[2.9rem] text-sm font-medium text-[#5b3a2e]/55">
            Year goals, nested down into quarters, months, and days ✨
          </p>
        </div>
        <Link href="/">
          <motion.span
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="inline-block rounded-full border border-blossom-100 bg-white/70 px-4 py-2
                       text-sm font-bold text-blossom-300 transition hover:bg-blossom-50"
          >
            ← My Goals
          </motion.span>
        </Link>
      </div>

      <AIPlanner createGoalRaw={createGoalRaw} periodAtOffset={periodAtOffset} onCreated={refreshGoals} />

      <div className="rounded-cute border border-dashed border-blossom-200 bg-white/60 p-4">
        <button
          type="button"
          onClick={() => setShowYearForm(v => !v)}
          aria-expanded={showYearForm}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2">
            <Coin emoji="🌱" gradient="from-blossom-200 to-blossom-300" />
            <span className="min-w-0">
              <span className="font-display text-sm font-bold text-blossom-400">Plant a year goal</span>
              <span className="ml-2 hidden text-xs font-semibold text-[#5b3a2e]/55 sm:inline">
                starts today, grows over the year
              </span>
            </span>
          </span>
          <span className="text-blossom-300">{showYearForm ? '▾' : '▸'}</span>
        </button>

        {showYearForm && (
      <form
        onSubmit={handleAddYearly}
        className="mt-3 space-y-2.5"
      >
        <input
          value={newYearly}
          onChange={e => setNewYearly(e.target.value)}
          placeholder="e.g. Get promoted to Senior Engineer"
          className="w-full rounded-xl border border-sunny-200 bg-sunny-50 px-3 py-2 text-sm
                     font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
        />
        <textarea
          value={newYearlyDesc}
          onChange={e => setNewYearlyDesc(e.target.value)}
          placeholder="Description (optional) — why does this matter this year?"
          rows={2}
          className="w-full resize-none rounded-xl border border-sunny-200 bg-sunny-50 px-3 py-2 text-sm
                     font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
        />

        <div>
          <p className="mb-1.5 text-xs font-bold text-peachy-300">+ Optionally seed some sub-goals right away (add as many as you like)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <QuickAddQuadrant
              emoji="🍂" label="Quarterly" placeholder="e.g. Ship the redesign"
              values={quickQuarterly}
              onAdd={t => setQuickQuarterly(v => [...v, t])}
              onRemove={i => setQuickQuarterly(v => v.filter((_, idx) => idx !== i))}
            />
            <QuickAddQuadrant
              emoji="⭐" label="Yearly" placeholder="e.g. Another 1-year goal"
              values={quickYearly}
              onAdd={t => setQuickYearly(v => [...v, t])}
              onRemove={i => setQuickYearly(v => v.filter((_, idx) => idx !== i))}
            />
            <QuickAddQuadrant
              emoji="🌙" label="Monthly" placeholder="e.g. Finish chapter 1"
              values={quickMonthly}
              onAdd={t => setQuickMonthly(v => [...v, t])}
              onRemove={i => setQuickMonthly(v => v.filter((_, idx) => idx !== i))}
            />
            <QuickAddQuadrant
              emoji="📆" label="Weekly" placeholder="e.g. Gym 3x this week"
              values={quickWeekly}
              onAdd={t => setQuickWeekly(v => [...v, t])}
              onRemove={i => setQuickWeekly(v => v.filter((_, idx) => idx !== i))}
            />
            <QuickAddQuadrant
              emoji="☀️" label="Daily" placeholder="e.g. Read 10 pages"
              values={quickDaily}
              onAdd={t => setQuickDaily(v => [...v, t])}
              onRemove={i => setQuickDaily(v => v.filter((_, idx) => idx !== i))}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={addingYearly || !newYearly.trim()}
          className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                     px-5 py-2 font-display text-sm font-bold text-white shadow-cute disabled:opacity-40"
        >
          {addingYearly ? 'Creating...' : '✨ Create yearly goal'}
        </button>
      </form>
        )}
      </div>

      {(error || loadError) && <p className="text-sm font-semibold text-blossom-400">{error || loadError}</p>}

      {!loaded && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-cute bg-blossom-50" />
          ))}
        </div>
      )}

      {loaded && yearlyGoals.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full
                          bg-gradient-to-br from-blossom-50 to-peachy-50 text-3xl shadow-sm">
            🌱
          </div>
          <p className="mt-3 text-sm font-semibold text-[#5b3a2e]/60">No yearly goals yet.</p>
          <p className="text-sm font-medium text-[#5b3a2e]/50">Plant one above to start growing your year!</p>
        </div>
      )}

      {loaded && yearlyGoals.length > 0 && (
        <div className="space-y-3">
          {yearlyGoals.map(goal => (
            <PlannerTreeNode
              key={goal.id}
              goal={goal}
              allGoals={goals}
              onToggleComplete={toggleComplete}
              onCyclePriority={cyclePriority}
              onDelete={deleteGoal}
              onSave={saveGoal}
              onAddChild={handleAddChild}
            />
          ))}
        </div>
      )}

    </div>
  )
}
