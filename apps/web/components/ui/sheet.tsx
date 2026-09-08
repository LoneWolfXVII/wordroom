'use client'

import type { ReactNode } from 'react'
import { Drawer } from 'vaul'
import { cn } from '@/lib/cn'
import { usePanelLayout } from '@/lib/use-media-query'
import { IconButton } from './icon-button'
import { CloseIcon } from './icons'

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The dialog's accessible name, and the `.sheet h2` heading. Always required. */
  title: ReactNode
  /** `.sheet .sub` — the muted line under the title. */
  description?: ReactNode
  /** Right-hand side of `.hrow`: a range toggle, a code chip, whatever the sheet needs. */
  action?: ReactNode
  /** Keep the heading for screen readers but take it out of the layout. */
  hideHeader?: boolean
  children: ReactNode
  className?: string
}

/**
 * `.sheet`.
 *
 * A bottom sheet on a phone and a fixed right panel from 820px up, which is what
 * spec v1 asks for. Vaul sits on Radix Dialog, so focus is trapped, Escape
 * closes, and the page behind is inert — the prototype's plain div had none of
 * that.
 *
 * Vaul's own 500ms transition is pulled back to --d-struct in globals.css; it
 * has to happen there because Vaul's injected styles are unlayered.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  action,
  hideHeader = false,
  children,
  className,
}: SheetProps) {
  const asPanel = usePanelLayout()

  return (
    // Vaul reads `direction` once per mount, so the key swaps the whole drawer
    // when the layout crosses 820px.
    <Drawer.Root
      key={asPanel ? 'right' : 'bottom'}
      direction={asPanel ? 'right' : 'bottom'}
      open={open}
      onOpenChange={onOpenChange}
      // Vaul leaves focus on the trigger by default, which makes the focus trap
      // useless until the user tabs in. Move it into the sheet on open.
      autoFocus
    >
      <Drawer.Portal>
        <Drawer.Overlay className="wr-scrim fixed inset-0 z-40 bg-ink/32 backdrop-blur-[8px]" />
        <Drawer.Content
          className={cn(
            'wr-sheet fixed z-50 flex flex-col bg-surface shadow-lg outline-none',
            'inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-[520px] rounded-t-lg',
            'pb-[env(safe-area-inset-bottom)]',
            'panel:inset-x-auto panel:right-6 panel:top-6 panel:bottom-6',
            'panel:mx-0 panel:w-100 panel:max-w-none panel:max-h-none panel:rounded-lg panel:pb-0',
            className,
          )}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <Drawer.Handle className="wr-handle mt-[10px] mb-1 flex-none panel:hidden" />
          <div className="overflow-auto px-5 pt-2 pb-[22px] panel:pt-5">
            <div className={cn('flex items-start justify-between gap-3', hideHeader && 'sr-only')}>
              <div className="min-w-0">
                <Drawer.Title className="mt-1.5 mb-0.5 text-[18px] font-semibold">
                  {title}
                </Drawer.Title>
                {description === undefined ? null : (
                  <Drawer.Description className="text-[13px] text-muted">
                    {description}
                  </Drawer.Description>
                )}
              </div>
              {action}
              <Drawer.Close asChild>
                <IconButton
                  icon={CloseIcon}
                  label="Close"
                  className="-mr-2 hidden flex-none panel:grid"
                />
              </Drawer.Close>
            </div>
            <div className={cn(!hideHeader && 'mt-3.5')}>{children}</div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
