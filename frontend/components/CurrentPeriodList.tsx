import type { Goal, GoalLevel } from '@/types'

type Props = {
  level: GoalLevel
  title: string
  subtitle: string
  emoji: string
  items: Goal[]
  period: string
  busyId: string | null
  isDone: (goal: Goal, period: string) => boolean
  onToggle: (goal: Goal, period: string) => void
}

const levelStyles: Record<GoalLevel, {
  card: string
  icon: string
  row: string
}> = {
  DAILY: {
    card: 'border-sunny-200 bg-white/75',
    icon: 'from-sunny-200 to-sunny-300',
    row: 'bg-sunny-50/80 hover:bg-sunny-100/80',
  },
  WEEKLY: {
    card: 'border-peachy-100 bg-white/75',
    icon: 'from-sunny-100 to-peachy-200',
    row: 'bg-peachy-50/70 hover:bg-peachy-100/70',
  },
  MONTHLY: {
    card: 'border-peachy-200 bg-white/75',
    icon: 'from-peachy-200 to-peachy-300',
    row: 'bg-peachy-50/70 hover:bg-peachy-100/70',
  },
  QUARTERLY: {
    card: 'border-blossom-100 bg-white/75',
    icon: 'from-blossom-200 to-blossom-300',
    row: 'bg-blossom-50/70 hover:bg-blossom-100/70',
  },
  YEARLY: {
    card: 'border-blossom-200 bg-white/75',
    icon: 'from-sunny-200 to-blossom-200',
    row: 'bg-blossom-50/70 hover:bg-blossom-100/70',
  },
}

export default function CurrentPeriodList({
  level,
  title,
  subtitle,
  emoji,
  items,
  period,
  busyId,
  isDone,
  onToggle,
}: Props) {
  const styles = levelStyles[level]
  const completed = items.filter(goal => isDone(goal, period)).length

  return (
    <section className={`rounded-cute border p-3.5 shadow-sm backdrop-blur ${styles.card}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                        bg-gradient-to-br text-lg shadow-sm ${styles.icon}`}
          >
            {emoji}
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-base font-extrabold leading-tight text-peachy-400">
              {title}
            </h3>
            <p className="text-xs font-semibold text-[#5b3a2e]/45">{subtitle}</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-[#5b3a2e]/45">
          {completed}/{items.length}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {items.map(goal => {
          const done = isDone(goal, period)

          return (
            <li key={goal.id}>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-xl px-2.5 py-2
                            transition ${styles.row}`}
              >
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busyId === goal.id}
                  onChange={() => onToggle(goal, period)}
                  className="mt-0.5 shrink-0 accent-peachy-300"
                />
                <span
                  className={`min-w-0 break-words text-sm font-semibold leading-snug
                              ${done ? 'text-[#5b3a2e]/40 line-through' : 'text-[#5b3a2e]'}`}
                >
                  {goal.isRecurring ? '↻ ' : ''}{goal.title}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
