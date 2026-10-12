'use client'

import { MODES, type Mode } from '@wordroom/shared'
import { Icon, IconButton, ScrollingText, SegmentedControl } from '@/components/ui'
import { ForwardIcon, LeaderboardIcon, SettingsIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { PuzzleNumber } from './puzzle-number'

const MODE_OPTIONS = MODES.map((mode) => ({
  value: String(mode),
  label: mode === 4 ? 'Four' : String(mode),
}))

export interface GameHeaderProps {
  roomName: string | null
  /** The puzzle number, or null while it loads. */
  number: number | null
  /** The line under the number: the clock, or where you are. */
  subtitle: string
  /** The subtitle is a running clock: tabular numerals. */
  timed?: boolean
  /** The clock is nearly out. */
  urgent?: boolean
  mode: Mode
  onModeChange: (mode: Mode) => void
  showModes?: boolean
  onOpenRoom?: (() => void) | undefined
  onOpenLeaderboard?: (() => void) | undefined
  onOpenSettings?: (() => void) | undefined
  leaderboardUpdate?: boolean
}

/**
 * The game's header and its game switcher, shared by the single-board screen
 * and Four at once so that switching between them moves nothing on screen.
 */
export function GameHeader({
  roomName,
  number,
  subtitle,
  timed = false,
  urgent = false,
  mode,
  onModeChange,
  showModes = true,
  onOpenRoom,
  onOpenLeaderboard,
  onOpenSettings,
  leaderboardUpdate = false,
}: GameHeaderProps) {
  return (
    <>
      {/*
       * `minmax(0,1fr)`, not `1fr`. A bare `1fr` is `minmax(auto,1fr)`, so a
       * column refuses to shrink below its content — and the room-name button
       * on the left is wider than the two icons on the right, so it took more
       * than its half and pushed the puzzle number off centre. A long room name
       * moved "No. 2" 25px to the right of the board it sits above.
       *
       * Zero as the floor lets both sides settle equal and truncate instead.
       * The number is what has to be centred; the room name already ellipsises.
       */}
      <header className="grid min-h-14 flex-none grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 pt-1.5">
        <div>
          {onOpenRoom === undefined ? null : (
            <button
              type="button"
              onClick={onOpenRoom}
              className={cn(
                'flex h-9 w-full max-w-[150px] items-center gap-1.5 rounded-md pr-2.5 pl-3',
                'text-sm font-medium text-ink-2 transition-colors duration-(--duration-micro) active:bg-surface-2',
              )}
            >
              {/*
               * `min-w-0` is inside `ScrollingText`. Without it the span's
               * flex parent sized it to its content, `truncate` never engaged,
               * and a long room name ran straight under the puzzle number
               * instead of stopping at the 150px cap.
               */}
              <ScrollingText>{roomName ?? 'Room'}</ScrollingText>
              <Icon icon={ForwardIcon} size={16} className="flex-none" />
            </button>
          )}
        </div>

        {/*
         * `max-w` on the middle column, because it is an `auto` track: it was
         * sized by the longest thing in it, and "Puzzle 3 in Teeehehehehehe" is
         * far longer than "No. 3". A long room name therefore widened the
         * centre and squeezed both sides until the name button had nowhere to
         * go. The number is what must stay centred; the sentence under it can
         * ellipsise.
         */}
        <div className="mx-auto max-w-[52vw] text-center leading-none">
          <PuzzleNumber number={number} />
          <div
            className={cn(
              'mt-[3px] truncate text-[12px] text-muted',
              timed && 'tabular',
              urgent && 'text-accent',
            )}
          >
            {subtitle}
          </div>
        </div>

        <div className="flex justify-end gap-0.5">
          {onOpenLeaderboard === undefined ? null : (
            <IconButton
              icon={LeaderboardIcon}
              label="Leaderboard"
              notification={leaderboardUpdate}
              onClick={onOpenLeaderboard}
            />
          )}
          {onOpenSettings === undefined ? null : (
            <IconButton icon={SettingsIcon} label="Settings" onClick={onOpenSettings} />
          )}
        </div>
      </header>

      {showModes ? (
        <div className="mt-1 flex flex-none justify-center">
          <SegmentedControl
            options={MODE_OPTIONS}
            value={String(mode)}
            onValueChange={(next) => onModeChange(Number(next) as Mode)}
            label="Game"
          />
        </div>
      ) : null}
    </>
  )
}
