'use client'

import { useEffect } from 'react'
import { Button, Icon, Screen, ScreenFooter, TileArt } from '@/components/ui'
import { ForwardIcon, HomeIcon } from '@/components/ui/icons'

/**
 * The error boundary for every route below it.
 *
 * There was none, so a thrown render reached Next's default overlay: a stack
 * trace on a white page, naming files and component names. That is a developer's
 * screen shown to a player, and on a phone it is the worst-looking thing in the
 * product.
 *
 * `reset()` re-renders the segment without a full reload, which is the right
 * first thing to offer: most of what throws here is a transient fetch or a
 * render that raced a state change, and it costs nothing to try again. The way
 * home is underneath for when it does not.
 *
 * The message is deliberately plain. `error.message` is not shown — in
 * production Next replaces it with a digest anyway, and where it survives it
 * names internals a player cannot act on.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // No error service is wired up yet, and the repo bans `console`, so there
    // is nowhere to send this. The digest is what a report would carry, and it
    // is already in Next's own server log for the same request.
    void error.digest
  }, [error])

  return (
    <Screen>
      <div className="m-auto max-w-[32ch] text-center">
        <TileArt variant="lost" />
        <h1 className="text-[19px] leading-tight font-semibold text-ink">Something went wrong.</h1>
        <p className="mt-2 text-[14px] leading-[1.45] text-ink-2">
          Your room, your name and every puzzle you have played are safe. This screen is the only
          thing that broke.
        </p>
      </div>

      <ScreenFooter>
        <Button variant="primary" onClick={reset}>
          <Icon icon={ForwardIcon} size={18} />
          Try again
        </Button>
        <Button asChild>
          <a href="/">
            <Icon icon={HomeIcon} size={18} />
            Back to start
          </a>
        </Button>
      </ScreenFooter>
    </Screen>
  )
}
