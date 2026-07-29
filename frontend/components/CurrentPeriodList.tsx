'use client'

import { useState } from 'react'
import type { Goal, GoalLevel } from '@/types'
import { periodDateRange } from '@/lib/period'

type Props = {
  level: GoalLevel
  title: string
  subtitle: string
  emoji: string
  items: Goal[]
  period: string
  busyId: string | null
  isDone: (goal: Goal, period: string) => boolean
  onToggle: (goal: Goal, period: string) => void
  onUpdate: (
    goal: Goal,
    changes: { title: string; description: string | null },
  ) => Promise<void>
}

const levelStyles: Record<GoalLevel, {
  card: string
  icon: string
  row: string
}> = {
  DAILY: {
    card: 'border-sunny-200 bg-white/75',
    icon: 'from-sunny-200 to-sunny-300',
    row: 'bg-sunny-50/80 hover:bg-sunny-100/80',
  },
  WEEKLY: {
    card: 'border-peachy-100 bg-white/75',
    icon: 'from-sunny-100 to-peachy-200',
    row: 'bg-peachy-50/70 hover:bg-peachy-100/70',
  },
  MONTHLY: {
    card: 'border-peachy-200 bg-white/75',
    icon: 'from-peachy-200 to-peachy-300',
    row: 'bg-peachy-50/70 hover:bg-peachy-100/70',
  },
  QUARTERLY: {
    card: 'border-blossom-100 bg-white/75',
    icon: 'from-blossom-200 to-blossom-300',
    row: 'bg-blossom-50/70 hover:bg-blossom-100/70',
  },
  YEARLY: {
    card: 'border-blossom-200 bg-white/75',
    icon: 'from-sunny-200 to-blossom-200',
    row: 'bg-blossom-50/70 hover:bg-blossom-100/70',
  },
}

type CurrentGoalRowProps = {
  goal: Goal
  period: string
  busy: boolean
  done: boolean
  rowStyle: string
  onToggle: (goal: Goal, period: string) => void
  onUpdate: Props['onUpdate']
}

function CurrentGoalRow({
  goal,
  period,
  busy,
  done,
  rowStyle,
  onToggle,
  onUpdate,
}: CurrentGoalRowProps) {
  const [showDescription, setShowDescription] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(goal.title)
  const [description, setDescription] = useState(goal.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function beginEditing() {
    setTitle(goal.title)
    setDescription(goal.description ?? '')
    setError('')
    setShowDescription(true)
    setEditing(true)
  }

  function cancelEditing() {
    setTitle(goal.title)
    setDescription(goal.description ?? '')
    setError('')
    setEditing(false)
  }

  async function saveChanges(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return

    setSaving(true)
    setError('')
    try {
      await onUpdate(goal, {
        title: title.trim(),
        description: description.trim() || null,
      })
      setEditing(false)
      setShowDescription(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <li
      className={`rounded-xl px-2.5 py-2 transition ${rowStyle}
                  ${done ? 'opacity-60 saturate-50' : ''}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={done}
          disabled={busy}
          onChange={() => onToggle(goal, period)}
          aria-label={`${done ? 'Mark as not completed' : 'Mark as completed'}: ${goal.title}`}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-peachy-300"
        />

        <span
          className={`min-w-0 flex-1 break-words text-sm font-semibold leading-snug
                      ${done
                        ? 'text-[#5b3a2e]/45 line-through decoration-2 decoration-peachy-300'
                        : 'text-[#5b3a2e]'}`}
        >
          {goal.isRecurring ? '↻ ' : ''}{goal.title}
        </span>

        <button
          type="button"
          onClick={() => setShowDescription(value => !value)}
          aria-expanded={showDescription}
          aria-label={`${showDescription ? 'Hide' : 'Show'} description for ${goal.title}`}
          title="View description"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80
                     bg-white/60 text-xs font-bold text-peachy-400 shadow-sm transition
                     hover:bg-white hover:text-blossom-400"
        >
          ⓘ
        </button>
        <button
          type="button"
          onClick={beginEditing}
          aria-label={`Edit ${goal.title}`}
          title="Edit task"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/80
                     bg-white/60 text-sm font-bold text-peachy-400 shadow-sm transition
                     hover:bg-white hover:text-blossom-400"
        >
          ✎
        </button>
      </div>

      {showDescription && !editing && (
        <div className="ml-6 mt-2 border-t border-white/70 pt-2">
          <p className="whitespace-pre-wrap text-xs font-semibold leading-relaxed text-[#5b3a2e]/65">
            {goal.description || 'No description yet.'}
          </p>
          {!goal.description && (
            <button
              type="button"
              onClick={beginEditing}
              className="mt-1 text-xs font-bold text-peachy-400 hover:text-blossom-400"
            >
              + Add description
            </button>
          )}
        </div>
      )}

      {editing && (
        <form
          onSubmit={saveChanges}
          onKeyDown={event => {
            if (event.key === 'Escape') cancelEditing()
          }}
          className="ml-6 mt-2 space-y-2 border-t border-white/70 pt-2"
        >
          <label className="block">
            <span className="sr-only">Task title</span>
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              required
              className="w-full rounded-xl border border-sunny-200 bg-white/80 px-3 py-1.5
                         text-sm font-semibold text-[#5b3a2e] outline-none transition
                         focus:border-peachy-300"
            />
          </label>
          <label className="block">
            <span className="sr-only">Task description</span>
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={2}
              placeholder="Description (optional)"
              className="w-full resize-none rounded-xl border border-sunny-200 bg-white/80 px-3 py-1.5
                         text-sm font-semibold text-[#5b3a2e] outline-none transition
                         focus:border-peachy-300"
            />
          </label>
          {error && <p className="text-xs font-bold text-blossom-400">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-3 py-1
                         text-xs font-bold text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="px-2 py-1 text-xs font-bold text-[#5b3a2e]/50 hover:text-[#5b3a2e]/75"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  )
}

export default function CurrentPeriodList({
  level,
  title,
  subtitle,
  emoji,
  items,
  period,
  busyId,
  isDone,
  onToggle,
  onUpdate,
}: Props) {
  const styles = levelStyles[level]
  const completed = items.filter(goal => isDone(goal, period)).length
  const dateRange = periodDateRange(period, level)

  return (
    <section className={`rounded-cute border p-3.5 shadow-sm backdrop-blur ${styles.card}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                        bg-gradient-to-br text-lg shadow-sm ${styles.icon}`}
          >
            {emoji}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-extrabold leading-tight text-peachy-400">
              {title}
            </h3>
            <p className="text-xs font-semibold text-[#5b3a2e]/45">{subtitle}</p>
            <p className="mt-0.5 text-[11px] font-bold tabular-nums text-[#5b3a2e]/40">
              📅 {dateRange}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-[#5b3a2e]/45">
          {completed}/{items.length}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {items.map(goal => (
          <CurrentGoalRow
            key={goal.id}
            goal={goal}
            period={period}
            busy={busyId === goal.id}
            done={isDone(goal, period)}
            rowStyle={styles.row}
            onToggle={onToggle}
            onUpdate={onUpdate}
          />
        ))}
      </ul>
    </section>
  )
}
