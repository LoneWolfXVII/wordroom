'use client'

import { useState } from 'react'
import {
  Button,
  Card,
  CardLabel,
  CodeBoxes,
  CodeDisplay,
  Field,
  Help,
  Icon,
  IconButton,
  Input,
  Label,
  RadioGroup,
  RadioOption,
  Screen,
  ScreenFooter,
  ScreenLead,
  ScreenTitle,
  ScreenTop,
  ScreenTopSpacer,
  SegmentedControl,
  Sheet,
  Switch,
  toast,
} from '@/components/ui'
import {
  BackIcon,
  CopyIcon,
  LeaderboardIcon,
  LinkIcon,
  PlayersIcon,
  RulesIcon,
  SettingsIcon,
  ShareIcon,
  TimerIcon,
} from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { Section, Specimen, TokenRow, useTokenValues } from './parts'

const COLOUR_TOKENS = [
  ['--color-bg', 'Page background, warm white'],
  ['--color-surface', 'Cards, inputs, unfilled tiles'],
  ['--color-surface-2', 'Pressed states, segmented track, muted bars'],
  ['--color-ink', 'Primary text'],
  ['--color-ink-2', 'Secondary text, icon buttons'],
  ['--color-muted', 'Captions, hints, inactive segments'],
  ['--color-line', 'Default borders'],
  ['--color-line-2', 'Filled-tile and filled-code borders'],
  ['--color-accent', 'Primary button, focus ring, notification dot'],
  ['--color-accent-soft', 'Focus glow behind inputs'],
  ['--color-accent-pressed', 'Primary button :active'],
  ['--color-on-accent', 'Text on accent'],
  ['--color-danger', 'Leave room, name taken'],
  ['--color-correct', 'Correct tile'],
  ['--color-present', 'Present tile'],
  ['--color-absent', 'Absent tile'],
  ['--color-key', 'Unused keyboard key'],
  ['--color-key-pressed', 'Key :active'],
  ['--color-on-tile', 'Text on a coloured tile'],
] as const

const RADIUS_TOKENS = [
  ['--radius-sm', 'Tiles, keys', 'rounded-sm'],
  ['--radius-md', 'Buttons, inputs, icon buttons', 'rounded-md'],
  ['--radius-lg', 'Cards, sheets', 'rounded-lg'],
] as const

const SHADOW_TOKENS = [
  ['--shadow-sm', 'Cards, segmented indicator', 'shadow-sm'],
  ['--shadow-md', 'Toast', 'shadow-md'],
  ['--shadow-lg', 'Sheets', 'shadow-lg'],
] as const

const DURATION_TOKENS = [
  ['--duration-micro', 'Press, hover, tile pop'],
  ['--duration-state', 'Colour and border changes'],
  ['--duration-struct', 'Sheets, screen transitions, board swap'],
  ['--duration-reveal', 'Row flip, 70ms stagger between tiles'],
] as const

const EASING_TOKENS = [
  ['--ease-out', 'Entering'],
  ['--ease-in', 'Leaving'],
  ['--ease-spring', 'Overshoot: bounce, segmented indicator'],
] as const

const METRIC_TOKENS = [
  ['--size-tile', 'Board tile'],
  ['--size-gap', 'Board gap'],
  ['--breakpoint-panel', 'Framed layout, sheet becomes a right panel'],
] as const

const TOKEN_NAMES = [
  ...COLOUR_TOKENS.map(([name]) => name),
  ...RADIUS_TOKENS.map(([name]) => name),
  ...SHADOW_TOKENS.map(([name]) => name),
  ...DURATION_TOKENS.map(([name]) => name),
  ...EASING_TOKENS.map(([name]) => name),
  ...METRIC_TOKENS.map(([name]) => name),
]

const MODE_OPTIONS = [
  { value: '5', label: '5' },
  { value: '6', label: '6' },
  { value: '7', label: '7' },
] as const

const RANGE_OPTIONS = [
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
] as const

const ICON_SET = [
  ['Back', BackIcon],
  ['Leaderboard', LeaderboardIcon],
  ['Settings', SettingsIcon],
  ['Rules', RulesIcon],
  ['Copy', CopyIcon],
  ['Link', LinkIcon],
  ['Share', ShareIcon],
  ['Players', PlayersIcon],
  ['Timer', TimerIcon],
] as const

/** Forced `:focus-visible`, matching the global outline in globals.css. */
const FOCUS = 'outline-2 outline-offset-2 outline-accent'

export function DesignSystem() {
  const tokens = useTokenValues(TOKEN_NAMES)

  const [mode, setMode] = useState<string>('5')
  const [range, setRange] = useState<string>('week')
  const [timerOn, setTimerOn] = useState(false)
  const [hardMode, setHardMode] = useState(true)
  const [timerMode, setTimerMode] = useState('puzzle')
  const [code, setCode] = useState('KH')
  const [roomName, setRoomName] = useState('')
  const [plainSheet, setPlainSheet] = useState(false)
  const [richSheet, setRichSheet] = useState(false)
  const [moved, setMoved] = useState(false)

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-5 pb-16">
      <header className="pt-8 pb-6">
        <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]">
          Design system
        </h1>
        <p className="mt-1.5 text-[15px] leading-[1.45] text-ink-2">
          Every token and every component state, inside the real 520px shell. Values are read off{' '}
          <code className="text-[13px]">:root</code> at runtime, so this page cannot drift from
          globals.css.
        </p>
        <p className="mt-3 text-[13px] leading-[1.45] text-muted">
          Note: the prototype defines no hover states — it is touch-first. Every control's only
          pointer feedback is <code className="text-[12px]">:active</code>.
        </p>
      </header>

      <Section id="colour" title="Colour" note="Light mode only. There is no dark variant.">
        <div className="flex flex-col gap-3">
          {COLOUR_TOKENS.map(([name, usage]) => (
            <TokenRow
              key={name}
              name={name}
              value={tokens[name] ?? ''}
              usage={usage}
              preview={
                <div
                  className="size-9 flex-none rounded-md border border-line"
                  style={{ background: `var(${name})` }}
                />
              }
            />
          ))}
        </div>
      </Section>

      <Section id="tiles" title="Tile and key swatches" note="The Rules page must use these names.">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['correct', 'bg-correct'],
              ['present', 'bg-present'],
              ['absent', 'bg-absent'],
            ] as const
          ).map(([name, background]) => (
            <div key={name} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'grid size-14 place-items-center rounded-sm text-[24px] font-semibold text-on-tile uppercase',
                  background,
                )}
              >
                {name.charAt(0)}
              </div>
              <span className="text-[12px] text-muted">{name}</span>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1.5">
            <div className="grid size-14 place-items-center rounded-sm border-[1.5px] border-line bg-surface text-[24px] font-semibold uppercase">
              A
            </div>
            <span className="text-[12px] text-muted">empty</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="grid size-14 place-items-center rounded-sm border-[1.5px] border-line-2 bg-surface text-[24px] font-semibold uppercase">
              B
            </div>
            <span className="text-[12px] text-muted">filled</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="grid h-[54px] w-[42px] place-items-center rounded-sm bg-key text-[15px] font-medium uppercase">
              C
            </div>
            <span className="text-[12px] text-muted">key</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="grid h-[54px] w-[42px] place-items-center rounded-sm bg-key-pressed text-[15px] font-medium uppercase">
              D
            </div>
            <span className="text-[12px] text-muted">key active</span>
          </div>
        </div>
      </Section>

      <Section id="radius" title="Radius and elevation">
        <div className="flex flex-col gap-3">
          {RADIUS_TOKENS.map(([name, usage, utility]) => (
            <TokenRow
              key={name}
              name={utility}
              value={tokens[name] ?? ''}
              usage={usage}
              preview={
                <div
                  className="size-9 flex-none border border-line bg-surface-2"
                  style={{ borderRadius: `var(${name})` }}
                />
              }
            />
          ))}
          {SHADOW_TOKENS.map(([name, usage, utility]) => (
            <TokenRow
              key={name}
              name={utility}
              value={tokens[name] ?? ''}
              usage={usage}
              preview={
                <div
                  className="size-9 flex-none rounded-md bg-surface"
                  style={{ boxShadow: `var(${name})` }}
                />
              }
            />
          ))}
        </div>
      </Section>

      <Section id="metrics" title="Metrics">
        <div className="flex flex-col gap-3">
          {METRIC_TOKENS.map(([name, usage]) => (
            <TokenRow
              key={name}
              name={name}
              value={tokens[name] ?? ''}
              usage={usage}
              preview={<div className="size-9 flex-none" />}
            />
          ))}
        </div>
      </Section>

      <Section
        id="motion"
        title="Motion"
        note="Nothing exceeds 600ms. Turn on reduced motion and every bar below snaps."
      >
        <div>
          <Button size="sm" onClick={() => setMoved((value) => !value)}>
            Play
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          {DURATION_TOKENS.map(([name, usage]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium">{name}</span>
                <code className="tabular text-[12px] text-ink-2">{tokens[name] ?? '—'}</code>
              </div>
              <div className="text-[12px] text-muted">{usage}</div>
              <div className="h-2 rounded-full bg-surface-2">
                <div
                  className="h-2 w-8 rounded-full bg-accent transition-[margin-left] ease-out"
                  style={{
                    transitionDuration: `var(${name})`,
                    marginLeft: moved ? 'calc(100% - 2rem)' : 0,
                  }}
                />
              </div>
            </div>
          ))}
          {EASING_TOKENS.map(([name, usage]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] font-medium">{name}</span>
                <code className="text-[12px] text-ink-2">{tokens[name] ?? '—'}</code>
              </div>
              <div className="text-[12px] text-muted">{usage}</div>
              <div className="h-2 rounded-full bg-surface-2">
                <div
                  className="h-2 w-8 rounded-full bg-accent transition-[margin-left] duration-struct"
                  style={{
                    transitionTimingFunction: `var(${name})`,
                    marginLeft: moved ? 'calc(100% - 2rem)' : 0,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Type" note="Geist, one family. Tabular numerals on every number.">
        <div className="flex flex-col gap-3">
          <div className="text-[36px] leading-none font-semibold tracking-[-0.03em]">Wordroom</div>
          <div className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]">
            Screen heading
          </div>
          <div className="text-[18px] font-semibold">Sheet heading</div>
          <div className="text-[17px]">Input and lead text</div>
          <div className="text-[15px] text-ink-2">Body, secondary</div>
          <div className="text-sm text-ink-2">Small, 14px</div>
          <div className="text-[13px] text-muted">Caption and help, 13px</div>
          <div className="text-[12px] text-muted">Smallest, 12px</div>
          <div className="flex gap-6">
            <div>
              <div className="tabular text-[24px] font-semibold">1 111 · 3:00</div>
              <div className="text-[12px] text-muted">.tabular</div>
            </div>
            <div>
              <div className="text-[24px] font-semibold">1 111 · 3:00</div>
              <div className="text-[12px] text-muted">proportional</div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="icons"
        title="Icons"
        note="Hugeicons free, Stroke Rounded, 18-20 at stroke 1.6. Named in components/ui/icons.ts."
      >
        <div className="flex flex-wrap gap-4">
          {ICON_SET.map(([name, icon]) => (
            <div key={name} className="flex w-16 flex-col items-center gap-1.5 text-ink-2">
              <Icon icon={icon} />
              <span className="text-center text-[11px] text-muted">{name}</span>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-4 text-ink-2">
          <div className="flex flex-col items-center gap-1.5">
            <Icon icon={LeaderboardIcon} size={18} />
            <span className="text-[11px] text-muted">18</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Icon icon={LeaderboardIcon} size={20} />
            <span className="text-[11px] text-muted">20 (default)</span>
          </div>
        </div>
      </Section>

      <Section id="button" title="Button" note="Four looks, three heights. Only :active reacts.">
        {(['primary', 'default', 'ghost', 'danger'] as const).map((variant) => (
          <div key={variant} className="flex flex-col gap-2.5">
            <div className="text-[12px] font-medium text-ink-2">{variant}</div>
            <Button variant={variant}>Default</Button>
            <Button
              variant={variant}
              className={cn(
                'scale-[0.98]',
                variant === 'primary' && 'bg-accent-pressed',
                variant === 'ghost' && 'bg-surface-2',
              )}
            >
              Active (forced)
            </Button>
            <Button variant={variant} className={FOCUS}>
              Focus-visible (forced)
            </Button>
            <Button variant={variant} disabled>
              Disabled
            </Button>
            <Button variant={variant} loading>
              Loading
            </Button>
          </div>
        ))}
        <Specimen label="size sm" state="inline, sized to its label">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">Open</Button>
            <Button size="sm" variant="primary">
              Lock it
            </Button>
            <Button size="sm" variant="ghost">
              Not now
            </Button>
            <Button size="sm" disabled>
              Disabled
            </Button>
            <Button size="sm" loading>
              Saving
            </Button>
          </div>
        </Specimen>
        <Specimen label="with an icon">
          <div className="grid grid-cols-2 gap-2.5">
            <Button>
              <Icon icon={CopyIcon} size={18} />
              Copy code
            </Button>
            <Button>
              <Icon icon={ShareIcon} size={18} />
              Share link
            </Button>
          </div>
        </Specimen>
      </Section>

      <Section id="icon-button" title="Icon button" note="40px square, 44px hit target.">
        <div className="flex items-center gap-3">
          <Specimen label="default">
            <IconButton icon={SettingsIcon} label="Settings" />
          </Specimen>
          <Specimen label="notification">
            <IconButton icon={LeaderboardIcon} label="Leaderboard" notification />
          </Specimen>
          <Specimen label="active" state="forced">
            <IconButton
              icon={SettingsIcon}
              label="Settings"
              className="scale-[0.92] bg-surface-2"
            />
          </Specimen>
          <Specimen label="focus" state="forced">
            <IconButton icon={SettingsIcon} label="Settings" className={FOCUS} />
          </Specimen>
          <Specimen label="disabled">
            <IconButton icon={SettingsIcon} label="Settings" disabled />
          </Specimen>
        </div>
      </Section>

      <Section id="card" title="Card">
        <Card>
          <CardLabel>Room code</CardLabel>
          <CodeDisplay code="KHX7" />
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Button onClick={() => toast('Code copied')}>
              <Icon icon={CopyIcon} size={18} />
              Copy code
            </Button>
            <Button onClick={() => toast('Link copied')}>
              <Icon icon={LinkIcon} size={18} />
              Share link
            </Button>
          </div>
        </Card>
      </Section>

      <Section id="input" title="Input and field">
        <Field>
          <Label htmlFor="ds-room">Room name</Label>
          <Input
            id="ds-room"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="Friday crew"
            maxLength={24}
            autoComplete="off"
          />
          <Help>Shown at the top of everyone&rsquo;s game.</Help>
        </Field>
        <Specimen label="focus" state="forced">
          <Input
            readOnly
            value="Friday crew"
            className="border-accent shadow-[0_0_0_3px_var(--color-accent-soft)]"
          />
        </Specimen>
        <Specimen label="invalid">
          <Input readOnly aria-invalid value="Priya" />
        </Specimen>
        <Specimen label="disabled">
          <Input disabled value="Locked" readOnly />
        </Specimen>
        <Specimen label="help tones">
          <div className="flex flex-col gap-1.5">
            <Help>Names are locked once confirmed. No changes, no renames.</Help>
            <Help tone="ok">Available. Names are locked once confirmed.</Help>
            <Help tone="error">Someone in this room already has that name.</Help>
          </div>
        </Specimen>
      </Section>

      <Section
        id="segmented"
        title="Segmented control"
        note="Radix single toggle group: arrow keys move, the indicator springs."
      >
        <Specimen label="three up" state={`selected: ${mode}`}>
          <SegmentedControl
            label="Word length"
            options={MODE_OPTIONS}
            value={mode}
            onValueChange={setMode}
          />
        </Specimen>
        <Specimen label="two up" state={`selected: ${range}`}>
          <SegmentedControl
            label="Leaderboard range"
            options={RANGE_OPTIONS}
            value={range}
            onValueChange={setRange}
            className="w-50"
          />
        </Specimen>
      </Section>

      <Section id="switch" title="Switch">
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-4 py-3.5 text-[15px]">
            <div>
              Timer
              <div className="mt-[3px] text-[13px] leading-[1.35] text-muted">
                Off by default. Adds a time column on the board.
              </div>
            </div>
            <Switch checked={timerOn} onCheckedChange={setTimerOn} aria-label="Timer" />
          </div>
          <div className="flex items-center justify-between gap-4 border-line border-t py-3.5 text-[15px]">
            <div>
              Hard mode
              <div className="mt-[3px] text-[13px] leading-[1.35] text-muted">
                Greens must stay put, yellows must be reused.
              </div>
            </div>
            <Switch checked={hardMode} onCheckedChange={setHardMode} aria-label="Hard mode" />
          </div>
          <div className="flex items-center justify-between gap-4 border-line border-t py-3.5 text-[15px]">
            <div>Disabled, off</div>
            <Switch checked={false} disabled aria-label="Disabled off" />
          </div>
          <div className="flex items-center justify-between gap-4 border-line border-t py-3.5 text-[15px]">
            <div>Disabled, on</div>
            <Switch checked disabled aria-label="Disabled on" />
          </div>
          <div className="flex items-center justify-between gap-4 border-line border-t py-3.5 text-[15px]">
            <div>Focus-visible (forced)</div>
            <Switch
              checked={false}
              onCheckedChange={() => {}}
              className={FOCUS}
              aria-label="Focused"
            />
          </div>
        </div>
      </Section>

      <Section id="radio" title="Radio group">
        <RadioGroup value={timerMode} onValueChange={setTimerMode} aria-label="Timer mode">
          <RadioOption value="puzzle" detail="3:00">
            Per puzzle
          </RadioOption>
          <RadioOption value="guess" detail="20s">
            Per guess
          </RadioOption>
          <RadioOption value="sprint" detail="fastest 5 solves">
            Sprint
          </RadioOption>
          <RadioOption value="unavailable" detail="soon" disabled>
            Disabled option
          </RadioOption>
        </RadioGroup>
        <Specimen label="focus" state="forced">
          <RadioGroup value="a" aria-label="Focused example">
            <RadioOption value="a" className={FOCUS}>
              Focused, selected
            </RadioOption>
          </RadioGroup>
        </Specimen>
      </Section>

      <Section
        id="code"
        title="Code boxes"
        note="Type, paste or backspace. Only room-code characters are accepted."
      >
        <Specimen label="interactive" state={code || 'empty'}>
          <CodeBoxes label="Room code" value={code} onValueChange={setCode} />
        </Specimen>
        <Specimen label="empty">
          <CodeBoxes label="Empty example" value="" onValueChange={() => {}} />
        </Specimen>
        <Specimen label="invalid">
          <CodeBoxes label="Invalid example" value="ZZZZ" onValueChange={() => {}} invalid />
        </Specimen>
        <Specimen label="disabled">
          <CodeBoxes label="Disabled example" value="KHX7" onValueChange={() => {}} disabled />
        </Specimen>
        <Specimen label="read-only display" state=".codebox.big">
          <CodeDisplay code="KHX7" />
        </Specimen>
      </Section>

      <Section
        id="sheet"
        title="Sheet"
        note="Bottom sheet on a phone, fixed right panel from 820px. Escape closes; focus is trapped."
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={() => setPlainSheet(true)}>Plain sheet</Button>
          <Button onClick={() => setRichSheet(true)}>With action</Button>
        </div>
      </Section>

      <Section
        id="toast"
        title="Toast"
        note="One at a time, 1300ms, one short line. It does not wrap."
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Button size="sm" onClick={() => toast('Code copied')}>
            Code copied
          </Button>
          <Button size="sm" onClick={() => toast('Not enough letters')}>
            Not enough letters
          </Button>
          <Button size="sm" onClick={() => toast('Timer on from next puzzle')}>
            Timer on
          </Button>
          <Button size="sm" onClick={() => toast('Priya joined')}>
            Priya joined
          </Button>
        </div>
      </Section>

      <Section
        id="shell"
        title="Screen composition"
        note="ScreenTop, ScreenTitle, ScreenLead and ScreenFooter, at the real gutter."
      >
        <div className="h-[420px] overflow-hidden rounded-lg border border-line bg-bg">
          <Screen>
            <ScreenTop>
              <IconButton icon={BackIcon} label="Back" />
              <ScreenTopSpacer />
              <IconButton icon={LeaderboardIcon} label="Leaderboard" notification />
              <IconButton icon={SettingsIcon} label="Settings" />
            </ScreenTop>
            <ScreenTitle>Enter the room code</ScreenTitle>
            <ScreenLead>Ask whoever made the room. It&rsquo;s 4 characters.</ScreenLead>
            <CodeBoxes label="Room code example" value="KH" onValueChange={() => {}} />
            <ScreenFooter>
              <Button variant="primary" disabled>
                Join room
              </Button>
            </ScreenFooter>
          </Screen>
        </div>
      </Section>

      <Sheet
        open={plainSheet}
        onOpenChange={setPlainSheet}
        title="Lock in Nischal?"
        description="You won't be able to change it later, even by leaving and rejoining."
      >
        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={() => setPlainSheet(false)}>Go back</Button>
          <Button variant="primary" onClick={() => setPlainSheet(false)}>
            Lock it
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={richSheet}
        onOpenChange={setRichSheet}
        title="Leaderboard"
        description="5 letters"
        action={
          <SegmentedControl
            label="Leaderboard range"
            options={RANGE_OPTIONS}
            value={range}
            onValueChange={setRange}
            className="w-45 flex-none"
          />
        }
      >
        <ol className="m-0 list-none p-0">
          {(
            [
              ['Priya', 184, 3.4],
              ['You', 171, 3.6],
              ['Arjun', 166, 3.7],
            ] as const
          ).map(([name, score, average], index) => (
            <li
              key={String(name)}
              className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-line border-t py-3 text-[15px] first:border-t-0"
            >
              <span className="tabular text-[13px] text-muted">{index + 1}</span>
              <span className={cn('font-medium', name === 'You' && 'text-accent')}>{name}</span>
              <span className="tabular text-right font-semibold">
                {score}
                <span className="block text-[12px] font-normal text-muted">{average} avg</span>
              </span>
            </li>
          ))}
        </ol>
        <Help className="mt-3.5">
          Points: 6 for a first-guess solve, down to 1 for a sixth. Time only breaks ties. Resets
          Monday.
        </Help>
      </Sheet>
    </div>
  )
}
