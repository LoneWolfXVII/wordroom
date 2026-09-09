#!/usr/bin/env node
/**
 * Every RPC the browser calls must have a migration that creates it.
 *
 * This exists because of a gap that only got teeth recently. A function and its
 * migration used to be loosely coupled — a stale schema meant an Edge Function
 * returning 500 on one path. Now the client calls PostgREST directly, so a
 * missing function is `404 PGRST202` on *every guess*, and the game is
 * unplayable until someone notices.
 *
 * Two modes, because there are two ways to get this wrong:
 *
 *   (no arguments)   the migration exists in the repo. Free, no credentials,
 *                    runs in CI, catches it at review time.
 *   --probe URL KEY  the function exists in that database. Run by
 *                    `deploy-functions.sh` before it deploys anything.
 *
 * The probe needs no privileges and creates nothing. PostgREST resolves an RPC
 * by name *and* parameter list, so posting the real parameter names with null
 * values separates the two cases: a function that exists answers `42501
 * permission denied` (the publishable key may not execute it), and one that
 * does not answers `PGRST202`. Posting `{}` cannot tell them apart — every
 * function with required arguments looks missing — which is worth knowing
 * because that was the first version of this check and it was wrong.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')

/** Walk a directory for source files, skipping build output. */
function sources(dir, extensions, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sources(full, extensions, found)
    else if (extensions.some((e) => entry.name.endsWith(e))) found.push(full)
  }
  return found
}

// `/rpc/<name>` in a fetch URL, and supabase-js's `.rpc('<name>')`.
const CALL = /(?:\/rpc\/([a-z0-9_]+)|\.rpc\(\s*['"]([a-z0-9_]+)['"])/g

const called = new Map()
for (const file of sources(path.join(root, 'apps/web'), ['.ts', '.tsx'])) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(CALL)) {
    const name = match[1] ?? match[2]
    if (!called.has(name)) called.set(name, path.relative(root, file))
  }
}

const migrations = sources(path.join(root, 'supabase/migrations'), ['.sql'])
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

/** The parameter names a migration declares for one function. */
function parametersOf(name) {
  const declaration = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(([^)]*)\\)`,
    'i',
  )
  const body = declaration.exec(migrations)?.[1] ?? ''
  return [...body.matchAll(/(^|,)\s*([a-z0-9_]+)\s+/gi)].map((m) => m[2])
}

const missing = []
for (const [name, file] of called) {
  const declared = new RegExp(
    `create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${name}\\s*\\(`,
    'i',
  )
  if (!declared.test(migrations)) missing.push({ name, file })
}

if (missing.length > 0) {
  console.error('These RPCs are called by the app but no migration creates them:\n')
  for (const { name, file } of missing) console.error(`  ${name}()  called from ${file}`)
  console.error('\nAdd the migration, or the deployed client gets 404 PGRST202 on every call.')
  process.exit(1)
}

const names = [...called.keys()]
console.log(
  names.length === 0
    ? 'No RPCs called from the app.'
    : `${names.length} RPC(s) called from the app, all created by a migration: ${names.join(', ')}`,
)

// ---------------------------------------------------------------------------
// --probe: is it actually in that database?
// ---------------------------------------------------------------------------
const probeAt = process.argv.indexOf('--probe')
if (probeAt === -1) process.exit(0)

const [url, key] = process.argv.slice(probeAt + 1)
if (!url || !key) {
  console.error('usage: check-rpc-migrations.mjs --probe <supabase-url> <publishable-key>')
  process.exit(2)
}

const absent = []
for (const name of names) {
  const args = Object.fromEntries(parametersOf(name).map((p) => [p, null]))
  let payload
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    })
    payload = await response.json().catch(() => ({}))
  } catch (cause) {
    console.error(`could not reach ${url}: ${String(cause)}`)
    process.exit(2)
  }

  if (payload?.code === 'PGRST202') absent.push(name)
  else console.log(`    ${name}() is there`)
}

if (absent.length > 0) {
  console.error(`\nThe database at ${url} has no ${absent.map((n) => `${n}()`).join(', ')}.`)
  console.error('Apply the migrations first. The app calls these directly, so deploying over')
  console.error('a schema without them breaks every request that uses one.')
  process.exit(1)
}
