import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * `.app` — the frame every screen lives in.
 *
 * 100dvh so a mobile browser's collapsing toolbar cannot push the keyboard off
 * screen, capped at 520px and centred. `overflow-hidden` is what keeps the game
 * screen from scrolling at 375x667.
 *
 * From 820px it becomes an inset card with a hairline, as in the prototype.
 */
export function AppShell({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'relative mx-auto h-dvh max-w-[520px] overflow-hidden',
        'panel:mt-6 panel:h-[calc(100dvh-48px)] panel:rounded-[24px] panel:shadow-[0_0_0_1px_var(--color-line)]',
        className,
      )}
      {...rest}
    />
  )
}

/**
 * `.screen` — one route's worth of content: a column with the gutter and the
 * bottom safe-area inset already applied.
 */
export function Screen({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn('flex h-full flex-col px-5 pb-[env(safe-area-inset-bottom)]', className)}
      {...rest}
    />
  )
}

/** `.top` — the back/close row above a screen's heading. */
export function ScreenTop({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('flex min-h-14 flex-none items-center gap-2 pt-2', className)} {...rest} />
  )
}

/** `.top .sp` — pushes what follows to the right of the top row. */
export function ScreenTopSpacer() {
  return <div className="flex-1" />
}

/** `h1` — a screen's heading. */
export function ScreenTitle({ className, ...rest }: ComponentPropsWithoutRef<'h1'>) {
  return (
    <h1
      className={cn(
        'mt-[18px] mb-1.5 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em]',
        className,
      )}
      {...rest}
    />
  )
}

/** `.lead` — the sentence under a screen heading. */
export function ScreenLead({ className, ...rest }: ComponentPropsWithoutRef<'p'>) {
  return <p className={cn('mb-6 text-[15px] leading-[1.45] text-ink-2', className)} {...rest} />
}

/**
 * `.foot` — the actions pinned to the bottom of a screen. `mt-auto` is what
 * pushes them down, so put it last inside a `Screen`.
 */
export function ScreenFooter({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('mt-auto grid gap-2.5 pt-4 pb-5', className)} {...rest} />
}
