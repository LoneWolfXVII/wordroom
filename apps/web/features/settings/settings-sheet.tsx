'use client'

import type { TimerMode } from '@wordroom/shared'
import { type ReactNode, useId, useState } from 'react'
import {
  Chip,
  ChipRow,
  Expand,
  RadioGroup,
  RadioOption,
  SettingNote,
  SettingRow,
  Sheet,
  Stepper,
  Switch,
  toast,
} from '@/components/ui'
import {
  formatSeconds,
  isCustomPerPuzzle,
  isTimerMode,
  MAX_PER_PUZZLE_SECONDS,
  MIN_PER_PUZZLE_SECONDS,
  PER_GUESS_SECONDS,
  PER_PUZZLE_PRESETS,
  PER_PUZZLE_STEP_SECONDS,
  SPRINT_SOLVES,
} from './settings'
import { useSettingsStore } from './use-settings'

/**
 * Tall enough for three radio rows, the preset chips, the custom stepper and the
 * note. `Expand` clips at its max-height, and this group is taller than the
 * primitive's 320px default once every timer mode is listed.
 */
const TIMER_GROUP_HEIGHT = 340

export interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Rows owned by other workstreams — the Account row (workstream 3) and
   * "How to play" (workstream 1's rules sheet). They render as siblings of the
   * rows above, so pass `SettingRow`s and nothing else.
   */
  footer?: ReactNode
}

/**
 * `#setSheet` — timer modes, presets, custom limit, hard mode.
 *
 * Every setting here is per player, never per room, and none of them touches the
 * puzzle currently on screen: the store keeps an `active` copy that only moves
 * forward when the next puzzle starts.
 */
export function SettingsSheet({ open, onOpenChange, footer }: SettingsSheetProps) {
  const settings = useSettingsStore((state) => state.settings)
  const active = useSettingsStore((state) => state.active)
  const update = useSettingsStore((state) => state.update)

  const timerId = useId()
  const hardId = useId()

  // The mode to come back to when the timer is switched off and on again.
  const [lastTimerMode, setLastTimerMode] = useState<Exclude<TimerMode, 'off'>>('per-puzzle')
  const [customOpen, setCustomOpen] = useState(() => isCustomPerPuzzle(settings.perPuzzleSeconds))

  const timerOn = settings.timerMode !== 'off'
  const hardModePending = settings.hardMode !== active.hardMode

  const toggleTimer = (on: boolean) => {
    update({ timerMode: on ? lastTimerMode : 'off' })
    toast(on ? 'Timer on from next puzzle' : 'Timer off')
  }

  const chooseMode = (value: string) => {
    if (!isTimerMode(value) || value === 'off') return
    setLastTimerMode(value)
    update({ timerMode: value })
  }

  const choosePreset = (seconds: number) => {
    setCustomOpen(false)
    update({ perPuzzleSeconds: seconds })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Only affect your own play"
    >
      <SettingRow
        label="Timer"
        hint="Off by default. Adds a time column on the board."
        htmlFor={timerId}
        control={<Switch id={timerId} checked={timerOn} onCheckedChange={toggleTimer} />}
      />

      <Expand open={timerOn} maxHeight={TIMER_GROUP_HEIGHT}>
        <RadioGroup
          value={settings.timerMode === 'off' ? lastTimerMode : settings.timerMode}
          onValueChange={chooseMode}
          aria-label="Timer mode"
        >
          <RadioOption value="per-puzzle" detail={formatSeconds(settings.perPuzzleSeconds)}>
            Per puzzle
          </RadioOption>

          <ChipRow>
            {PER_PUZZLE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                selected={!customOpen && settings.perPuzzleSeconds === preset}
                onClick={() => choosePreset(preset)}
              >
                {formatSeconds(preset)}
              </Chip>
            ))}
            <Chip selected={customOpen} onClick={() => setCustomOpen(true)}>
              Custom
            </Chip>
          </ChipRow>

          {customOpen ? (
            <Stepper
              value={settings.perPuzzleSeconds}
              onValueChange={(seconds) => update({ perPuzzleSeconds: seconds })}
              min={MIN_PER_PUZZLE_SECONDS}
              max={MAX_PER_PUZZLE_SECONDS}
              step={PER_PUZZLE_STEP_SECONDS}
              format={formatSeconds}
              label="Time per puzzle"
              hint="30s steps, up to 10:00"
            />
          ) : null}

          <RadioOption value="per-guess" detail={`${PER_GUESS_SECONDS}s`}>
            Per guess
          </RadioOption>
          <RadioOption value="sprint" detail={`fastest ${SPRINT_SOLVES} solves`}>
            Sprint
          </RadioOption>
        </RadioGroup>

        <SettingNote>Changes apply from your next puzzle.</SettingNote>
      </Expand>

      <SettingRow
        label="Hard mode"
        hint="Greens must stay put, yellows must be reused. Marked on the leaderboard."
        htmlFor={hardId}
        control={
          <Switch
            id={hardId}
            checked={settings.hardMode}
            onCheckedChange={(hardMode) => update({ hardMode })}
          />
        }
      />
      {hardModePending ? <SettingNote>Applies from your next puzzle.</SettingNote> : null}

      {footer}
    </Sheet>
  )
}
