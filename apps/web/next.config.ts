import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
