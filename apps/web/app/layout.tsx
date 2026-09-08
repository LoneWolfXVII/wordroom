import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/ui/app-shell'
import { Toaster } from '@/components/ui/toast'
import { SHARE_HOST } from '@/features/game/share'
import { RoomsProvider } from '@/features/rooms'
import { geist } from './fonts'
import './globals.css'

const DESCRIPTION =
  'Play word puzzles with your friends. Unlimited puzzles, one room, one leaderboard.'

/**
 * Metadata for every page, including the room links people actually paste.
 *
 * A `/r/<CODE>` link is shared into the group chat the room is being invited
 * from, and most of the people who see it have not played the current number
 * yet. So the unfurl is the product's front door and nothing else: a fixed
 * wordmark card, the same description as the home screen, no room name, no
 * puzzle number, no grid. `og.png` is a committed static image for the same
 * reason — there is nothing to compute, so a scraper never waits on a render.
 *
 * `manifest` and the icons are not listed here: Next emits `<link rel="...">`
 * for `app/manifest.ts`, `app/icon.png` and `app/apple-icon.png` on its own.
 */
export const metadata: Metadata = {
  metadataBase: new URL(`https://${SHARE_HOST}`),
  title: { default: 'Wordroom', template: '%s · Wordroom' },
  description: DESCRIPTION,
  applicationName: 'Wordroom',
  // Room codes are four letters and puzzle numbers are short; without this iOS
  // decides some of them are phone numbers and turns them into call links.
  formatDetection: { telephone: false },
  appleWebApp: { capable: true, title: 'Wordroom', statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName: 'Wordroom',
    title: 'Wordroom',
    description: DESCRIPTION,
    url: '/',
    locale: 'en',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Wordroom' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wordroom',
    description: DESCRIPTION,
    images: ['/og.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F5F1EA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <RoomsProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </RoomsProvider>
        {/*
         * Installability and the offline page. All of it is in
         * public/sw-register.js, which reads `data-build` to name this
         * deployment's caches — so a new build retires the old one instead of
         * stacking on it.
         */}
        <script src="/sw-register.js" data-build={process.env.NEXT_PUBLIC_BUILD ?? 'dev'} defer />
      </body>
    </html>
  )
}
