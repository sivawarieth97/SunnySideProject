export type GoalStatus = 'PENDING' | 'COMPLETED' | 'ROLLED_OVER'
export type GoalLevel = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type GoalPriority = 'LOW' | 'MEDIUM' | 'HIGH'

// Single source of truth for the goal shape — mirrors the backend's Goal JSON.
// (app/page.tsx re-exports this for backwards-compatible imports.)
// status/level/priority stay as plain strings to match what the API returns;
// use the unions above when narrowing.
export interface Goal {
  id: string
  title: string
  description: string | null
  status: string          // PENDING | COMPLETED | ROLLED_OVER
  level: string           // DAILY | WEEKLY | MONTHLY | QUARTERLY | YEARLY
  priority: string        // LOW | MEDIUM | HIGH
  period: string | null
  originalPeriod: string | null  // set once on creation, never changes
  parentGoalId: string | null    // links a sub-goal to its parent in the tree
  createdAt: string
  isRecurring: boolean           // repeats every period until recurrenceEnd
  recurrenceEnd: string | null   // period string; null = repeats forever
  completedPeriods: string[]     // periods a recurring goal was done on
}

export interface AuthResponse {
  token: string
}

export interface ApiError {
  error: string
}
