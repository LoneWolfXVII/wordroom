import localFont from 'next/font/local'

/**
 * Geist, the product's only family.
 *
 * Self-hosted from the `geist` package through `next/font/local`, which
 * fingerprints and preloads the file and emits an @font-face with a
 * metric-matched fallback — so there is no flash of unstyled or invisible text
 * and no request to a third party.
 *
 * The variable name is `--font-geist` because that is what `--font-sans` in
 * globals.css reads.
 */
export const geist = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
  preload: true,
  fallback: ['-apple-system', 'Segoe UI', 'Inter', 'sans-serif'],
})
