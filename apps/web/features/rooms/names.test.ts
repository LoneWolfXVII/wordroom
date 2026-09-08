import { describe, expect, it } from 'vitest'
import {
  checkPlayerName,
  checkRoomName,
  normaliseName,
  PLAYER_NAME_MAX,
  playerNameProblemMessage,
  ROOM_NAME_MAX,
} from './names'

describe('normaliseName', () => {
  it('trims the ends', () => {
    expect(normaliseName('  Nischal  ')).toBe('Nischal')
  })

  it('collapses internal runs of whitespace', () => {
    // Otherwise "Friday  crew" and "Friday crew" are two different names that
    // look identical on a leaderboard row.
    expect(normaliseName('Friday   crew')).toBe('Friday crew')
    expect(normaliseName('Friday\tcrew')).toBe('Friday crew')
  })

  it('leaves case alone — the uniqueness index lowercases, the display does not', () => {
    expect(normaliseName('NiScHaL')).toBe('NiScHaL')
  })

  it('reduces a whitespace-only name to empty', () => {
    expect(normaliseName('   ')).toBe('')
  })
})

describe('checkPlayerName', () => {
  it('accepts an ordinary name and returns what to send', () => {
    expect(checkPlayerName('  Nischal ')).toEqual({ value: 'Nischal', problem: null })
  })

  it('rejects empty and whitespace-only', () => {
    expect(checkPlayerName('').problem).toBe('empty')
    expect(checkPlayerName('   ').problem).toBe('empty')
  })

  it('rejects one character', () => {
    expect(checkPlayerName('N').problem).toBe('too-short')
  })

  it('accepts exactly the maximum and rejects one past it', () => {
    expect(checkPlayerName('a'.repeat(PLAYER_NAME_MAX)).problem).toBeNull()
    expect(checkPlayerName('a'.repeat(PLAYER_NAME_MAX + 1)).problem).toBe('too-long')
  })

  it('measures length after normalising, not before', () => {
    // Trailing spaces are not characters the server will store.
    expect(checkPlayerName(`${'a'.repeat(PLAYER_NAME_MAX)}    `).problem).toBeNull()
  })

  it('counts an astral character once, as Postgres char_length does', () => {
    // Naive .length would call this two characters and reject a legal name.
    expect(checkPlayerName('🎩🎩').problem).toBeNull()
  })

  it('never claims to know whether a name is available', () => {
    // Uniqueness is the database's answer. Nothing here may pre-empt it.
    const result = checkPlayerName('Priya')
    expect(Object.keys(result)).toEqual(['value', 'problem'])
  })
})

describe('checkRoomName', () => {
  it('accepts an ordinary room name', () => {
    expect(checkRoomName('Friday crew')).toEqual({ value: 'Friday crew', problem: null })
  })

  it('allows a longer name than a player name does', () => {
    expect(checkRoomName('a'.repeat(ROOM_NAME_MAX)).problem).toBeNull()
    expect(checkRoomName('a'.repeat(ROOM_NAME_MAX + 1)).problem).toBe('too-long')
  })

  it('rejects empty', () => {
    expect(checkRoomName('  ').problem).toBe('empty')
  })
})

describe('playerNameProblemMessage', () => {
  it('says something for every problem the checker can produce', () => {
    for (const problem of ['empty', 'too-short', 'too-long'] as const) {
      expect(playerNameProblemMessage(problem)).toBeTruthy()
    }
  })
})
