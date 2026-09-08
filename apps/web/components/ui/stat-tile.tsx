import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface StatTileProps {
  /** The number. Always rendered with tabular figures so it cannot reflow. */
  value: ReactNode
  /** The caption under it, lowercase: "guesses", "time", "rank". */
  label: ReactNode
  /** `.stat .v.up` — renders the value in --correct, for a rank that improved. */
  positive?: boolean
  className?: string
}

/** `.stat` — one figure from a result sheet or the stats tab. */
export function StatTile({ value, label, positive = false, className }: StatTileProps) {
  return (
    <div className={cn('rounded-md bg-surface-2 px-2 py-3 text-center', className)}>
      <div className={cn('tabular text-[20px] font-semibold', positive && 'text-correct')}>
        {value}
      </div>
      <div className="mt-0.5 text-[12px] text-muted">{label}</div>
    </div>
  )
}

export interface StatGridProps {
  /** Three across is the result sheet; the stats tab wants four. */
  columns?: 2 | 3 | 4
  children: ReactNode
  className?: string
}

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
}

/** `.stats` — the row a set of tiles sits in. */
export function StatGrid({ columns = 3, children, className }: StatGridProps) {
  return <div className={cn('grid gap-2', COLUMNS[columns], className)}>{children}</div>
}
