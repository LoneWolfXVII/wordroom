import type { NextConfig } from 'next'

/**
 * Which build this is.
 *
 * Vercel sets `VERCEL_GIT_COMMIT_SHA` for every deployment. Seven characters is
 * what `git log --oneline` shows and what a person can read back to you over a
 * message, which is the entire point of putting it on screen.
 *
 * It is `NEXT_PUBLIC_` because the browser needs it twice: once to show in
 * Settings, and once to name the service worker's caches, so a deploy retires
 * the previous build's cache instead of piling on top of it.
 */
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev'

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: BUILD },
  reactStrictMode: true,
  // The dev-tools badge renders over the keyboard's Enter key at 375x667, so a
  // phone-sized window in `next dev` cannot submit a guess by tapping. It has no
  // effect on a production build; this only makes dev match what players get.
  devIndicators: false,
  // @wordroom/shared ships TypeScript source, so Next compiles it in-place.
  transpilePackages: ['@wordroom/shared'],
  // Shared source uses explicit `.js` specifiers so the same files can be
  // imported by Deno in supabase/functions without a build step. Bundlers need
  // telling that `./score.js` may resolve to `score.ts`.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
  turbopack: {
    resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
  },
}

export default nextConfig
