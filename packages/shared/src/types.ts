/**
 * Shared domain types for Wordroom.
 *
 * SECURITY: no type in this file that is reachable from the browser may carry a
 * puzzle answer. Server-only shapes are suffixed `Secret` and must never be
 * serialised into a client response. See CLAUDE.md, "Answers never reach the client".
 */

/** Word length. Each mode has its own puzzle sequence and its own leaderboard. */
export type Mode = 5 | 6 | 7

export const MODES: readonly Mode[] = [5, 6, 7] as const

/** Guesses allowed per puzzle, in every mode. */
export const MAX_GUESSES = 6

/** Per-tile result of a scored guess. */
export type Mark = 'correct' | 'present' | 'absent'

/** One scored guess: one mark per letter, in guess order. */
export type MarkRow = readonly Mark[]

/**
 * Room-code alphabet: A-Z minus the two letters that get misread out loud or in
 * a chat window — O (as zero) and I (as one).
 *
 * Letters only, deliberately. The spec says "4-letter code (A-Z minus O and I)";
 * the build plan's "codes exclude 0/O/1/I" is satisfied by this too, since a
 * letters-only alphabet contains no 0 or 1 to exclude. Allowing digits produced
 * real codes like `7764` — an all-numeric code for a word game reads as a bug,
 * and it is the kind of thing a player reads aloud to a friend. 24^4 is still
 * 331,776 codes.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CODE_LENGTH = 4
export const MAX_PLAYERS = 8

export type TimerMode = 'off' | 'per-puzzle' | 'per-guess' | 'sprint'

export interface PlayerSettings {
  timerMode: TimerMode
  /** Seconds allowed when `timerMode` is `per-puzzle`. 30-600, in 30s steps. */
  perPuzzleSeconds: number
  hardMode: boolean
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  timerMode: 'off',
  perPuzzleSeconds: 180,
  hardMode: false,
}

export interface Room {
  id: string
  /** 4 characters from `CODE_ALPHABET`. */
  code: string
  name: string
  hostPlayerId: string | null
  maxPlayers: number
  /** IANA zone of the host; the weekly leaderboard resets Monday 00:00 here. */
  timezone: string
  createdAt: string
  archivedAt: string | null
}

export interface Player {
  id: string
  roomId: string
  /** Null until an anonymous session is upgraded to a real account. */
  authUserId: string | null
  /** Locked at creation. There is no rename path in the UI or the API. */
  name: string
  settings: PlayerSettings
  createdAt: string
}

/**
 * Client-safe puzzle. Deliberately has no `answer` field: this is the only
 * puzzle shape an API route or Edge Function may return to a browser.
 */
export interface Puzzle {
  id: string
  roomId: string
  mode: Mode
  /** The room's puzzle counter for this mode, starting at 1. */
  number: number
}

/** SERVER ONLY. Never return this from a handler, never put it in a store. */
export interface PuzzleSecret extends Puzzle {
  answer: string
}

export interface Attempt {
  id: string
  playerId: string
  puzzleId: string
  /** Owner-only. Other players in the room see `marks`, never the words. */
  guesses: string[]
  /** Colour grid, one row per guess. Safe to show to the whole room. */
  marks: MarkRow[]
  solved: boolean
  guessCount: number
  elapsedMs: number | null
  timerMode: TimerMode
  hardMode: boolean
  finishedAt: string | null
}

export interface LeaderboardRow {
  playerId: string
  playerName: string
  mode: Mode
  rank: number
  points: number
  played: number
  solved: number
  averageGuesses: number
  totalElapsedMs: number | null
  hardMode: boolean
}

/** Minimal attempt shape needed to compute stats. */
export interface StatAttempt {
  mode: Mode
  /** Puzzle number within the mode. */
  number: number
  solved: boolean
  guessCount: number
}

export interface PlayerStats {
  mode: Mode
  played: number
  won: number
  /** 0-100, rounded to the nearest integer. */
  winPercent: number
  currentStreak: number
  maxStreak: number
  /** Solves by guess count: index 0 is a 1-guess solve, index 5 a 6-guess solve. */
  distribution: number[]
}
