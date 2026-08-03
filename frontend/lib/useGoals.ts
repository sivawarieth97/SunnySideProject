'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { authHeaders } from './auth'
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
  waking: boolean
}

let state: GoalsState = { goals: [], loaded: false, error: '', waking: false }
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null

function emit() {
  listeners.forEach(l => l())
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Render's free tier spins the backend down after ~15min idle, so the first
// request after a while away hits a cold container — it can take 30-60s to
// come back up, and the very first attempt often fails outright (connection
// refused) rather than just being slow. Retrying with backoff here covers
// that automatically, so the person doesn't have to manually reopen the app
// 2-3 times themselves.
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000, 15000, 15000] // ~59s total

export async function refreshGoals(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!inflight) {
    inflight = (async () => {
      let attempt = 0
      try {
        while (true) {
          try {
            const res = await fetch('/api/goals', { headers: authHeaders() })
            if (res.status === 401) {
              state = { ...state, loaded: true, error: 'UNAUTHORIZED', waking: false }
              return
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            state = { goals: data.goals ?? [], loaded: true, error: '', waking: false }
            return
          } catch {
            if (attempt >= RETRY_DELAYS_MS.length) {
              state = {
                ...state,
                loaded: true,
                waking: false,
                error: 'Could not load goals. The server may be asleep — tap ↻ Refresh to try again.',
              }
              return
            }
            // Show a friendly "waking up" state instead of a scary error
            // while the backend cold-starts, and keep retrying quietly.
            state = { ...state, waking: true }
            emit()
            await sleep(RETRY_DELAYS_MS[attempt])
            attempt += 1
          }
        }
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
const serverSnapshot: GoalsState = { goals: [], loaded: false, error: '', waking: false }
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
