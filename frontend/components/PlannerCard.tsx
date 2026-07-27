'use client'

import { useState } from 'react'
import type { Goal } from '@/app/page'

type Props = {
  goal:             Goal
  variant?:         'detailed' | 'compact'
  selected?:        boolean
  selectable?:      boolean
  onSelect?:        () => void
  onToggleComplete: () => void
  onCyclePriority:  () => void
  onDelete:         () => void
  onSave:           (patch: { title: string; description: string | null }) => void
  childCount?:      number
  childDoneCount?:  number
  childLabel?:      string
  accentRing?:      string
}

const priorityDot: Record<string, string> = {
  HIGH:   'bg-blossom-400',
  MEDIUM: 'bg-sunny-400',
  LOW:    'bg-peachy-200',
}

const priorityPill: Record<string, string> = {
  HIGH:   'bg-blossom-100 text-blossom-400',
  MEDIUM: 'bg-sunny-200 text-peachy-400',
  LOW:    'bg-peachy-50 text-peachy-300',
}

export default function PlannerCard({
  goal, variant = 'compact', selected, selectable, onSelect, onToggleComplete, onCyclePriority,
  onDelete, onSave, childCount, childDoneCount, childLabel, accentRing,
}: Props) {
  const [editing, setEditing]     = useState(false)
  // Long descriptions (especially AI-generated day plans) show one clamped
  // line; hover reveals the full text as a tooltip, click unfolds it in place.
  const [descExpanded, setDescExpanded] = useState(false)
  const [title, setTitle]         = useState(goal.title)
  const [description, setDescription] = useState(goal.description ?? '')
  const done = goal.status === 'COMPLETED'
  const detailed = variant === 'detailed'

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation()
    setTitle(goal.title)
    setDescription(goal.description ?? '')
    setEditing(true)
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    onSave({ title: title.trim(), description: description.trim() || null })
    setEditing(false)
  }

  if (editing) {
    return (
      <form
        onSubmit={saveEdit}
        onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false) }}
        className={`space-y-2 rounded-cute border border-peachy-200 bg-white shadow-cute ${detailed ? 'p-4' : 'p-2.5'}`}
      >
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={`w-full rounded-xl border border-sunny-200 bg-sunny-50 font-bold text-[#5b3a2e]
                      outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100
                      ${detailed ? 'px-3 py-2 text-sm' : 'px-2 py-1 text-xs'}`}
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={detailed ? 3 : 2}
          className={`w-full resize-none rounded-xl border border-sunny-200 bg-sunny-50 font-semibold text-[#5b3a2e]
                      outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100
                      ${detailed ? 'px-3 py-2 text-xs' : 'px-2 py-1 text-xs'}`}
        />
        <div className="flex gap-1.5">
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-3 py-1 text-[11px]
                       font-display font-bold text-white shadow-cute"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-2 py-1 text-[11px] font-bold text-blossom-300 hover:text-blossom-400"
          >
            Cancel
          </button>
        </div>
      </form>
    )
  }

  if (detailed) {
    const pct = childCount && childCount > 0 ? Math.round(((childDoneCount ?? 0) / childCount) * 100) : null
    return (
      <div
        onClick={selectable ? onSelect : undefined}
        role={selectable ? 'button' : undefined}
        tabIndex={selectable ? 0 : undefined}
        onKeyDown={selectable ? e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.() }
        } : undefined}
        className={`rounded-cute border bg-white/90 p-4 transition
                    ${selectable ? 'cursor-pointer hover:shadow-cute' : ''}
                    ${selected ? `border-transparent shadow-cute ring-2 ${accentRing ?? 'ring-peachy-300'}` : 'border-white shadow-sm'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <button
              onClick={e => { e.stopPropagation(); onToggleComplete() }}
              title={done ? 'Mark as pending' : 'Mark as complete'}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold
                          ${done ? 'border-blossom-300 bg-blossom-300 text-white' : 'border-sunny-300 bg-white text-transparent'}`}
            >
              ✓
            </button>
            <div className="min-w-0 flex-1">
              <h3 className={`font-display text-base font-bold leading-snug ${done ? 'text-[#5b3a2e]/40 line-through' : 'text-[#5b3a2e]'}`}>
                {goal.title}
              </h3>
              {goal.description ? (
                <p
                  onClick={e => { e.stopPropagation(); setDescExpanded(v => !v) }}
                  title={descExpanded ? 'Click to collapse' : goal.description}
                  className={`mt-1 cursor-pointer text-xs font-semibold text-[#5b3a2e]/60
                              ${descExpanded ? 'whitespace-pre-wrap' : 'line-clamp-1'}`}
                >
                  {goal.description}
                </p>
              ) : (
                <button
                  onClick={startEdit}
                  className="mt-1 text-xs font-semibold text-peachy-200 hover:text-peachy-300"
                >
                  + add a description
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={startEdit} className="text-sm text-peachy-300 hover:text-peachy-400" aria-label="Edit">✎</button>
            <button onClick={e => { e.stopPropagation(); onDelete() }} className="text-sm text-blossom-300 hover:text-blossom-400" aria-label="Delete">🗑</button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onCyclePriority() }}
            title="Click to cycle priority"
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${priorityPill[goal.priority] ?? 'bg-peachy-50 text-peachy-300'}`}
          >
            {goal.priority}
          </button>
          {goal.period && (
            <span className="rounded-full bg-sunny-50 px-2.5 py-0.5 text-[11px] font-bold text-peachy-300">
              📅 {goal.period}
            </span>
          )}
        </div>

        {typeof childCount === 'number' && childCount > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-bold text-peachy-300">
              <span>{childLabel ?? 'progress'}</span>
              <span>{childDoneCount ?? 0}/{childCount} done</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunny-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={selectable ? onSelect : undefined}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.() }
      } : undefined}
      className={`group rounded-xl border bg-white/90 p-2.5 transition
                  ${selectable ? 'cursor-pointer hover:shadow-cute hover:-translate-y-0.5' : ''}
                  ${selected ? `border-transparent shadow-cute ring-2 ${accentRing ?? 'ring-peachy-300'}` : 'border-white'}`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={e => { e.stopPropagation(); onToggleComplete() }}
          title={done ? 'Mark as pending' : 'Mark as complete'}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold
                      ${done ? 'border-blossom-300 bg-blossom-300 text-white' : 'border-sunny-300 bg-white text-transparent'}`}
        >
          ✓
        </button>

        <div className="min-w-0 flex-1">
          <p className={`truncate text-xs font-bold leading-tight ${done ? 'text-[#5b3a2e]/40 line-through' : 'text-[#5b3a2e]'}`}>
            {goal.title}
          </p>
          {goal.description && (
            <p
              onClick={e => { e.stopPropagation(); setDescExpanded(v => !v) }}
              title={descExpanded ? 'Click to collapse' : goal.description}
              className={`mt-0.5 cursor-pointer text-[11px] font-semibold text-[#5b3a2e]/50
                          ${descExpanded ? 'whitespace-pre-wrap' : 'truncate'}`}
            >
              {goal.description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={e => { e.stopPropagation(); onCyclePriority() }}
              title={`Priority: ${goal.priority} (click to cycle)`}
              className={`h-2.5 w-2.5 rounded-full ${priorityDot[goal.priority] ?? 'bg-peachy-200'}`}
            />
            {goal.period && (
              <span className="text-[10px] font-bold text-peachy-300">{goal.period}</span>
            )}
            {typeof childCount === 'number' && childCount > 0 && (
              <span className="text-[10px] font-bold text-peachy-200">
                {childDoneCount ?? 0}/{childCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={startEdit}
            className="text-[11px] text-peachy-300 hover:text-peachy-400"
            aria-label="Edit"
          >
            ✎
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-[11px] text-blossom-300 hover:text-blossom-400"
            aria-label="Delete"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
