// The little gradient "coin" used by every section header (Magic Planner,
// Plant a year goal, Calendar, Your goals, ...). One place to restyle them all.
type Props = {
  emoji: string
  gradient?: string      // tailwind from-x to-y classes
  size?: 'sm' | 'md'
  className?: string
}

export default function Coin({
  emoji,
  gradient = 'from-peachy-200 to-blossom-200',
  size = 'sm',
  className = '',
}: Props) {
  const dims = size === 'md' ? 'h-9 w-9 text-lg' : 'h-7 w-7 text-sm'
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br shadow-sm ${gradient} ${dims} ${className}`}
    >
      {emoji}
    </span>
  )
}
