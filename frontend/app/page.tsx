'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { getToken, authHeaders } from '@/lib/auth'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { useGoals, mutateGoals } from '@/lib/useGoals'
import { periodForDate, isPast } from '@/lib/period'
import type { Goal, GoalLevel } from '@/types'
import CreateGoalForm from '@/components/CreateGoalForm'
import GoalCard from '@/components/GoalCard'
import CategoryCard from '@/components/CategoryCard'
import Coin from '@/components/ui/Coin'

// Canonical Goal type lives in types/index.ts; re-exported here so the many
// existing `import type { Goal } from '@/app/page'` imports keep working.
export type { Goal }

export default function Home() {
  const router = useRouter()
  const { goals: allGoals, loaded, error } = useGoals()
  const [showForm, setShowForm]         = useState(false)
  const [activeLevel, setActiveLevel]   = useState('ALL')
  const [query, setQuery]               = useState('')
  const [rollingOver, setRollingOver]   = useState(false)
  const [rolloverMsg, setRolloverMsg]   = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [busyToday, setBusyToday]       = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) router.replace('/login')
  }, [router])

  // Grace-period delete: the card disappears immediately (filtered from the
  // visible list), but the actual DELETE only fires after 5s — Undo just
  // clears the pending state, no API call needed.
  const [pendingDelete, setPendingDelete] = useState<{ goal: Goal; timer: number } | null>(null)
  const goals = pendingDelete ? allGoals.filter(g => g.id !== pendingDelete.goal.id) : allGoals

  async function finalizeDelete(id: string) {
    try {
      await fetch(`/api/goals/${id}`, { method: 'DELETE', headers: authHeaders() })
      notifyGoalsChanged()
    } catch { /* goal reappears on next refresh if this failed */ }
  }

  function handleRequestDelete(goal: Goal) {
    if (pendingDelete) {
      clearTimeout(pendingDelete.timer)
      finalizeDelete(pendingDelete.goal.id)
    }
    const timer = window.setTimeout(() => {
      finalizeDelete(goal.id)
      setPendingDelete(null)
    }, 5000)
    setPendingDelete({ goal, timer })
  }

  function undoDelete() {
    if (!pendingDelete) return
    clearTimeout(pendingDelete.timer)
    setPendingDelete(null)
  }

  function handleCreated(goal: Goal) {
    mutateGoals(prev => [goal, ...prev])
    setShowForm(false)
  }

  function handleUpdated(updated: Goal) {
    mutateGoals(prev => prev.map(g => g.id === updated.id ? updated : g))
  }

  async function handleRollover() {
    setRollingOver(true)
    setRolloverMsg('')
    try {
      const res = await fetch('/api/goals/rollover', { method: 'POST', headers: authHeaders() })
      if (res.status === 401) { router.replace('/login'); return }
      const text = await res.text()
      if (!res.ok) {
        setRolloverMsg(`Error ${res.status}: ${text}`)
        return
      }
      const data = JSON.parse(text)
      const count: number = data.rolledOver ?? 0
      if (count === 0) {
        setRolloverMsg('No past goals to roll over! ✨')
      } else {
        setRolloverMsg(`↻ Rolled over ${count} goal${count > 1 ? 's' : ''} into the current period! 🎀`)
        notifyGoalsChanged()
      }
    } catch (e) {
      setRolloverMsg(`Rollover failed: ${e}`)
    } finally {
      setRollingOver(false)
      setTimeout(() => setRolloverMsg(''), 4000)
    }
  }

  // Clicking a hub card filters to that level; clicking the same card again
  // (or the ✕ next to the goal count) returns to viewing everything.
  function jumpToLevel(level: string) {
    setActiveLevel(prev => (prev === level ? 'ALL' : level))
    document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ---- Today strip: today's recurring habits + one-offs due today ----
  const todayIso = periodForDate('DAILY', new Date())
  const todayItems = goals.filter(g => {
    if (g.level !== 'DAILY') return false
    if (!g.isRecurring) return g.period === todayIso
    const start = g.originalPeriod ?? g.period
    if (start && todayIso < start) return false
    if (g.recurrenceEnd && todayIso > g.recurrenceEnd) return false
    return true
  })

  function isDoneToday(g: Goal): boolean {
    return g.isRecurring ? g.completedPeriods.includes(todayIso) : g.status === 'COMPLETED'
  }

  // Optimistic: flip locally first, then tell the server, then reconcile.
  async function toggleToday(g: Goal) {
    setBusyToday(g.id)
    const done = isDoneToday(g)
    mutateGoals(prev => prev.map(x => {
      if (x.id !== g.id) return x
      return g.isRecurring
        ? { ...x, completedPeriods: done ? x.completedPeriods.filter(p => p !== todayIso) : [...x.completedPeriods, todayIso] }
        : { ...x, status: done ? 'PENDING' : 'COMPLETED' }
    }))
    try {
      if (g.isRecurring) {
        if (done) {
          await fetch(`/api/goals/${g.id}/completions/${todayIso}`, { method: 'DELETE', headers: authHeaders() })
        } else {
          await fetch(`/api/goals/${g.id}/completions`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify({ period: todayIso }),
          })
        }
      } else {
        await fetch(`/api/goals/${g.id}`, {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({
            title: g.title, description: g.description, level: g.level, priority: g.priority,
            status: done ? 'PENDING' : 'COMPLETED',
          }),
        })
      }
      notifyGoalsChanged()
    } finally {
      setBusyToday(null)
    }
  }

  // ---- Rollover nudge: past-due pending one-offs ----
  const overdueCount = goals.filter(g =>
    !g.isRecurring && g.status === 'PENDING' && g.period &&
    isPast(g.period, g.level as GoalLevel)
  ).length

  const filteredGoals = goals
    .filter(g => activeLevel === 'ALL' || g.level === activeLevel)
    .filter(g => {
      if (!query.trim()) return true
      const q = query.trim().toLowerCase()
      return g.title.toLowerCase().includes(q) || (g.description ?? '').toLowerCase().includes(q)
    })

  return (
    <div className="flex flex-col gap-6 sm:flex-row">

      {/* Side panel */}
      <aside className="flex shrink-0 flex-row gap-2 sm:w-40 sm:flex-col">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowForm(v => !v)}
          className="w-full rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                     px-4 py-2 font-display text-sm font-bold text-white shadow-cute"
        >
          {showForm ? '✕ Cancel' : '✨ New Goal'}
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleRollover}
          disabled={rollingOver}
          title="Move unfinished past goals into the current period"
          className="w-full rounded-full border border-sunny-300 bg-sunny-50 px-4 py-2
                     text-sm font-bold text-peachy-400 transition hover:bg-sunny-100 disabled:opacity-40"
        >
          {rollingOver ? '↻ Rolling...' : '↻ Rollover'}
        </motion.button>
      </aside>

      <div className="min-w-0 flex-1 space-y-8">

      {/* Rollover nudge — surfaces slipped goals without hunting for the button */}
      <AnimatePresence>
        {overdueCount > 0 && !nudgeDismissed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sunny-300
                       bg-sunny-50 px-4 py-2.5 text-sm font-semibold text-[#5b3a2e]/75"
          >
            <span>
              ⏳ {overdueCount} goal{overdueCount > 1 ? 's' : ''} slipped past {overdueCount > 1 ? 'their dates' : 'its date'}.
            </span>
            <span className="flex gap-2">
              <button
                onClick={handleRollover}
                disabled={rollingOver}
                className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-3 py-1
                           font-display text-xs font-bold text-white shadow-cute disabled:opacity-40"
              >
                {rollingOver ? 'Rolling...' : '↻ Roll them over'}
              </button>
              <button
                onClick={() => setNudgeDismissed(true)}
                className="px-2 py-1 text-xs font-bold text-[#5b3a2e]/45 hover:text-[#5b3a2e]/70"
              >
                Later
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Today — the daily loop, front and center */}
      {todayItems.length > 0 && (
        <div className="rounded-cute border border-sunny-200 bg-white/70 p-4 shadow-sm backdrop-blur">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-peachy-400">
            <Coin emoji="☀️" gradient="from-sunny-200 to-sunny-300" />
            Today
            <span className="text-sm font-bold text-[#5b3a2e]/40">
              {todayItems.filter(isDoneToday).length}/{todayItems.length} done
            </span>
          </h2>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {todayItems.map(g => {
              const done = isDoneToday(g)
              return (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-sunny-50/70 px-2.5 py-1.5
                                    transition hover:bg-sunny-100/70">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={busyToday === g.id}
                      onChange={() => toggleToday(g)}
                      className="accent-peachy-300"
                    />
                    <span className={`min-w-0 truncate text-sm font-semibold
                                      ${done ? 'text-[#5b3a2e]/40 line-through' : 'text-[#5b3a2e]'}`}>
                      {g.isRecurring ? '↻ ' : ''}{g.title}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Hub — jump straight to a level, or open the full breakdown in the Life Planner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CategoryCard
          title="Daily" emoji="☀️" gradient="from-sunny-200 to-sunny-300"
          imageSrc="/category-daily.jpg"
          onClick={() => jumpToLevel('DAILY')}
          links={[{ label: "Today's goals", emoji: '☀️', onClick: () => jumpToLevel('DAILY') }]}
        />
        <CategoryCard
          title="Weekly" emoji="📆" gradient="from-sunny-100 to-peachy-200"
          imageSrc="/category-weekly.jpg"
          onClick={() => jumpToLevel('WEEKLY')}
          links={[{ label: 'This week', emoji: '📆', onClick: () => jumpToLevel('WEEKLY') }]}
        />
        <CategoryCard
          title="Monthly" emoji="🌙" gradient="from-peachy-200 to-peachy-300"
          imageSrc="/category-monthly.jpg"
          onClick={() => jumpToLevel('MONTHLY')}
          links={[{ label: 'This month', emoji: '🌙', onClick: () => jumpToLevel('MONTHLY') }]}
        />
        <CategoryCard
          title="Quarterly" emoji="🍂" gradient="from-blossom-200 to-blossom-300"
          imageSrc="/category-quarterly.jpg"
          onClick={() => jumpToLevel('QUARTERLY')}
          links={[{ label: 'This quarter', emoji: '🍂', onClick: () => jumpToLevel('QUARTERLY') }]}
        />
        <CategoryCard
          title="Yearly" emoji="⭐" gradient="from-sunny-300 to-blossom-300"
          imageSrc="/category-yearly.jpg"
          onClick={() => jumpToLevel('YEARLY')}
          links={[{ label: 'This year', emoji: '⭐', onClick: () => jumpToLevel('YEARLY') }]}
        />
        <CategoryCard
          title="Life Planner" emoji="🗺️" gradient="from-sunny-200 to-blossom-200"
          imageSrc="/category-planner.jpg"
          href="/planner"
          links={[
            { label: 'Yearly', emoji: '⭐', href: '/planner' },
            { label: 'Quarterly', emoji: '🍂', href: '/planner' },
            { label: 'Monthly & daily', emoji: '🌙', href: '/planner' },
          ]}
        />
      </div>

      {/* Overview */}
      <div id="overview" className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-peachy-400">
            <Coin emoji="🌈" />
            Your goals
          </h2>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="🔍 Search goals..."
            className="w-44 rounded-full border border-sunny-200 bg-white/70 px-3 py-1.5 text-xs
                       font-semibold text-[#5b3a2e] outline-none transition
                       focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100 sm:w-56"
          />
        </div>
        <div className="flex items-center gap-2 pl-9">
          <p className="text-sm font-semibold text-blossom-300">
            {filteredGoals.length} goal{filteredGoals.length !== 1 ? 's' : ''}
            {activeLevel !== 'ALL' && ` · ${activeLevel}`}
            {query.trim() && ` · “${query.trim()}”`}
          </p>
          {activeLevel !== 'ALL' && (
            <button
              onClick={() => setActiveLevel('ALL')}
              className="rounded-full border border-blossom-100 bg-white/70 px-2.5 py-0.5 text-xs
                         font-bold text-blossom-300 transition hover:bg-blossom-50"
            >
              ✕ show all
            </button>
          )}
        </div>
      </div>

      {/* Delete undo toast */}
      <AnimatePresence>
        {pendingDelete && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-3 rounded-2xl border border-blossom-200
                       bg-blossom-50 px-4 py-2 text-sm font-bold text-blossom-400"
          >
            <span className="min-w-0 truncate">🗑 Deleted “{pendingDelete.goal.title}”</span>
            <button
              onClick={undoDelete}
              className="shrink-0 rounded-full border border-blossom-300 bg-white px-3 py-0.5
                         text-xs font-bold text-blossom-400 transition hover:bg-blossom-100"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rollover feedback */}
      <AnimatePresence>
        {rolloverMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-sunny-200 bg-sunny-50 px-4 py-2 text-sm font-bold text-peachy-400"
          >
            {rolloverMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-cute border border-blossom-100 bg-white/70 p-5 shadow-cute backdrop-blur">
              <h3 className="mb-3 font-display text-base font-bold text-peachy-400">New Goal 🌟</h3>
              <CreateGoalForm onCreated={handleCreated} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="text-sm font-semibold text-blossom-400">{error}</p>}

      {!loaded && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 animate-pulse rounded-cute bg-blossom-50" />
          ))}
        </div>
      )}

      {loaded && filteredGoals.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full
                          bg-gradient-to-br from-sunny-100 to-blossom-50 text-3xl shadow-sm">
            🌸
          </div>
          <p className="mt-3 text-sm font-semibold text-[#5b3a2e]/60">
            No {activeLevel !== 'ALL' ? activeLevel.toLowerCase() : ''} goals{query.trim() ? ` matching “${query.trim()}”` : ''} yet.
          </p>
          <p className="text-sm font-medium text-[#5b3a2e]/50">
            Tap <strong className="font-bold text-peachy-400">✨ New Goal</strong> to add one!
          </p>
        </div>
      )}

      {loaded && filteredGoals.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence>
            {filteredGoals.map((goal, i) => (
              <motion.div
                key={goal.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.04 }}
              >
                <GoalCard
                  goal={goal}
                  onUpdated={handleUpdated}
                  onRequestDelete={handleRequestDelete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      </div>
    </div>
  )
}
