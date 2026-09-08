import { CODE_ALPHABET, CODE_LENGTH } from '@wordroom/shared'
import { describe, expect, it } from 'vitest'
import { codeFromShareInput, isCompleteCode, normaliseCode } from './code'

describe('normaliseCode', () => {
  it('uppercases, because codes are read aloud and typed either way', () => {
    expect(normaliseCode('khxb')).toBe('KHXB')
  })

  it('drops separators people add when reading a code out', () => {
    expect(normaliseCode('K H X B')).toBe('KHXB')
    expect(normaliseCode('k-h-x-b')).toBe('KHXB')
  })

  it('drops the four look-alikes the alphabet excludes', () => {
    // O/0 and I/1 are exactly the characters `CODE_ALPHABET` leaves out, so a
    // player typing the letter O into a code that has none gets nothing, rather
    // than a code that fails at the server.
    expect(normaliseCode('OIoi01')).toBe('')
  })

  it('accepts every character the shared alphabet does, and only those', () => {
    for (const character of CODE_ALPHABET) {
      expect(normaliseCode(character)).toBe(character)
    }
    expect(normaliseCode('OI01')).toBe('')
  })

  it('truncates to the code length so a long paste cannot overflow', () => {
    expect(normaliseCode('ABCDEFGH')).toHaveLength(CODE_LENGTH)
    expect(normaliseCode('ABCDEFGH')).toBe('ABCD')
  })

  it('is idempotent', () => {
    const once = normaliseCode('  k h x 7  ')
    expect(normaliseCode(once)).toBe(once)
  })

  it('handles an empty and a whitespace-only string', () => {
    expect(normaliseCode('')).toBe('')
    expect(normaliseCode('   ')).toBe('')
  })
})

describe('isCompleteCode', () => {
  it('is true only at exactly the code length', () => {
    expect(isCompleteCode('KHX')).toBe(false)
    expect(isCompleteCode('KHXB')).toBe(true)
  })

  it('judges the normalised value, not the raw one', () => {
    // Five characters typed, four usable: this is ready to send.
    expect(isCompleteCode('K H X B')).toBe(true)
    // Four characters typed, three usable: it is not.
    expect(isCompleteCode('KHXO')).toBe(false)
  })
})

describe('codeFromShareInput', () => {
  it('reads the code out of a full share URL', () => {
    expect(codeFromShareInput('https://wordroom.example.dev/r/KHXB')).toBe('KHXB')
  })

  it('reads it out of a bare path, and uppercases', () => {
    expect(codeFromShareInput('/r/khxb')).toBe('KHXB')
  })

  it('ignores a query string or fragment after the code', () => {
    expect(codeFromShareInput('https://wordroom.example.dev/r/KHXB?utm_source=chat')).toBe('KHXB')
    expect(codeFromShareInput('https://wordroom.example.dev/r/KHXB#top')).toBe('KHXB')
  })

  it('accepts a bare code', () => {
    expect(codeFromShareInput('KHXB')).toBe('KHXB')
    expect(codeFromShareInput('  khxb ')).toBe('KHXB')
  })

  it('refuses a URL with no /r/ segment rather than inventing a code', () => {
    // The regression this function exists for: filtering "https://…" through the
    // alphabet yields HTTP, which is a perfectly well-formed code for a room
    // nobody meant to join.
    expect(codeFromShareInput('https://wordroom.example.dev')).toBeNull()
    expect(codeFromShareInput('https://wordroom.example.dev/join')).toBeNull()
  })

  it('refuses anything that is not a whole code', () => {
    expect(codeFromShareInput('KHX')).toBeNull()
    expect(codeFromShareInput('/r/KHX')).toBeNull()
    expect(codeFromShareInput('/r/OIOI')).toBeNull()
    expect(codeFromShareInput('')).toBeNull()
    expect(codeFromShareInput('   ')).toBeNull()
  })

  it('takes the code from the /r/ segment even when the host looks codelike', () => {
    expect(codeFromShareInput('https://ABCD.example.dev/r/KHXB')).toBe('KHXB')
  })
})
