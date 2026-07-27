// Shared shape for AI Mode's generated plan — used by both the server route
// (app/api/ai-plan/route.ts) and the client panel (components/AIPlanner.tsx).
//
// The plan is week-by-week, day-by-day: each week has a title/target and a list
// of numbered days. Day numbers are absolute across the whole plan (Day 1 =
// today, Day 8 = first day of week 2, ...) so a single day can be cherry-picked
// and still land on the right calendar date.

export type AIPlanDay = {
  day: number             // 1-based, absolute across the plan (day 8 = week 2)
  title: string           // short summary of the day, e.g. "Heaps + Spring Boot DI"
  plan: string            // the full time-blocked plan for the day
  deliverable?: string | null
}

export type AIPlanWeek = {
  title: string           // e.g. "Week 1 — Baseline and core foundations"
  target?: string | null  // what you should be able to do by end of week
  days: AIPlanDay[]
}

export type AISource = {
  title: string
  link: string
}

export type AIPlan = {
  title: string
  description: string | null
  weeks: AIPlanWeek[]
  sources: AISource[]
}
