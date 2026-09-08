import { cn } from '@/lib/cn'

export interface AvatarProps {
  /** The player's locked display name. The initial is taken from it. */
  name: string
  /** `.av.me` — fills the circle with the accent for the viewer's own row. */
  me?: boolean
  /**
   * Give the circle an accessible name. Leave it off — the default — wherever
   * the player's name is already visible next to it, which is every use in the
   * prototype.
   */
  label?: string
  className?: string
}

/**
 * `.av` — a 34px circle holding the first letter of a player's name.
 *
 * Decorative by default: it repeats a name that is always beside it, so
 * announcing it again would just be noise.
 */
export function Avatar({ name, me = false, label, className }: AvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'grid size-[34px] flex-none place-items-center rounded-full text-[13px] font-semibold',
        me ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-2',
        className,
      )}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {initial}
    </div>
  )
}
