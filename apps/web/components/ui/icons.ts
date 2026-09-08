/**
 * The product's icon vocabulary.
 *
 * `@hugeicons/core-free-icons` ships ~6,700 glyphs; naming the handful we use
 * here keeps the set consistent across workstreams and gives every icon a
 * product name instead of a catalogue number. Add to it rather than reaching
 * into the package directly.
 *
 * The free set is Stroke Rounded, which is the set the design brief asks for.
 */
import type { IconSvgElement } from '@hugeicons/react'

export {
  Alert02Icon as AlertIcon,
  ArrowDown01Icon as RankDownIcon,
  ArrowLeft01Icon as BackIcon,
  ArrowRight01Icon as ForwardIcon,
  ArrowTurnBackwardIcon as EnterKeyIcon,
  ArrowUp01Icon as RankUpIcon,
  Cancel01Icon as CloseIcon,
  ChampionIcon as LeaderboardIcon,
  CheckmarkCircle02Icon as SuccessIcon,
  Copy01Icon as CopyIcon,
  GoogleIcon,
  HelpCircleIcon as RulesIcon,
  Link01Icon as LinkIcon,
  Loading03Icon as SpinnerIcon,
  LockIcon,
  Logout01Icon as LeaveIcon,
  MinusSignIcon as MinusIcon,
  PlusSignIcon as PlusIcon,
  Share08Icon as ShareIcon,
  SlidersHorizontalIcon as SettingsIcon,
  TextFontIcon as LettersIcon,
  Tick02Icon as TickIcon,
  Timer02Icon as TimerIcon,
  UserGroupIcon as PlayersIcon,
} from '@hugeicons/core-free-icons'

/**
 * Backspace.
 *
 * Hugeicons' free set has no backspace glyph — only `Delete*` waste baskets,
 * which on a keyboard read as "clear everything" rather than "remove the last
 * letter". This is the classic pentagon-with-X, drawn to the same 24 box and
 * stroke as the rest of the vocabulary so `<Icon>` styles it identically.
 */
export const BackspaceKeyIcon: IconSvgElement = [
  [
    'path',
    {
      d: 'M21 5.5v13a1 1 0 0 1-1 1H9.6a1 1 0 0 1-.75-.34l-5.3-6a1 1 0 0 1 0-1.32l5.3-6A1 1 0 0 1 9.6 4.5H20a1 1 0 0 1 1 1Z',
      key: 'backspace-body',
    },
  ],
  ['path', { d: 'm12.6 9.6 4.8 4.8', key: 'backspace-x1' }],
  ['path', { d: 'm17.4 9.6-4.8 4.8', key: 'backspace-x2' }],
]
