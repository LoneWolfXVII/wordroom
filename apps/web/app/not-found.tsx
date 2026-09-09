import Link from 'next/link'
import { Button, Icon, Screen, ScreenFooter, TileArt } from '@/components/ui'
import { HomeIcon } from '@/components/ui/icons'

/**
 * 404.
 *
 * There was no `not-found.tsx` at all, so an address that led nowhere fell
 * through to Next's own page — a black-and-white stack trace frame in
 * development and a bare "404 | This page could not be found" in production.
 * Neither belongs to this product, and the likeliest way to reach one is a
 * mistyped or truncated room link, which is a player trying to join a game.
 *
 * So it says the one useful thing about a bad room link — the code is four
 * letters — and offers the way in rather than only the way out.
 */
export default function NotFound() {
  return (
    <Screen>
      <div className="m-auto max-w-[32ch] text-center">
        <TileArt variant="broken" />
        <h1 className="text-[19px] leading-tight font-semibold text-ink">
          That page does not exist.
        </h1>
        <p className="mt-2 text-[14px] leading-[1.45] text-ink-2">
          If you were opening a room link, it may have been cut short. A room code is four letters.
        </p>
      </div>

      <ScreenFooter>
        <Button asChild variant="primary">
          <Link href="/">
            <Icon icon={HomeIcon} size={18} />
            Back to start
          </Link>
        </Button>
      </ScreenFooter>
    </Screen>
  )
}
