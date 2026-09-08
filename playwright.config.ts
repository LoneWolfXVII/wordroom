import { defineConfig, devices } from '@playwright/test'

// The app's dev script is pinned to 3900 (see CLAUDE.md), so the e2e suite is
// too. `E2E_PORT` is the escape hatch for a machine that already has something
// on it — a stale dev server serves 404s for its chunks, the page never
// hydrates, and every test fails for a reason that is not the app's.
const PORT = Number(process.env.E2E_PORT ?? 3900)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`

// Every run talks to the real Supabase project — anonymous sign-ins, edge
// functions and realtime all have per-user and per-IP budgets. Running the
// specs in parallel burns through them and turns a green suite red for reasons
// that have nothing to do with the app, so workers are capped rather than
// scaled to the machine.
const WORKERS = process.env.CI ? 1 : 2

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts',
  // A full flow is three browser contexts talking to a live backend.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: WORKERS,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'e2e/.report' }], ['list']]
    : [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Deterministic clock-free waiting: web-first assertions everywhere, so a
    // slow live backend shows up as a timeout on the assertion that matters.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 }, isMobile: false },
      testIgnore: ['**/layout-small.spec.ts', '**/reduced-motion.spec.ts'],
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      testIgnore: ['**/layout-small.spec.ts', '**/reduced-motion.spec.ts'],
    },
    {
      // The spec names 360×640 as the second floor for "no vertical scroll".
      name: 'small',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 } },
      testMatch: ['**/layout-small.spec.ts'],
    },
    {
      // One pass with animations disabled, to prove nothing waits on a
      // transition that never fires.
      name: 'reduced-motion',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        reducedMotion: 'reduce',
      },
      testMatch: ['**/reduced-motion.spec.ts'],
    },
  ],
  webServer: {
    command: `pnpm --filter @wordroom/web exec next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
