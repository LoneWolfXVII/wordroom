'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * The width at which the app gets a framed card and sheets become a fixed right
 * panel. Kept in sync with `--breakpoint-panel` in globals.css.
 */
export const PANEL_QUERY = '(min-width: 820px)'

/**
 * Subscribe to a media query.
 *
 * The server snapshot is always `false`, which keeps the first paint mobile-first
 * and avoids a hydration mismatch. Anything that reads this must therefore look
 * correct in its narrow form before hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** True once the viewport is wide enough for the side-panel layout. */
export function usePanelLayout(): boolean {
  return useMediaQuery(PANEL_QUERY)
}
