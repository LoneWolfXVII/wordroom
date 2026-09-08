#!/usr/bin/env node
/**
 * Fill e2e/.cache/sessions.json with the four anonymous accounts the suite uses.
 *
 * The project allows 30 anonymous sign-ins per hour per IP; the 31st returns
 * `429 over_request_rate_limit`. Once that budget is spent, every spec fails on
 * its first fixture, and the failure looks nothing like the thing it is. This
 * script mints only what is missing, one account at a time, and waits out a 429
 * rather than giving up — so the cache can be filled while the budget trickles
 * back, and the suite itself then costs no sign-ins at all.
 *
 *   node e2e/scripts/warm-sessions.mjs
 *   node e2e/scripts/warm-sessions.mjs --timeout-minutes=90
 *
 * Sessions are anonymous throwaway accounts for a test project. They are cached
 * outside git, and the file is disposable — delete it to start over.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROLES = ['player', 'friend', 'host', 'rival']
const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const CACHE_DIR = path.join(REPO_ROOT, 'e2e/.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'sessions.json')

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
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!url || !anonKey) {
  console.error('No Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY.')
  process.exit(1)
}

const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout-minutes='))
const deadline = Date.now() + Number(timeoutArg?.split('=')[1] ?? 75) * 60_000

function readCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeCache(cache) {
  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function signUp() {
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: '{}',
  })
  const body = await res.json()
  return { status: res.status, body }
}

let minted = 0

for (const role of ROLES) {
  if (readCache()[role] !== undefined) {
    console.error(`${role}: cached`)
    continue
  }

  let waited = 0
  for (;;) {
    const { status, body } = await signUp()

    if (body.access_token) {
      writeCache({ ...readCache(), [role]: JSON.stringify(body) })
      minted += 1
      console.error(`${role}: minted`)
      break
    }

    if (status !== 429) {
      console.error(`${role}: sign-up failed (${status}) ${JSON.stringify(body).slice(0, 200)}`)
      process.exit(1)
    }

    if (Date.now() > deadline) {
      console.error(`${role}: still rate limited after ${Math.round(waited / 60_000)} minutes.`)
      console.error('The budget is 30 anonymous sign-ins per hour per IP. Try again later.')
      process.exit(1)
    }

    // Long waits, few requests: every attempt while the bucket is empty is one
    // more request against whatever refilled it.
    await sleep(120_000)
    waited += 120_000
    console.error(`${role}: rate limited, waited ${Math.round(waited / 60_000)}m`)
  }
}

console.error(`\n${minted} account(s) minted, ${ROLES.length} cached. The suite needs no more.`)
