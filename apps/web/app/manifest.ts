import type { MetadataRoute } from 'next'
import { brand } from './api/share/brand'

/**
 * The install manifest. Next serves this at `/manifest.webmanifest` and adds
 * the `<link rel="manifest">` to every page for us.
 *
 * `theme_color` and `background_color` are both the page background, so the
 * status bar, the splash screen and the app itself are one continuous surface —
 * a standalone Wordroom should look like a warm sheet of paper from the moment
 * the launcher opens it, with no white flash in between.
 *
 * `orientation: portrait` because the board is designed to fit 375x667 with no
 * scroll and there is nothing a landscape phone would do with the extra width.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id, so a future change of `start_url` does not read to the
    // browser as a different app and orphan everyone's installed copy.
    id: '/',
    name: 'Wordroom',
    short_name: 'Wordroom',
    description:
      'Play word puzzles with your friends. Unlimited puzzles, one room, one leaderboard.',
    lang: 'en',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: brand.bg,
    background_color: brand.bg,
    categories: ['games', 'word', 'puzzle'],
    icons: [
      // `any` is drawn as given — the tile sits on the page background with its
      // own margin. `maskable` is drawn inside whatever shape the launcher
      // wants, so it is the same tile at a smaller scale on a full-bleed field.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
