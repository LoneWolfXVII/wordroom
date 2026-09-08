'use client'

import { Toaster as SonnerToaster } from 'sonner'

export { toast } from 'sonner'

/** The prototype shows one toast at a time, for 1300ms, 14px from the top. */
const TOAST_DURATION = 1300
const TOAST_OFFSET = 14

/**
 * `.toast` — a dark pill that drops in from the top edge.
 *
 * Sonner is unstyled here and rebuilt from tokens. The pill lives on the content
 * element rather than the toast row so the row can stay full width and centre
 * it, which is how the prototype's fixed, centred toast reads.
 *
 * Copy should be one short line: the pill does not wrap.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={TOAST_OFFSET}
      mobileOffset={TOAST_OFFSET}
      duration={TOAST_DURATION}
      visibleToasts={1}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'wr-toast flex w-full justify-center',
          content:
            'inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-bg shadow-md',
        },
      }}
    />
  )
}
