// Tiny pub/sub so independent components (the shared GoalCalendar in the
// layout vs. the forms/cards inside pages) stay in sync: any component that
// mutates goals calls notifyGoalsChanged(), and the calendar refetches.

export const GOALS_CHANGED_EVENT = 'sunnyside:goals-changed'

export function notifyGoalsChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GOALS_CHANGED_EVENT))
  }
}
