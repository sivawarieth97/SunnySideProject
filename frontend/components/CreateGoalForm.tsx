'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { Goal } from '@/app/page'
import type { GoalLevel } from '@/types'
import { authHeaders } from '@/lib/auth'
import { currentPeriod, friendlyPeriod, periodForDate } from '@/lib/period'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { inputClass } from '@/lib/styles'

type Props = {
  onCreated: (goal: Goal) => void
  goals: Goal[]
}

const LEVELS: GoalLevel[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']
const HIERARCHY_ORDER: GoalLevel[] = ['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'DAILY']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH']

function todayISO(): string {
  return currentPeriod('DAILY')
}

// "2026-08-15" from an <input type=date> → a local Date (avoids UTC off-by-one)
function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function CreateGoalForm({ onCreated, goals }: Props) {
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [level, setLevel]           = useState<GoalLevel>('DAILY')
  const [priority, setPriority]     = useState('MEDIUM')
  const [parentGoalId, setParentGoalId] = useState('')
  // "When is this goal for?" — defaults to today; the date is translated into
  // the right period string for the chosen level (day / week / month / ...).
  const [onDate, setOnDate]         = useState(todayISO())
  // One-off vs recurring. A recurring goal repeats every period (every day for
  // DAILY, every week for WEEKLY, ...) from its start date until the optional
  // end date — per-day completion is tracked on the calendar.
  const [repeats, setRepeats]       = useState(false)
  const [repeatUntil, setRepeatUntil] = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const levelIndex = HIERARCHY_ORDER.indexOf(level)
  const parentCandidates = goals
    .filter(goal => HIERARCHY_ORDER.indexOf(goal.level as GoalLevel) < levelIndex)
    .sort((a, b) => {
      const levelDifference =
        HIERARCHY_ORDER.indexOf(b.level as GoalLevel) -
        HIERARCHY_ORDER.indexOf(a.level as GoalLevel)
      return levelDifference || a.title.localeCompare(b.title)
    })

  function handleLevelChange(nextLevel: GoalLevel) {
    setLevel(nextLevel)
    setParentGoalId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const lvl = level as GoalLevel
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          title:       title.trim(),
          description: description.trim() || null,
          level,
          priority,
          period:      periodForDate(lvl, parseDateInput(onDate)),
          parentGoalId: parentGoalId || null,
          isRecurring: repeats,
          recurrenceEnd: repeats && repeatUntil
            ? periodForDate(lvl, parseDateInput(repeatUntil))
            : null,
        }),
      })

      if (res.ok) {
        const goal = await res.json()
        onCreated(goal)
        notifyGoalsChanged()
        setTitle('')
        setDescription('')
        setLevel('DAILY')
        setPriority('MEDIUM')
        setParentGoalId('')
        setOnDate(todayISO())
        setRepeats(false)
        setRepeatUntil('')
      } else {
        const err = await res.json()
        setError(err.error ?? 'Something went wrong')
      }
    } catch {
      setError('Could not reach the server. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  const labelClass = 'mb-1 block text-sm font-bold text-blossom-300'

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className={labelClass}>
          Title <span className="text-blossom-400">*</span>
        </label>
        <input
          type="text"
          placeholder="e.g. Learn Scala + ZIO 🌸"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>
          Description <span className="text-peachy-200">(optional)</span>
        </label>
        <textarea
          placeholder="What does this goal mean to you? 💭"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex-1">
          <label className={labelClass}>Level</label>
          <select
            value={level}
            onChange={e => handleLevelChange(e.target.value as GoalLevel)}
            className={inputClass}
          >
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        <div className="flex-1">
          <label className={labelClass}>Priority</label>
          <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>
          Parent goal <span className="text-peachy-200">(optional)</span>
        </label>
        <select
          value={parentGoalId}
          onChange={e => setParentGoalId(e.target.value)}
          disabled={parentCandidates.length === 0}
          className={inputClass}
        >
          <option value="">
            {level === 'YEARLY'
              ? 'No parent — yearly goals are top-level'
              : parentCandidates.length === 0
                ? 'No broader goals available'
                : 'No parent — keep this goal top-level'}
          </option>
          {parentCandidates.map(goal => (
            <option key={goal.id} value={goal.id}>
              {goal.level} · {goal.title}
              {goal.period ? ` · ${friendlyPeriod(goal.period, goal.level as GoalLevel)}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] font-semibold text-peachy-200">
          {level === 'YEARLY'
            ? 'A yearly goal can become a parent for any narrower goal.'
            : `Choose a broader goal to make this ${level.toLowerCase()} goal its child.`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex-1">
          <label className={labelClass}>{repeats ? 'Starts on' : 'When?'}</label>
          <input
            type="date"
            value={onDate}
            onChange={e => setOnDate(e.target.value)}
            className={inputClass}
          />
          {level !== 'DAILY' && (
            <p className="mt-1 text-[11px] font-semibold text-peachy-200">
              Counts for the whole {level.toLowerCase().replace('ly', '')} this date falls in
            </p>
          )}
        </div>

        <div className="flex-1">
          <label className={labelClass}>Repeats?</label>
          <div className="flex overflow-hidden rounded-2xl border border-sunny-200">
            <button
              type="button"
              onClick={() => setRepeats(false)}
              className={`flex-1 px-2 py-2 text-sm font-bold transition
                          ${!repeats ? 'bg-gradient-to-r from-peachy-300 to-blossom-300 text-white' : 'bg-sunny-50 text-[#5b3a2e]/50 hover:bg-sunny-100'}`}
            >
              One-time
            </button>
            <button
              type="button"
              onClick={() => setRepeats(true)}
              className={`flex-1 px-2 py-2 text-sm font-bold transition
                          ${repeats ? 'bg-gradient-to-r from-peachy-300 to-blossom-300 text-white' : 'bg-sunny-50 text-[#5b3a2e]/50 hover:bg-sunny-100'}`}
            >
              ↻ Repeats
            </button>
          </div>
        </div>
      </div>

      {repeats && (
        <div>
          <label className={labelClass}>
            Repeat until <span className="text-peachy-200">(optional — leave empty for no end)</span>
          </label>
          <input
            type="date"
            value={repeatUntil}
            min={onDate}
            onChange={e => setRepeatUntil(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {error && <p className="text-sm font-semibold text-blossom-400">{error}</p>}

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="submit"
        disabled={!title.trim() || loading}
        className="w-full rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                   py-3 font-display text-base font-bold text-white shadow-cute
                   disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? 'Creating... 💫' : '✨ Create Goal'}
      </motion.button>
    </form>
  )
}
