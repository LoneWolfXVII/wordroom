import type { MarkRow } from '@wordroom/shared'
import { describe, expect, it } from 'vitest'
import {
  decodeMarksCompact,
  encodeMarksCompact,
  type SharePayload,
  signShareToken,
  verifyShareToken,
} from './token'

const SECRET = 'test-secret'
const OTHER_SECRET = 'a-different-secret'

const rows: MarkRow[] = [
  ['absent', 'absent', 'absent', 'present', 'absent'],
  ['correct', 'present', 'absent', 'absent', 'absent'],
  ['correct', 'correct', 'correct', 'correct', 'correct'],
]

function payload(overrides: Partial<SharePayload> = {}): SharePayload {
  return {
    v: 1,
    a: '11111111-2222-3333-4444-555555555555',
    n: 12,
    c: 'KHXZ',
    s: true,
    h: false,
    t: null,
    m: encodeMarksCompact(rows),
    x: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  }
}

describe('mark codec', () => {
  it('round-trips a grid', () => {
    expect(decodeMarksCompact(encodeMarksCompact(rows))).toEqual(rows)
  })

  it('compresses each row to one character per tile', () => {
    expect(encodeMarksCompact(rows)).toEqual(['aaapa', 'cpaaa', 'ccccc'])
  })

  it('refuses a row it did not write', () => {
    expect(() => decodeMarksCompact(['ccxcc'])).toThrow()
  })
})

describe('share token', () => {
  it('round-trips a payload', async () => {
    const original = payload()
    const result = await verifyShareToken(await signShareToken(original, SECRET), SECRET)
    expect(result).toEqual({ ok: true, payload: original })
  })

  it('carries the words on a with-letters token', async () => {
    const original = payload({ w: ['crane', 'sound', 'swing'] })
    const result = await verifyShareToken(await signShareToken(original, SECRET), SECRET)
    expect(result.ok && result.payload.w).toEqual(['crane', 'sound', 'swing'])
  })

  it('has no word field at all on a spoiler-free token', async () => {
    // The point of the default variant: the letters are not redacted in the
    // signed bytes, they were never put there.
    const token = await signShareToken(payload(), SECRET)
    const body = token.slice(0, token.indexOf('.'))
    const json = atob(body.replaceAll('-', '+').replaceAll('_', '/'))
    expect(json).not.toContain('"w"')

    const result = await verifyShareToken(token, SECRET)
    expect(result.ok && 'w' in result.payload).toBe(false)
  })

  it('rejects a token signed with another secret', async () => {
    const token = await signShareToken(payload(), OTHER_SECRET)
    expect(await verifyShareToken(token, SECRET)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('rejects an edited payload', async () => {
    // Swapping in a different attempt id is the attack this signature exists to
    // stop: the renderer would otherwise draw whatever the URL claimed.
    const token = await signShareToken(payload(), SECRET)
    const [, signature] = token.split('.')
    const forged = payload({ a: '99999999-9999-9999-9999-999999999999' })
    const body = btoa(JSON.stringify(forged))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
    expect(await verifyShareToken(`${body}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: 'bad_signature',
    })
  })

  it('rejects an expired token', async () => {
    const expired = payload({ x: Math.floor(Date.now() / 1000) - 1 })
    const token = await signShareToken(expired, SECRET)
    expect(await verifyShareToken(token, SECRET)).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts a token right up to its expiry and not past it', async () => {
    const at = 1_800_000_000_000
    const token = await signShareToken(payload({ x: at / 1000 }), SECRET)
    expect((await verifyShareToken(token, SECRET, at - 1)).ok).toBe(true)
    expect((await verifyShareToken(token, SECRET, at)).ok).toBe(false)
  })

  it('rejects a token from an unknown format version', async () => {
    const token = await signShareToken({ ...payload(), v: 2 } as unknown as SharePayload, SECRET)
    expect(await verifyShareToken(token, SECRET)).toEqual({
      ok: false,
      reason: 'unsupported_version',
    })
  })

  it.each(['', '.', 'nodot', 'a.', '.b', 'a.!!!'])('rejects %o as malformed', async (token) => {
    const result = await verifyShareToken(token, SECRET)
    expect(result.ok).toBe(false)
  })
})
