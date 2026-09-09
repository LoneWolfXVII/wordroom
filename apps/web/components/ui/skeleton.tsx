import { cn } from '@/lib/cn'

/**
 * Placeholders shaped like the thing that is coming.
 *
 * The screens these replace said "Loading the board…" and "Loading your stats…",
 * which is a sentence where content is about to be. A block the size and shape
 * of the real row does not move the layout when the data lands, and does not
 * have to be read.
 *
 * The shimmer is one animation defined once, and it inherits the global
 * reduced-motion fallback in `globals.css` rather than defeating it — under
 * `prefers-reduced-motion` these are simply still.
 */

export function Skeleton({ className, ...rest }: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-surface-2', className)}
      {...rest}
    />
  )
}

/**
 * Four leaderboard rows. Four because that is a full-looking board in a game
 * capped at eight players, and an empty-looking skeleton would suggest the
 * answer before it arrives.
 */
export function BoardSkeleton() {
  return (
    <div className="m-0 list-none p-0" role="status" aria-label="Loading the board">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3 py-2.5">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${9 - row}rem` }} />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

/** The four stat tiles and the distribution under them. */
export function StatsSkeleton() {
  return (
    <div role="status" aria-label="Loading your stats">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((tile) => (
          <Skeleton key={tile} className="h-[60px] rounded-md" />
        ))}
      </div>
      <div className="mt-5 grid gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((bar) => (
          <div key={bar} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3" />
            <Skeleton className="h-3.5" style={{ width: `${20 + ((bar * 37) % 60)}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** The lobby, while the room is still resolving: a title, a lead and member rows. */
export function LobbySkeleton() {
  return (
    <div className="w-full" role="status" aria-label="Loading your room">
      <Skeleton className="h-7 w-40 rounded-md" />
      <Skeleton className="mt-2 h-4 w-56" />
      <div className="mt-6 grid gap-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 flex-1" style={{ maxWidth: `${8 - row}rem` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * The frame a route shows while its client boundary resolves.
 *
 * Both `Suspense` fallbacks in the app were a bare `<Screen />` — a correct
 * background and nothing else, which on a slow connection is a blank page. This
 * keeps the screen's shape: a heading, a line under it, and a footer action
 * where one is about to be.
 */
export function ScreenFallback() {
  return (
    <div className="flex h-full flex-col px-5 pb-[env(safe-area-inset-bottom)]">
      <div className="min-h-14 flex-none" />
      <Skeleton className="mt-[18px] h-7 w-48 rounded-md" />
      <Skeleton className="mt-3 h-4 w-64" />
      <div className="mt-auto grid gap-2.5 pt-4 pb-5">
        <Skeleton className="h-12 rounded-md" />
      </div>
    </div>
  )
}
