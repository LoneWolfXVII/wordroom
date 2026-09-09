import { describe, expect, it } from 'vitest'
import { projectRef, sessionMatchesProject } from './stale-session'

const TOKYO = 'https://cdrmvqvgwwuqxslygilq.supabase.co'
const MUMBAI = 'https://bwbomwockoyizvzuuuhf.supabase.co'

/** A JWT with the given issuer. Only the payload is read, so the rest is filler. */
function token(iss: string): string {
  const payload = Buffer.from(JSON.stringify({ iss, sub: 'u', is_anonymous: true }))
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

const stored = (iss: string) => JSON.stringify({ access_token: token(iss), refresh_token: 'r' })

describe('projectRef', () => {
  it('reads the ref out of a project URL', () => {
    expect(projectRef(MUMBAI)).toBe('bwbomwockoyizvzuuuhf')
    expect(projectRef('https://abc.supabase.co/')).toBe('abc')
  })

  it('returns null for anything that is not a project URL', () => {
    // A self-hosted or proxied deployment has no ref to compare, and guessing
    // one would throw away good sessions.
    expect(projectRef('http://127.0.0.1:54321')).toBeNull()
    expect(projectRef('https://auth.example.com')).toBeNull()
    expect(projectRef('not a url')).toBeNull()
  })
})

describe('sessionMatchesProject', () => {
  it('keeps a session issued by the project it is being used with', () => {
    expect(sessionMatchesProject(stored(`${MUMBAI}/auth/v1`), MUMBAI)).toBe(true)
  })

  it('rejects the session that broke production', () => {
    // The real shape: a Tokyo token replayed at Mumbai after the region move.
    // PostgREST answered 401 to every request and never recovered, because the
    // refresh token was Tokyo's too.
    expect(sessionMatchesProject(stored(`${TOKYO}/auth/v1`), MUMBAI)).toBe(false)
    expect(sessionMatchesProject(stored(`${MUMBAI}/auth/v1`), TOKYO)).toBe(false)
  })

  it('does not match on a ref that merely appears somewhere in the issuer', () => {
    // `includes(ref)` alone would keep a token from `https://evil.com/?x=<ref>`.
    const sneaky = stored(`https://elsewhere.example.com/auth/v1?ref=bwbomwockoyizvzuuuhf`)
    expect(sessionMatchesProject(sneaky, MUMBAI)).toBe(false)
  })

  it('keeps anything it cannot prove is foreign', () => {
    // The failure this guards against is a permanent 401. Throwing away a
    // session it merely failed to parse would be the worse outcome, so every
    // unrecognised shape is left alone for GoTrue to deal with.
    for (const raw of [
      'not json',
      '{}',
      'null',
      '[]',
      JSON.stringify({ access_token: 'not.a.jwt' }),
      JSON.stringify({ access_token: 42 }),
      JSON.stringify({ refresh_token: 'r' }),
    ]) {
      expect(sessionMatchesProject(raw, MUMBAI), raw).toBe(true)
    }
  })

  it('keeps every session when the URL has no ref to compare', () => {
    expect(sessionMatchesProject(stored(`${TOKYO}/auth/v1`), 'http://127.0.0.1:54321')).toBe(true)
  })

  it('reads the session whether it is bare or wrapped', () => {
    // supabase-js has stored both shapes across versions.
    const wrapped = JSON.stringify({ currentSession: { access_token: token(`${TOKYO}/auth/v1`) } })
    expect(sessionMatchesProject(wrapped, MUMBAI)).toBe(false)
  })
})
