import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SettingRowProps {
  /** The setting's name. */
  label: ReactNode
  /** `.set .hint` — the sentence under the name. */
  hint?: ReactNode
  /** The switch, button or chip on the right. */
  control: ReactNode
  /**
   * The `id` of the control, so the name becomes a real `<label>` and clicking
   * it operates the control. Omit only when the control carries its own
   * `aria-label`.
   */
  htmlFor?: string
  className?: string
}

/**
 * `.set` — one row of a settings sheet: name, optional hint, control.
 *
 * Rows divide themselves with a top hairline and the first one drops it, so put
 * them next to each other and add nothing between.
 */
export function SettingRow({ label, hint, control, htmlFor, className }: SettingRowProps) {
  const name = htmlFor ? (
    <label htmlFor={htmlFor} className="cursor-pointer">
      {label}
    </label>
  ) : (
    <span>{label}</span>
  )

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-line border-t py-3.5 text-[15px] first:border-t-0',
        className,
      )}
    >
      <div className="min-w-0">
        {name}
        {hint === undefined ? null : (
          <div className="mt-[3px] text-[13px] leading-[1.35] text-muted">{hint}</div>
        )}
      </div>
      {control}
    </div>
  )
}

/** `.note` — the aside under an expanded group, at the settings indent. */
export function SettingNote({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('pb-2.5 pl-8 text-[12px] text-muted', className)}>{children}</div>
}
