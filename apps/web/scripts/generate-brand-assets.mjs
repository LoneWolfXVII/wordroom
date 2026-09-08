/**
 * Generates every raster brand asset the app ships: the PWA icons, the Apple
 * touch icon, and the Open Graph card.
 *
 * Run it from `apps/web` when the wordmark or the tokens change:
 *
 *     node scripts/generate-brand-assets.mjs
 *
 * The outputs are committed, because an install prompt and a link unfurl both
 * want a plain static file — not a function invocation on a cold start. This
 * script is the provenance for those bytes, so they are never "placeholders
 * someone drew once".
 *
 * It draws with satori + resvg through `next/og`, the same renderer the share
 * card uses at runtime, so an icon and a share image cannot drift apart. The
 * only extra dependency is Geist, which is already in the tree for `next/font`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// `next/og.js`, not `next/og`: outside a bundler, Node resolves the export map
// literally and the extensionless specifier has no file behind it.
import { ImageResponse } from 'next/og.js'
import { createElement as h } from 'react'
import {
  brand,
  HERO_TILES,
  MARK_LETTER,
  TAGLINE,
  TILE_RADIUS_RATIO,
} from '../app/api/share/brand.ts'

const here = dirname(fileURLToPath(import.meta.url))
const web = join(here, '..')
const fontDir = join(web, 'node_modules/geist/dist/fonts/geist-sans')

const [semibold, regular] = await Promise.all([
  readFile(join(fontDir, 'Geist-SemiBold.ttf')),
  readFile(join(fontDir, 'Geist-Regular.ttf')),
])

const fonts = [
  { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
  { name: 'Geist', data: regular, weight: 400, style: 'normal' },
]

/**
 * One board tile, at any size. `--r-s` is 6px on a 56px tile, so the radius
 * scales with the side rather than being picked again per asset.
 */
function tile(letter, background, side, extra = {}) {
  return h(
    'div',
    {
      style: {
        width: side,
        height: side,
        borderRadius: Math.round(side * TILE_RADIUS_RATIO),
        background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: brand.onTile,
        fontFamily: 'Geist',
        fontSize: Math.round(side * 0.58),
        fontWeight: 600,
        lineHeight: 1,
        ...extra,
      },
    },
    letter,
  )
}

/**
 * The app icon: the wordmark's first tile, alone, on the page background.
 *
 * `scale` is the tile's side as a fraction of the canvas. A maskable icon is
 * cropped to a circle of 80% of the canvas by the launcher, and the largest
 * square inside that circle has a side of 0.566 — so 0.52 keeps the letter
 * clear of every mask Android applies.
 */
function icon(size, scale) {
  const side = Math.round(size * scale)
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: brand.bg,
      },
    },
    tile(MARK_LETTER, brand.correct, side, { paddingBottom: Math.round(side * 0.04) }),
  )
}

/**
 * The link card. It says what the product is and nothing about any puzzle —
 * a room link unfurls in the chat the room is being invited from, and half the
 * people reading it have not played the current number yet.
 */
function ogCard() {
  return h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
        background: brand.bg,
        fontFamily: 'Geist',
      },
    },
    h(
      'div',
      {
        style: {
          fontSize: 78,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: brand.ink,
          lineHeight: 1,
        },
      },
      'Wordroom',
    ),
    h(
      'div',
      { style: { display: 'flex', gap: 8 } },
      ...HERO_TILES.map(([letter, colour]) => tile(letter, colour, 88)),
    ),
    h(
      'div',
      {
        style: {
          fontSize: 30,
          fontWeight: 400,
          color: brand.ink2,
          lineHeight: 1.4,
          maxWidth: 660,
          textAlign: 'center',
        },
      },
      TAGLINE,
    ),
  )
}

async function render(element, width, height, out) {
  const png = Buffer.from(await new ImageResponse(element, { width, height, fonts }).arrayBuffer())
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, png)
  console.warn(
    `${out.slice(web.length + 1)}  ${width}x${height}  ${(png.length / 1024).toFixed(1)} kB`,
  )
}

const jobs = [
  // The favicon is cropped tighter than the rest: at 16px in a tab strip the
  // page background around the tile is indistinguishable from the tab itself,
  // so the tile may as well be the whole icon.
  [icon(96, 0.86), 96, 96, join(web, 'app/icon.png')],
  [icon(180, 0.62), 180, 180, join(web, 'app/apple-icon.png')],
  [icon(192, 0.66), 192, 192, join(web, 'public/icons/icon-192.png')],
  [icon(512, 0.66), 512, 512, join(web, 'public/icons/icon-512.png')],
  [icon(192, 0.52), 192, 192, join(web, 'public/icons/maskable-192.png')],
  [icon(512, 0.52), 512, 512, join(web, 'public/icons/maskable-512.png')],
  [ogCard(), 1200, 630, join(web, 'public/og.png')],
]

for (const [element, width, height, out] of jobs) {
  await render(element, width, height, out)
}
