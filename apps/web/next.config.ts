import type { NextConfig } from 'next'

/**
 * The version players see, and the commit it was built from.
 *
 * `version` in package.json is the number that gets shown — `v1.0.0` — because
 * a sha says which build but not which is newer, and "am I on the latest?" is
 * the only question this is for. It has to be bumped by hand on release, and it
 * is a lie the moment someone forgets, which is the standing cost of semver.
 *
 * The sha rides along unshown, for the service worker's cache names: those need
 * to change on every deploy, not every release, or a patch would be served the
 * previous build's chunks.
 */
import pkg from './package.json' with { type: 'json' }

const VERSION = pkg.version
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev'

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: BUILD, NEXT_PUBLIC_VERSION: VERSION },
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
