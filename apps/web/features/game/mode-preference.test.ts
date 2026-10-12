import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readModePreference, writeModePreference } from './mode-preference'

describe('mode preference', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('remembers the last game picked', () => {
    expect(readModePreference()).toBeNull()
    writeModePreference(4)
    expect(readModePreference()).toBe(4)
  })

  it('ignores anything that is not a mode', () => {
    window.localStorage.setItem('wordroom.mode', '9')
    expect(readModePreference()).toBeNull()
  })

  it('survives storage that throws', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
      },
    })
    expect(readModePreference()).toBeNull()
  })
})
