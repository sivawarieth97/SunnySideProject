'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Goal } from '@/app/page'
import type { GoalLevel } from '@/types'
import { authHeaders } from '@/lib/auth'
import { currentPeriod, dateInputForPeriod, periodForDate } from '@/lib/period'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { timeAgo } from '@/lib/format'
import { inputClass } from '@/lib/styles'

type Props = {
  goal:      Goal
  onUpdated: (goal: Goal) => void
  // Delete is delegated to the parent so it can offer a grace-period undo —
  // the card itself never talks to the DELETE endpoint.
  onRequestDelete: (goal: Goal) => void
}

const LEVELS     = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

const priorityColors: Record<string, string> = {
  HIGH:   'bg-blossom-100 text-blossom-400',
  MEDIUM: 'bg-sunny-200 text-peachy-400',
  LOW:    'bg-peachy-50 text-peachy-300',
}

// Unified level palette (same grammar as tree lines / calendar):
// warm yellow for days, peach for weeks/months, rose for quarters/years.
const levelColors: Record<string, string> = {
  DAILY:     'bg-sunny-100 text-peachy-400',
  WEEKLY:    'bg-peachy-50 text-peachy-400',
  MONTHLY:   'bg-peachy-100 text-peachy-400',
  QUARTERLY: 'bg-blossom-50 text-blossom-400',
  YEARLY:    'bg-blossom-100 text-blossom-400',
}

export default function GoalCard({ goal, onUpdated, onRequestDelete }: Props) {
  const [editing, setEditing]         = useState(false)
  const [title, setTitle]             = useState(goal.title)
  const [description, setDescription] = useState(goal.description ?? '')
  const [level, setLevel]             = useState(goal.level)
  const [priority, setPriority]       = useState(goal.priority)
  const [repeats, setRepeats]         = useState(goal.isRecurring)
  const [repeatUntil, setRepeatUntil] = useState(
    dateInputForPeriod(goal.recurrenceEnd, goal.level as GoalLevel)
  )
  const [saving, setSaving]           = useState(false)
  const [completing, setCompleting]   = useState(false)
  const [error, setError]             = useState('')

  function resetDraft() {
    setTitle(goal.title)
    setDescription(goal.description ?? '')
    setLevel(goal.level)
    setPriority(goal.priority)
    setRepeats(goal.isRecurring)
    setRepeatUntil(dateInputForPeriod(goal.recurrenceEnd, goal.level as GoalLevel))
    setError('')
  }

  function startEditing() {
    resetDraft()
    setEditing(true)
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')

    try {
      const [ry, rm, rd] = repeatUntil ? repeatUntil.split('-').map(Number) : [0, 0, 0]
      const res = await fetch(`/api/goals/${goal.id}`, {
        method:  'PUT',
        headers: authHeaders(),
        body:    JSON.stringify({
          title:       title.trim(),
          description: description.trim() || null,
          level,
          priority,
          isRecurring: repeats,
          recurrenceEnd: repeats && repeatUntil
            ? periodForDate(level as GoalLevel, new Date(ry, rm - 1, rd))
            : null,
        }),
      })
      const text = await res.text()
      if (res.ok) {
        onUpdated(JSON.parse(text))
        notifyGoalsChanged()
        setEditing(false)
      } else {
        try { setError(JSON.parse(text).error) }
        catch { setError(text) }
      }
    } catch {
      setError('Could not reach the server')
    } finally {
      setSaving(false)
    }
  }

  // For recurring goals the current period (today / this week / ...) that
  // "✓ Done" should tick — a recurring goal is never globally COMPLETED.
  const currentOccurrence = currentPeriod(goal.level as GoalLevel)
  const doneNow = goal.isRecurring
    ? goal.completedPeriods.includes(currentOccurrence)
    : goal.status === 'COMPLETED'

  async function handleComplete() {
    setCompleting(true)
    setError('')
    try {
      if (goal.isRecurring) {
        // Tick/untick just this period's occurrence via the completions API.
        const res = doneNow
          ? await fetch(`/api/goals/${goal.id}/completions/${currentOccurrence}`, {
              method: 'DELETE', headers: authHeaders(),
            })
          : await fetch(`/api/goals/${goal.id}/completions`, {
              method: 'POST', headers: authHeaders(),
              body: JSON.stringify({ period: currentOccurrence }),
            })
        if (res.ok || res.status === 204) {
          onUpdated({
            ...goal,
            completedPeriods: doneNow
              ? goal.completedPeriods.filter(p => p !== currentOccurrence)
              : [...goal.completedPeriods, currentOccurrence],
          })
          notifyGoalsChanged()
        } else {
          const err = await res.json().catch(() => ({}))
          setError(err.error ?? 'Could not update completion')
        }
        return
      }

      const res = await fetch(`/api/goals/${goal.id}`, {
        method:  'PUT',
        headers: authHeaders(),
        body:    JSON.stringify({
          title:       goal.title,
          description: goal.description,
          level:       goal.level,
          priority:    goal.priority,
          status:      goal.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED',
        }),
      })
      if (res.ok) {
        onUpdated(await res.json())
        notifyGoalsChanged()
      } else {
        const err = await res.json()
        setError(err.error ?? 'Could not complete goal')
      }
    } catch {
      setError('Could not reach the server')
    } finally {
      setCompleting(false)
    }
  }


  // ---- Edit mode ----
  if (editing) {
    return (
      <form
        onSubmit={handleUpdate}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        className="space-y-3 rounded-cute border border-peachy-200 bg-white/80 p-4 shadow-cute"
      >
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          className={inputClass}
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          placeholder="Description (optional)"
          className={`${inputClass} resize-none`}
        />
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-bold text-blossom-300">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value)} className={inputClass}>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-bold text-blossom-300">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-bold text-blossom-300">Repeats?</label>
            <div className="flex overflow-hidden rounded-2xl border border-sunny-200">
              <button
                type="button"
                onClick={() => setRepeats(false)}
                className={`flex-1 px-2 py-2 text-xs font-bold transition
                            ${!repeats ? 'bg-gradient-to-r from-peachy-300 to-blossom-300 text-white' : 'bg-sunny-50 text-[#5b3a2e]/50 hover:bg-sunny-100'}`}
              >
                One-time
              </button>
              <button
                type="button"
                onClick={() => setRepeats(true)}
                className={`flex-1 px-2 py-2 text-xs font-bold transition
                            ${repeats ? 'bg-gradient-to-r from-peachy-300 to-blossom-300 text-white' : 'bg-sunny-50 text-[#5b3a2e]/50 hover:bg-sunny-100'}`}
              >
                ↻ Repeats
              </button>
            </div>
          </div>
          {repeats && (
            <div className="flex-1">
              <label className="mb-1 block text-xs font-bold text-blossom-300">
                Until <span className="text-peachy-200">(empty = forever)</span>
              </label>
              <input
                type="date"
                value={repeatUntil}
                onChange={e => setRepeatUntil(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
        </div>
        {error && <p className="text-xs font-semibold text-blossom-400">{error}</p>}
        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            type="submit"
            disabled={saving}
            className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-4 py-1.5
                       font-display text-sm font-bold text-white shadow-cute disabled:opacity-40"
          >
            {saving ? 'Saving... 💭' : 'Save 💕'}
          </motion.button>
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              resetDraft()
            }}
            className="px-3 py-1.5 text-sm font-bold text-blossom-300 hover:text-blossom-400"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  const badge = 'rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0'

  const hasRolledOver = goal.originalPeriod && goal.originalPeriod !== goal.period
  const completed = !goal.isRecurring && goal.status === 'COMPLETED'

  // Quiet meta line instead of a wall of badges — period, recurrence, drift.
  const meta: string[] = []
  if (goal.period) meta.push(`📅 ${goal.period}`)
  if (goal.isRecurring) meta.push(`↻ repeats${goal.recurrenceEnd ? ` until ${goal.recurrenceEnd}` : ''}`)
  if (!goal.isRecurring && hasRolledOver) meta.push(`rolled over from ${goal.originalPeriod}`)
  meta.push(timeAgo(goal.createdAt))

  // ---- View mode ----
  return (
    <motion.div
      whileHover={{ scale: 1.01, rotate: -0.3 }}
      className={`rounded-cute border border-white/70 bg-white/70 p-4 shadow-sm backdrop-blur transition
                  hover:shadow-cute ${completed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className={`truncate font-display text-base font-bold ${completed ? 'text-[#5b3a2e]/50 line-through' : 'text-[#5b3a2e]'}`}>
              {goal.title}
            </h3>
            <span className={`${badge} ${levelColors[goal.level] ?? 'bg-peachy-50 text-peachy-300'}`}>
              {goal.level}
            </span>
            <span className={`${badge} ${priorityColors[goal.priority] ?? 'bg-peachy-50 text-peachy-300'}`}>
              {goal.priority}
            </span>
          </div>
          {goal.description && (
            <p className={`mb-1.5 text-sm font-semibold ${completed ? 'text-[#5b3a2e]/40' : 'text-[#5b3a2e]/70'}`}>
              {goal.description}
            </p>
          )}
          <p className="text-xs font-semibold text-[#5b3a2e]/45">
            {meta.join(' · ')}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={handleComplete}
            disabled={completing}
            title={goal.isRecurring ? `Marks ${currentOccurrence} ${doneNow ? 'not done' : 'done'} — other days unaffected` : undefined}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition disabled:opacity-40
                        ${doneNow
                          ? 'border-blossom-300 bg-blossom-200 text-white hover:bg-blossom-300'
                          : 'border-blossom-200 bg-blossom-50 text-blossom-400 hover:bg-blossom-100'}`}
          >
            {completing ? '...' : goal.isRecurring ? (doneNow ? '✓ Today' : 'Today?') : completed ? '↺ Reopen' : '✓ Done'}
          </button>
          <button
            onClick={startEditing}
            className="rounded-full border border-sunny-200 bg-sunny-50 px-3 py-1 text-xs
                       font-bold text-peachy-400 transition hover:bg-sunny-100"
          >
            Edit
          </button>
          <button
            onClick={() => onRequestDelete(goal)}
            className="rounded-full border border-blossom-100 bg-blossom-50 px-3 py-1 text-xs
                       font-bold text-blossom-400 transition hover:bg-blossom-100"
          >
            Delete
          </button>
        </div>

      </div>
      {error && <p className="mt-1 text-xs font-semibold text-blossom-400">{error}</p>}
    </motion.div>
  )
}
