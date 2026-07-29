import type { GoalLevel } from '@/types'

export type RolloverSummary = {
  rolledOver: number
  byLevel: Partial<Record<GoalLevel, number>>
}

const LEVEL_LABELS: Record<GoalLevel, string> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
}

export function rolloverBreakdown(summary: RolloverSummary): string {
  return (Object.entries(summary.byLevel) as Array<[GoalLevel, number]>)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${LEVEL_LABELS[level]}`)
    .join(', ')
}
