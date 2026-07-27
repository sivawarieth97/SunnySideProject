import { Goal, AuthResponse } from '@/types'

const BASE = '/api'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

// ── Auth ──────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Login failed')
  return data as AuthResponse
}

export async function register(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Registration failed')
  // register returns User, not AuthResponse — login after register
  return login(email, password)
}

// ── Goals ─────────────────────────────────────────────────────────

export async function fetchGoals(): Promise<Goal[]> {
  const res = await fetch(`${BASE}/goals`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  const data = await res.json()
  return data.goals as Goal[]
}

export interface CreateGoalPayload {
  title: string
  description?: string
  level?: string
  priority?: string
  period?: string
}

export async function createGoal(payload: CreateGoalPayload): Promise<Goal> {
  const res = await fetch(`${BASE}/goals`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to create goal')
  return data as Goal
}

export async function updateGoalStatus(id: string, status: string): Promise<Goal> {
  // Backend PUT /goals/:id updates title/desc/level/priority — not status directly.
  // We'll use a PATCH-style workaround: fetch the goal, then PUT with new status.
  // For now this sends a minimal update; the backend should be extended for status-only updates.
  const res = await fetch(`${BASE}/goals/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Failed to update goal')
  return data as Goal
}

export async function deleteGoal(id: string): Promise<void> {
  const res = await fetch(`${BASE}/goals/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Failed to delete goal')
}

export async function rolloverGoals(): Promise<Goal[]> {
  const res = await fetch(`${BASE}/goals/rollover`, {
    method: 'POST',
    headers: authHeaders(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Rollover failed')
  return data.goals as Goal[]
}
