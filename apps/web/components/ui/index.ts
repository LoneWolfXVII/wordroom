/**
 * The Wordroom design system.
 *
 * Every visual primitive the product uses lives here, styled from
 * docs/wordroom-screens.html. Feature workstreams should import from
 * `@/components/ui` rather than reaching for a stock shadcn component or
 * restyling one of these in place. See /dev/ds for every state.
 */
export {
  AppShell,
  Screen,
  ScreenFooter,
  ScreenLead,
  ScreenTitle,
  ScreenTop,
  ScreenTopSpacer,
} from './app-shell'
export { Avatar, type AvatarProps } from './avatar'
export { Badge, type BadgeProps } from './badge'
export { Button, type ButtonProps, buttonVariants } from './button'
export { Card, CardLabel } from './card'
export { Chip, type ChipProps, ChipRow } from './chip'
export { CodeBoxes, type CodeBoxesProps, CodeDisplay, type CodeDisplayProps } from './code-boxes'
export { Expand, type ExpandProps } from './expand'
export { ICON_SIZE, ICON_STROKE, Icon, type IconProps } from './icon'
export { IconButton, type IconButtonProps } from './icon-button'
export { Field, Help, type HelpProps, Input, Label } from './input'
export { MiniGrid, type MiniGridProps, type MiniGridSize } from './mini-grid'
export { RadioGroup, type RadioGroupProps, RadioOption, type RadioOptionProps } from './radio-group'
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedOption,
} from './segmented-control'
export { SettingNote, SettingRow, type SettingRowProps } from './setting-row'
export { Sheet, type SheetProps } from './sheet'
export { StatGrid, type StatGridProps, StatTile, type StatTileProps } from './stat-tile'
export { Stepper, type StepperProps } from './stepper'
export { Switch, type SwitchProps } from './switch'
export { Toaster, toast } from './toast'
