'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { getToken, authHeaders } from './auth'
import { GOALS_CHANGED_EVENT } from './goalEvents'
import type { Goal } from '@/types'

// One shared goals store for the whole app. The home page, planner, and the
// calendar all read from here, so a single GET /goals serves every view and
// the views can never disagree. Components apply optimistic changes with
// mutateGoals() and reconcile with the server via notifyGoalsChanged()
// (which triggers refreshGoals for every subscriber).

type GoalsState = {
  goals: Goal[]
  loaded: boolean
  error: string
}

let state: GoalsState = { goals: [], loaded: false, error: '' }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function emit() {
  listeners.forEach(l => l())
}

export async function refreshGoals(): Promise<void> {
  if (typeof window === 'undefined' || !getToken()) return
  if (!inflight) {
    inflight = (async () => {
      try {
        const res = await fetch('/api/goals', { headers: authHeaders() })
        if (!res.ok) {
          state = { ...state, loaded: true, error: res.status === 401 ? '' : 'Could not load goals.' }
          return
        }
        const data = await res.json()
        state = { goals: data.goals ?? [], loaded: true, error: '' }
      } catch {
        state = { ...state, loaded: true, error: 'Could not load goals. Is the backend running?' }
      } finally {
        inflight = null
        emit()
      }
    })()
  }
  await inflight
}

/** Optimistic local update — instant UI, reconciled by the next refresh. */
export function mutateGoals(fn: (goals: Goal[]) => Goal[]) {
  state = { ...state, goals: fn(state.goals) }
  emit()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
const getSnapshot = () => state
const serverSnapshot: GoalsState = { goals: [], loaded: false, error: '' }
const getServerSnapshot = () => serverSnapshot

export function useGoals(): GoalsState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    refreshGoals()
    const onChange = () => refreshGoals()
    window.addEventListener(GOALS_CHANGED_EVENT, onChange)
    window.addEventListener('focus', onChange)
    return () => {
      window.removeEventListener(GOALS_CHANGED_EVENT, onChange)
      window.removeEventListener('focus', onChange)
    }
  }, [])

  return snapshot
}
