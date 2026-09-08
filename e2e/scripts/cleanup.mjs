#!/usr/bin/env node
/**
 * Delete the rooms the e2e suite created.
 *
 * Rooms cannot be removed by the suite itself. `supabase/migrations/…_rls.sql`
 * grants `all on public.rooms` to `service_role` and nothing but `select` to
 * `authenticated`, and there is no archive endpoint among the five Edge
 * Functions — so a test run has no way to tidy up after itself, and the runner
 * deliberately holds no service-role key.
 *
 * This script is the out-of-band tidy-up. It needs a key that bypasses RLS, so
 * it takes one from the environment and never from a file in the repo:
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node e2e/scripts/cleanup.mjs          # list
 *   SUPABASE_SERVICE_ROLE_KEY=... node e2e/scripts/cleanup.mjs --delete # remove
 *
 * Rooms younger than --older-than-hours (default 2) are left alone, so a
 * cleanup cannot delete the rooms a concurrent run is still playing in.
 *
 * `players`, `puzzles` and `attempts` all cascade from `rooms`, so removing the
 * room removes everything the run left behind.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOM_PREFIX = 'E2E'
const REPO_ROOT = path.resolve(import.meta.dirname, '../..')

function parseDotEnv(file) {
  try {
    const out = {}
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      out[trimmed.slice(0, eq).trim()] = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
    }
    return out
  } catch {
    return {}
  }
}

const fileEnv = parseDotEnv(path.join(REPO_ROOT, 'apps/web/.env.local'))
const url = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ??
  ''
).replace(/\/$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!url) {
  console.error('No NEXT_PUBLIC_SUPABASE_URL. Set it, or create apps/web/.env.local.')
  process.exit(1)
}
if (!serviceKey) {
  console.error(
    'No SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Rooms are only deletable by the service role. Pass the key in the\n' +
      'environment for this one command; never write it to a file in the repo.',
  )
  process.exit(1)
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
}

/**
 * Only rooms older than this are touched, so a cleanup running for one pull
 * request cannot delete the rooms a concurrent run is still playing in.
 */
const olderThanArg = process.argv.find((arg) => arg.startsWith('--older-than-hours='))
const olderThanHours = Number(olderThanArg?.split('=')[1] ?? 2)
if (!Number.isFinite(olderThanHours) || olderThanHours < 0) {
  console.error('--older-than-hours must be a non-negative number')
  process.exit(1)
}
const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString()

const filter =
  `name=like.${encodeURIComponent(`${ROOM_PREFIX} %`)}` +
  `&created_at=lt.${encodeURIComponent(cutoff)}`

const listed = await fetch(`${url}/rest/v1/rooms?${filter}&select=id,code,name,created_at`, {
  headers,
})
if (!listed.ok) {
  console.error(`Could not list rooms (${listed.status}): ${await listed.text()}`)
  process.exit(1)
}

const rooms = await listed.json()
if (rooms.length === 0) {
  console.error(`No rooms named "${ROOM_PREFIX} …" older than ${olderThanHours}h to clean up.`)
  process.exit(0)
}

for (const room of rooms) {
  console.error(`${room.code}\t${room.created_at}\t${room.name}`)
}
console.error(`\n${rooms.length} test room(s).`)

if (!process.argv.includes('--delete')) {
  console.error('Nothing deleted. Re-run with --delete to remove them.')
  process.exit(0)
}

const removed = await fetch(`${url}/rest/v1/rooms?${filter}`, { method: 'DELETE', headers })
if (!removed.ok) {
  console.error(`Delete failed (${removed.status}): ${await removed.text()}`)
  process.exit(1)
}
console.error(`Deleted ${rooms.length} room(s); players, puzzles and attempts cascaded.`)
