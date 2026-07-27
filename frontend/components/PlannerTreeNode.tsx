'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Goal } from '@/app/page'
import PlannerCard from './PlannerCard'

type Level = 'YEARLY' | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY'

type Props = {
  goal:             Goal
  allGoals:         Goal[]
  onToggleComplete: (g: Goal) => void
  onCyclePriority:  (g: Goal) => void
  onDelete:         (g: Goal) => void
  onSave:           (g: Goal, patch: { title: string; description: string | null }) => void
  onAddChild:       (parent: Goal, level: Level, title: string, description?: string | null) => Promise<void>
}

const LEVEL_ORDER: Level[] = ['YEARLY', 'QUARTERLY', 'MONTHLY', 'WEEKLY', 'DAILY']

// Any level below this one can be attached directly here — a yearly goal can
// take a quarterly, monthly, or daily goal straight under it, not just the
// immediate next level. DAILY is a leaf — nothing goes under it.
function allowedChildLevels(level: string): Level[] {
  const idx = LEVEL_ORDER.indexOf(level as Level)
  return idx === -1 ? [] : LEVEL_ORDER.slice(idx + 1)
}

// The indent line under each node is tinted by that node's own level, so the
// nesting reads as "everything inside this colored line belongs to this goal".
// Same level→color grammar as goal-card chips: rose = years/quarters,
// peach = months/weeks, sunny = days.
const lineColor: Record<string, string> = {
  YEARLY:    'border-blossom-200',
  QUARTERLY: 'border-blossom-100',
  MONTHLY:   'border-peachy-200',
  WEEKLY:    'border-peachy-100',
  DAILY:     'border-sunny-200',
}

// Yearly and quarterly goals are the "big decisions" — they get the roomier card
// with a visible description and a proper add form. Monthly/daily stay compact
// single-line rows so the tree doesn't get overwhelming near the leaves.
function variantFor(level: string): 'detailed' | 'compact' {
  return level === 'YEARLY' || level === 'QUARTERLY' ? 'detailed' : 'compact'
}

export default function PlannerTreeNode({
  goal, allGoals, onToggleComplete, onCyclePriority, onDelete, onSave, onAddChild,
}: Props) {
  const children = allGoals
    .filter(g => g.parentGoalId === goal.id)
    .sort((a, b) => (a.period ?? '').localeCompare(b.period ?? ''))

  const childLevels = allowedChildLevels(goal.level)
  const variant = variantFor(goal.level)
  // A choice of levels gets the roomier form (title + description + level picker);
  // a single option (e.g. under a monthly goal, only "daily" makes sense) stays
  // a quick one-line add.
  const richAdd = childLevels.length > 1

  const [expanded, setExpanded] = useState(true)
  const [draft, setDraft]       = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [draftLevel, setDraftLevel] = useState<Level>(childLevels[0] ?? 'DAILY')
  const [adding, setAdding]     = useState(false)

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    const level = richAdd ? draftLevel : childLevels[0]
    if (!draft.trim() || !level) return
    setAdding(true)
    try {
      await onAddChild(goal, level, draft.trim(), richAdd ? (draftDesc.trim() || null) : null)
      setDraft('')
      setDraftDesc('')
    } finally {
      setAdding(false)
    }
  }

  const hasExpandable = children.length > 0 || childLevels.length > 0

  return (
    <div>
      <div className="flex items-start gap-1">
        {hasExpandable ? (
          <button
            onClick={() => setExpanded(v => !v)}
            className={`shrink-0 text-xs font-bold text-peachy-300 hover:text-peachy-400 ${variant === 'detailed' ? 'mt-4 w-5' : 'mt-2.5 w-4'}`}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            aria-expanded={expanded}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={variant === 'detailed' ? 'w-5 shrink-0' : 'w-4 shrink-0'} />
        )}
        <div className="min-w-0 flex-1">
          {/* Clicking anywhere on the card toggles expand/collapse — the tiny
              caret works too, but the whole card is the real target. Inner
              buttons (complete/edit/delete/priority) stopPropagation. */}
          <PlannerCard
            goal={goal}
            variant={variant}
            selectable={hasExpandable}
            onSelect={() => setExpanded(v => !v)}
            onToggleComplete={() => onToggleComplete(goal)}
            onCyclePriority={() => onCyclePriority(goal)}
            onDelete={() => onDelete(goal)}
            onSave={patch => onSave(goal, patch)}
            childCount={children.length}
            childDoneCount={children.filter(c => c.status === 'COMPLETED').length}
            childLabel={children.length > 0 ? 'sub-goals' : undefined}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
        <div
          className={`mt-2 border-l-2 border-dashed pl-3 ${lineColor[goal.level] ?? 'border-sunny-100'}
                      ${variant === 'detailed' ? 'ml-[1.4rem] space-y-3' : 'ml-[1.15rem] space-y-1.5'}`}
        >
          {children.map(child => (
            <PlannerTreeNode
              key={child.id}
              goal={child}
              allGoals={allGoals}
              onToggleComplete={onToggleComplete}
              onCyclePriority={onCyclePriority}
              onDelete={onDelete}
              onSave={onSave}
              onAddChild={onAddChild}
            />
          ))}

          {richAdd && (
            <form
              onSubmit={handleQuickAdd}
              className="space-y-2 rounded-cute border border-dashed border-peachy-200 bg-white/60 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-peachy-300">+ New sub-goal</p>
                <select
                  value={draftLevel}
                  onChange={e => setDraftLevel(e.target.value as Level)}
                  className="rounded-full border border-sunny-200 bg-sunny-50 px-2 py-0.5 text-[11px]
                             font-bold text-[#5b3a2e] outline-none focus:border-peachy-300"
                >
                  {childLevels.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder="Title"
                className="w-full rounded-xl border border-sunny-200 bg-sunny-50 px-3 py-1.5 text-sm
                           font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
              />
              <textarea
                value={draftDesc}
                onChange={e => setDraftDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full resize-none rounded-xl border border-sunny-200 bg-sunny-50 px-3 py-1.5 text-xs
                           font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
              />
              <button
                type="submit"
                disabled={adding || !draft.trim()}
                className="rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300 px-4 py-1.5
                           font-display text-xs font-bold text-white shadow-cute disabled:opacity-40"
              >
                {adding ? 'Adding...' : `Add ${draftLevel.toLowerCase()} goal`}
              </button>
            </form>
          )}

          {!richAdd && childLevels.length === 1 && (
            <form onSubmit={handleQuickAdd} className="flex gap-1.5">
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={`+ Add ${childLevels[0].toLowerCase()} goal...`}
                className="w-full rounded-full border border-sunny-200 bg-sunny-50/70 px-3 py-1.5 text-xs
                           font-semibold text-[#5b3a2e] outline-none focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100"
              />
              <button
                type="submit"
                disabled={adding || !draft.trim()}
                className="shrink-0 rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                           px-3 text-sm font-bold text-white shadow-cute disabled:opacity-40"
              >
                +
              </button>
            </form>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
