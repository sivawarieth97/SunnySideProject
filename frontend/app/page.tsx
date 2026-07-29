'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { authHeaders } from '@/lib/auth'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { useGoals, mutateGoals } from '@/lib/useGoals'
import { currentPeriod, isPast } from '@/lib/period'
import { rolloverBreakdown, type RolloverSummary } from '@/lib/rollover'
import type { Goal, GoalLevel } from '@/types'
import CreateGoalForm from '@/components/CreateGoalForm'
import CurrentPeriodList from '@/components/CurrentPeriodList'
import GoalCard from '@/components/GoalCard'
import CategoryCard from '@/components/CategoryCard'
import Coin from '@/components/ui/Coin'

// Canonical Goal type lives in types/index.ts; re-exported here so the many
// existing `import type { Goal } from '@/app/page'` imports keep working.
export type { Goal }

const CURRENT_GROUPS: Array<{
  level: GoalLevel
  title: string
  subtitle: string
  emoji: string
}> = [
  { level: 'DAILY', title: 'Today', subtitle: 'Daily habits', emoji: '☀️' },
  { level: 'WEEKLY', title: 'This week', subtitle: 'Weekly goals', emoji: '📆' },
  { level: 'MONTHLY', title: 'This month', subtitle: 'Monthly goals', emoji: '🌙' },
  { level: 'QUARTERLY', title: 'This quarter', subtitle: 'Quarterly goals', emoji: '🍂' },
  { level: 'YEARLY', title: 'This year', subtitle: 'Yearly goals', emoji: '⭐' },
]

export default function Home() {
  const router = useRouter()
  const { goals: allGoals, loaded, error } = useGoals()
  const [showForm, setShowForm]         = useState(false)
  const [activeLevel, setActiveLevel]   = useState('ALL')
  const [query, setQuery]               = useState('')
  const [rollingOver, setRollingOver]   = useState(false)
  const [rolloverMsg, setRolloverMsg]   = useState('')
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [busyCurrent, setBusyCurrent]   = useState<string | null>(null)
  const [showFloatingNewGoal, setShowFloatingNewGoal] = useState(false)
  const currentFocusActionsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (loaded && error === 'UNAUTHORIZED') {
      router.replace('/login')
    }
  }, [loaded, error, router])

  // A modal should keep the page underneath still. Escape also gives keyboard
  // users a predictable way to dismiss it.
  useEffect(() => {
    if (!showForm) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowForm(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [showForm])

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

  async function updateCurrentItem(
    goal: Goal,
    changes: { title: string; description: string | null },
  ) {
    const response = await fetch(`/api/goals/${goal.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        title: changes.title,
        description: changes.description,
        level: goal.level,
        priority: goal.priority,
      }),
    })

    if (response.status === 401) {
      router.replace('/login')
      throw new Error('Your session expired. Please sign in again.')
    }

    const text = await response.text()
    if (!response.ok) {
      let message = 'Could not save changes'
      try {
        message = JSON.parse(text).error ?? message
      } catch { /* keep the friendly fallback for non-JSON responses */ }
      throw new Error(message)
    }

    handleUpdated(JSON.parse(text))
    notifyGoalsChanged()
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
      const data = JSON.parse(text) as RolloverSummary
      const count = data.rolledOver ?? 0
      if (count === 0) {
        setRolloverMsg('No past goals to roll over! ✨')
      } else {
        const breakdown = rolloverBreakdown(data)
        setRolloverMsg(
          `↻ Carried ${count} goal${count > 1 ? 's' : ''} into the current period${breakdown ? ` (${breakdown})` : ''}. History was saved. 🎀`
        )
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

  // ---- Current focus: active goals grouped by their natural time period ----
  function goalsForCurrentPeriod(level: GoalLevel, period: string): Goal[] {
    return goals.filter(g => {
      if (g.level !== level) return false
      if (!g.isRecurring) return g.period === period

      const start = g.originalPeriod ?? g.period
      if (start && period < start) return false
      if (g.recurrenceEnd && period > g.recurrenceEnd) return false
      return true
    })
  }

  const currentGroups = CURRENT_GROUPS
    .map(group => {
      const period = currentPeriod(group.level)

      return {
        ...group,
        period,
        items: goalsForCurrentPeriod(group.level, period),
      }
    })
    .filter(group => group.items.length > 0)

  // Avoid showing two New Goal actions at once. Once the contextual action
  // scrolls away, the floating action takes over.
  useEffect(() => {
    const actions = currentFocusActionsRef.current
    if (!actions) {
      setShowFloatingNewGoal(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingNewGoal(!entry.isIntersecting),
      { rootMargin: '-16px 0px 0px' },
    )
    observer.observe(actions)
    return () => observer.disconnect()
  }, [currentGroups.length])

  function isDoneForPeriod(g: Goal, period: string): boolean {
    return g.isRecurring ? g.completedPeriods.includes(period) : g.status === 'COMPLETED'
  }

  // Optimistic: flip locally first, then tell the server, then reconcile.
  async function toggleCurrentItem(g: Goal, period: string) {
    setBusyCurrent(g.id)
    const done = isDoneForPeriod(g, period)
    mutateGoals(prev => prev.map(x => {
      if (x.id !== g.id) return x
      return g.isRecurring
        ? {
            ...x,
            completedPeriods: done
              ? x.completedPeriods.filter(p => p !== period)
              : [...x.completedPeriods, period],
          }
        : { ...x, status: done ? 'PENDING' : 'COMPLETED' }
    }))
    try {
      if (g.isRecurring) {
        if (done) {
          await fetch(`/api/goals/${g.id}/completions/${period}`, {
            method: 'DELETE',
            headers: authHeaders(),
          })
        } else {
          await fetch(`/api/goals/${g.id}/completions`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ period }),
          })
        }
      } else {
        await fetch(`/api/goals/${g.id}`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            title: g.title,
            description: g.description,
            level: g.level,
            priority: g.priority,
            status: done ? 'PENDING' : 'COMPLETED',
          }),
        })
      }
      notifyGoalsChanged()
    } finally {
      setBusyCurrent(null)
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
    <div className="flex flex-col gap-6 lg:flex-row">

      {/* Side panel */}
      <aside className="hidden shrink-0 lg:sticky lg:top-4 lg:flex lg:w-40 lg:self-start lg:flex-col">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowForm(true)}
          className="w-full rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                     px-4 py-2 font-display text-sm font-bold text-white shadow-cute"
        >
          ✨ New Goal
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

      {/* Current-period goals stay visually separate by their natural cadence. */}
      {currentGroups.length > 0 && (
        <section>
          <div
            ref={currentFocusActionsRef}
            className="mb-3 flex items-start justify-between gap-3"
          >
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-peachy-400">
                <Coin emoji="🎯" gradient="from-sunny-200 to-blossom-200" />
                Current focus
              </h2>
              <p className="pl-10 text-xs font-semibold text-[#5b3a2e]/45">
                Tap a period or task to expand it
              </p>
            </div>
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => setShowForm(true)}
              className="shrink-0 rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                         px-3 py-2 font-display text-xs font-bold text-white shadow-cute lg:hidden"
            >
              ＋ New Goal
            </motion.button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {currentGroups.map(group => (
              <CurrentPeriodList
                key={group.level}
                level={group.level}
                title={group.title}
                subtitle={group.subtitle}
                emoji={group.emoji}
                items={group.items}
                period={group.period}
                busyId={busyCurrent}
                isDone={isDoneForPeriod}
                onToggle={toggleCurrentItem}
                onUpdate={updateCurrentItem}
              />
            ))}
          </div>
        </section>
      )}

      {/* Hub — jump straight to a level, or open the full breakdown in the Life Planner */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
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

      {/* Phone-sized primary action: always reachable without scrolling back up. */}
      <AnimatePresence>
        {!showForm && showFloatingNewGoal && (
          <motion.button
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => setShowForm(true)}
            className="fixed bottom-4 right-4 z-40 rounded-full bg-gradient-to-r
                       from-peachy-300 to-blossom-300 px-5 py-3 font-display
                       text-sm font-bold text-white shadow-cute lg:hidden"
            style={{ bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
          >
            ＋ New Goal
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom sheet on phones; centered dialog on wider screens. */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowForm(false)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-[#3d2118]/35
                       backdrop-blur-sm sm:items-center sm:p-6"
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-goal-title"
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 48 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              onClick={event => event.stopPropagation()}
              className="max-h-[88dvh] w-full overflow-y-auto overscroll-contain
                         rounded-t-3xl border border-blossom-100 bg-[#fffaf6]
                         shadow-2xl sm:max-w-lg sm:rounded-cute"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b
                              border-blossom-100 bg-[#fffaf6]/95 px-4 py-3 backdrop-blur
                              sm:px-5">
                <div>
                  <h2 id="new-goal-title" className="font-display text-lg font-extrabold text-peachy-400">
                    New Goal 🌟
                  </h2>
                  <p className="text-xs font-semibold text-[#5b3a2e]/45">
                    Add it without losing your place
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  aria-label="Close new goal form"
                  className="flex h-9 w-9 items-center justify-center rounded-full
                             bg-blossom-50 text-lg font-bold text-blossom-300
                             transition hover:bg-blossom-100"
                >
                  ✕
                </button>
              </div>

              <div className="px-4 pt-3 sm:p-5">
                <div className="pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-0">
                  <CreateGoalForm onCreated={handleCreated} goals={goals} />
                </div>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
