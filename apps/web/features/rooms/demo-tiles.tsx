import { cn } from '@/lib/cn'

/**
 * `.demo` — the five tiles that introduce the colours on the home screen.
 *
 * The one thing on the home screen that animates unprompted, which the motion
 * brief allows because it is what the screen is showing. 500ms with an 80ms
 * stagger, from the prototype's `@keyframes tin`.
 *
 * **CSS, not `motion/react`, on purpose.** A JS-driven entrance has to start
 * from `opacity: 0`, and that initial style is rendered into the HTML — so the
 * product's first impression is a blank gap until React hydrates and a frame
 * ticks. A stylesheet animation runs without waiting for any of that, and the
 * global `prefers-reduced-motion` rule in globals.css collapses it to its end
 * state rather than defeating it.
 *
 * The keyframes are declared here rather than in globals.css, which belongs to
 * workstream 1 and has no other use for them.
 *
 * These tiles are decorative and hold no puzzle: `WORDS` spells the product, and
 * the colours are chosen to show one of each. They are not a board, and there is
 * nothing here for the game to read.
 */

const TILES = [
  { letter: 'W', tone: 'bg-correct' },
  { letter: 'O', tone: 'bg-present' },
  { letter: 'R', tone: 'bg-absent' },
  { letter: 'D', tone: 'bg-correct' },
  { letter: 'S', tone: 'bg-present' },
] as const

const KEYFRAMES = `
@keyframes wr-demo-tile-in {
  from { opacity: 0; transform: translateY(10px) rotateX(-60deg); }
  to   { opacity: 1; transform: none; }
}
`

export function DemoTiles({ className }: { className?: string }) {
  return (
    <div className={cn('mt-[26px] mb-[22px] flex gap-1.5', className)} aria-hidden>
      <style>{KEYFRAMES}</style>
      {TILES.map(({ letter, tone }, index) => (
        <div
          key={letter}
          style={{
            animation: 'wr-demo-tile-in 500ms var(--ease-out) both',
            animationDelay: `${100 + index * 80}ms`,
          }}
          className={cn(
            'grid size-12 place-items-center rounded-sm',
            'text-xl font-semibold text-on-tile',
            tone,
          )}
        >
          {letter}
        </div>
      ))}
    </div>
  )
}
