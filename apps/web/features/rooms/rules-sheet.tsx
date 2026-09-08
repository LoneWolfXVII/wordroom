'use client'

import { Sheet } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * `#rulesSheet` — "How to play", opened from the home screen.
 *
 * The three swatches are named exactly as the tiles are, which CLAUDE.md
 * requires. Nothing here is generated from a puzzle: the example words are
 * fixed, decorative strings.
 *
 * The settings sheet also links to this. If workstream 4 wants one canonical
 * copy, this is the one to move — it does not depend on anything in this
 * feature.
 */

const EXAMPLES = [
  {
    word: 'WEARY',
    markedIndex: 0,
    tone: 'correct',
    label: 'Green',
    hint: 'right letter, right spot',
  },
  {
    word: 'PILOT',
    markedIndex: 1,
    tone: 'present',
    label: 'Yellow',
    hint: 'in the word, wrong spot',
  },
  { word: 'VAGUE', markedIndex: 3, tone: 'absent', label: 'Gray', hint: 'not in the word' },
] as const

const TONE_CLASS = {
  correct: 'border-transparent bg-correct text-on-tile',
  present: 'border-transparent bg-present text-on-tile',
  absent: 'border-transparent bg-absent text-on-tile',
} as const

export function RulesSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="How to play"
      description="Guess the word in six tries"
    >
      {EXAMPLES.map(({ word, markedIndex, tone, label, hint }) => (
        <div key={word} className="flex items-center gap-3 py-2.5 text-sm text-ink-2">
          <div className="flex flex-none gap-1" aria-hidden>
            {word.split('').map((letter, index) => (
              <div
                key={`${word}-${letter}-${index.toString()}`}
                className={cn(
                  'grid size-[34px] place-items-center rounded-[5px] border-[1.5px]',
                  'text-[15px] font-semibold',
                  index === markedIndex ? TONE_CLASS[tone] : 'border-line bg-surface text-ink',
                )}
              >
                {letter}
              </div>
            ))}
          </div>
          <div>
            <b className="font-medium text-ink">{label}</b> — {hint}
          </div>
        </div>
      ))}

      <h3 className="mt-[18px] mb-1 text-sm font-semibold">Rooms</h3>
      <p className="mb-1.5 text-sm leading-[1.45] text-ink-2">
        Everyone in a room gets the same words in the same order. Play at your own pace — nobody
        waits for anyone.
      </p>

      <h3 className="mt-[18px] mb-1 text-sm font-semibold">Scoring</h3>
      <p className="mb-1.5 text-sm leading-[1.45] text-ink-2">
        Solve on your first guess for 6 points, second for 5, and so on. Fail and you get 0. Time
        only breaks ties.
      </p>

      <h3 className="mt-[18px] mb-1 text-sm font-semibold">Names</h3>
      <p className="mb-1.5 text-sm leading-[1.45] text-ink-2">
        Your name is locked when you join a room. There is no way to change it later.
      </p>
    </Sheet>
  )
}
