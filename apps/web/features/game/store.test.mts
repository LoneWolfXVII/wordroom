import { beforeEach, describe, expect, it } from 'vitest'
import { createMockGameApi } from './dev/mock-api'
import { loadGuessList } from './guess-list'
import { useGameStore } from './store'

/** See keys.test.mts for why these files are `.mts`. */

const ROOM = { id: 'room-1', name: 'Friday crew', code: 'KHX7' }

/** The mock's 5-letter puzzle No. 1. */
const WORD = 'cream'

const store = () => useGameStore.getState()

async function start(settings?: { hardMode?: boolean }) {
  useGameStore.getState().reset()
  useGameStore.getState().configure({
    room: ROOM,
    mode: 5,
    api: createMockGameApi({ latencyMs: 0 }),
    settings: {
      timerMode: 'off',
      perPuzzleSeconds: 180,
      hardMode: settings?.hardMode ?? false,
    },
  })
  await store().loadPuzzle(5, 1)
}

/** Type a word and submit it, then land the reveal the way the hook would. */
async function play(word: string) {
  for (const letter of word) store().typeLetter(letter)
  await store().submit()
  store().finishReveal()
}

beforeEach(async () => {
  // The client spelling check is only active once the list is in memory.
  await loadGuessList(5)
  await start()
})

describe('typing', () => {
  it('fills the row and stops at the word length', () => {
    for (const letter of 'craned') store().typeLetter(letter)
    expect(store().current).toBe('crane')
  })

  it('ignores anything that is not a letter', () => {
    store().typeLetter('4')
    store().typeLetter('É')
    expect(store().current).toBe('')
  })

  it('deletes from the end and stops at empty', () => {
    for (const letter of 'cr') store().typeLetter(letter)
    store().deleteLetter()
    store().deleteLetter()
    store().deleteLetter()
    expect(store().current).toBe('')
  })
})

describe('an invalid word is not a guess', () => {
  it('rejects a short row without touching the network', async () => {
    for (const letter of 'cra') store().typeLetter(letter)
    const before = store().shakeToken
    await store().submit()

    expect(store().guesses).toHaveLength(0)
    expect(store().current).toBe('cra')
    expect(store().shakeToken).toBe(before + 1)
    expect(store().notice?.message).toBe('Not enough letters')
  })

  it('rejects a non-word from the client list, keeping the letters on the board', async () => {
    for (const letter of 'xzqjv') store().typeLetter(letter)
    await store().submit()

    expect(store().guesses).toHaveLength(0)
    expect(store().current).toBe('xzqjv')
    expect(store().notice?.message).toBe('Not a word')
    expect(store().status).toBe('playing')
  })

  it('rejects a hard-mode violation with the message that names the letter', async () => {
    await start({ hardMode: true })
    await loadGuessList(5)
    await play('crane') // c and r are green against CREAM

    for (const letter of 'sting') store().typeLetter(letter)
    await store().submit()

    expect(store().guesses).toHaveLength(1)
    expect(store().notice?.message).toBe('1st letter must be C')
  })
})

describe('a scored guess', () => {
  it('records the marks and blocks input until the reveal lands', async () => {
    for (const letter of 'crane') store().typeLetter(letter)
    await store().submit()

    expect(store().status).toBe('revealing')
    expect(store().revealingRow).toBe(0)
    expect(store().guesses[0]?.marks).toEqual([
      'correct',
      'correct',
      'present',
      'absent',
      'present',
    ])

    // Input is ignored mid-flip.
    store().typeLetter('a')
    expect(store().current).toBe('')

    store().finishReveal()
    expect(store().status).toBe('playing')
    expect(store().revealingRow).toBe(null)
  })

  it('accumulates key states as the row lands', async () => {
    await play('crane')
    expect(store().keyStates).toEqual({
      c: 'correct',
      r: 'correct',
      a: 'present',
      n: 'absent',
      e: 'present',
    })
  })
})

describe('the word stays server-side until the attempt is over', () => {
  it('is absent while the puzzle is in play', async () => {
    await play('crane')
    expect(store().revealedWord).toBe(null)
    expect(store().status).toBe('playing')
  })

  it('arrives with the solving guess', async () => {
    await play(WORD)
    expect(store().status).toBe('solved')
    expect(store().revealedWord).toBe(WORD)
    expect(store().bounceRow).toBe(0)
    expect(store().points).toBe(6)
  })

  it('arrives when the sixth guess is used up', async () => {
    for (let i = 0; i < 6; i++) await play('crane')
    expect(store().status).toBe('failed')
    expect(store().revealedWord).toBe(WORD)
    expect(store().points).toBe(0)
    expect(store().guesses).toHaveLength(6)
  })

  it('arrives on a timeout, which is a fail worth no points', async () => {
    await store().timeout()
    expect(store().status).toBe('failed')
    expect(store().revealedWord).toBe(WORD)
    expect(store().points).toBe(0)
    expect(store().guesses).toHaveLength(0)
  })
})

describe('next puzzle', () => {
  it('advances the number and wipes the board without waiting for anyone', async () => {
    await play(WORD)
    await store().nextPuzzle()

    expect(store().puzzle?.number).toBe(2)
    expect(store().guesses).toHaveLength(0)
    expect(store().keyStates).toEqual({})
    expect(store().revealedWord).toBe(null)
    expect(store().status).toBe('playing')
    expect(store().resultOpen).toBe(false)
  })
})

describe('settings', () => {
  it('applies a change from the next puzzle, never mid-puzzle', async () => {
    store().applySettings({ timerMode: 'off', perPuzzleSeconds: 180, hardMode: true })
    expect(store().hardMode).toBe(false)

    await store().nextPuzzle()
    expect(store().hardMode).toBe(true)
  })
})

describe('the result sheet', () => {
  it('only opens once there is a result to show', async () => {
    store().openResult()
    expect(store().resultOpen).toBe(false)

    await play(WORD)
    store().openResult()
    expect(store().resultOpen).toBe(true)

    store().closeResult()
    expect(store().resultOpen).toBe(false)
  })
})
