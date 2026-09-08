/**
 * Tests for the game engine.
 *
 * `apps/web` has no `vitest` dependency and its `test` script is a stub, and
 * this workstream may not edit a package.json that three other agents share.
 * So these run with an explicit config, using the binary the shared package
 * already installs:
 *
 *   packages/shared/node_modules/.bin/vitest run \
 *     --config apps/web/features/game/vitest.config.mts
 *
 * The files are `.mts` because `apps/web/tsconfig.json` includes `**\/*.ts`,
 * which would typecheck an `import ... from 'vitest'` that cannot resolve from
 * here. `.mts` is outside that glob, so `pnpm typecheck` stays green while
 * Vitest — which aliases its own package for the files it runs — still runs
 * them.
 *
 * This exports a plain object rather than calling `defineConfig`, because the
 * config is loaded by Node before that aliasing exists and `vitest/config`
 * would not resolve either.
 *
 * To wire these into CI, add `"vitest": "4.1.11"` to `apps/web`
 * devDependencies and change its `test` script to
 * `vitest run --config features/game/vitest.config.mts`.
 */
export default {
  test: {
    include: ['**/*.test.mts'],
    environment: 'node',
  },
}
