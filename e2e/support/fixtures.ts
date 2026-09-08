import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { test as base } from '@playwright/test'
import { type ApiUser, discoverAnswer, EdgeError, type Room } from './api'
import { hideDevOverlay, signInAs } from './app'
import { isSupabaseConfigured } from './env'
import { apiUserFor, SessionVault } from './sessions'
import { WireLog } from './wire'

/**
 * Every room this suite makes is named with this prefix and lives forever: no
 * client role may delete or archive a room (see `supabase/migrations/…_rls.sql`
 * — `grant all on public.rooms` goes to `service_role` only), and the test
 * runner deliberately holds no service-role key. `e2e/scripts/cleanup.mjs`
 * removes them when someone supplies one out of band.
 */
export const ROOM_PREFIX = 'E2E'

// Playwright empties `.artifacts` on every run; this log has to outlive that,
// because it is the record of what a run left behind on a live project.
const CACHE_DIR = path.resolve(import.meta.dirname, '../.cache')
const ROOM_LOG = path.join(CACHE_DIR, 'created-rooms.log')

/** Append the room to a local log so a run's leftovers are always knowable. */
function recordRoom(room: Room): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    appendFileSync(ROOM_LOG, `${new Date().toISOString()}\t${room.code}\t${room.name}\n`)
  } catch {
    // A log that cannot be written must not fail a test.
  }
}

export function testRoomName(label: string): string {
  // rooms.name is 1..40 characters.
  return `${ROOM_PREFIX} ${label} ${Math.random().toString(36).slice(2, 7)}`.slice(0, 40)
}

/**
 * The out-of-band accounts, shared by every test in a worker.
 *
 * Two of them, and no more: `host` creates rooms and plays their first puzzle
 * to the end so a test knows the answer, and `rival` exists purely so a *second*
 * player can have solved a puzzle the browser player has not. They have to be
 * different accounts — one attempt per player per puzzle — but they do not have
 * to be new ones, and anonymous sign-ins are the scarcest thing in this suite.
 */
export class Probe {
  private host: ApiUser | null = null
  private rival: ApiUser | null = null
  private roomsCreated = 0

  /** Rolls over before it reaches create-room's limit of 10 per hour. */
  private async hostUser(fresh = false): Promise<ApiUser> {
    if (fresh || this.host === null || this.roomsCreated >= 8) {
      this.host = await apiUserFor('host', fresh)
      this.roomsCreated = 0
    }
    return this.host
  }

  private async rivalUser(): Promise<ApiUser> {
    this.rival ??= await apiUserFor('rival')
    return this.rival
  }

  /**
   * Create a test room out of band and return it with its host account.
   *
   * The cached host account persists between runs, so its ten-rooms-per-hour
   * budget can already be spent when a run starts. That is the one case worth
   * spending a fresh anonymous sign-in on.
   */
  async createRoom(label: string): Promise<{ room: Room; user: ApiUser }> {
    let user = await this.hostUser()
    try {
      const { room } = await user.createRoom(testRoomName(label), 'Probe')
      this.roomsCreated += 1
      recordRoom(room)
      return { room, user }
    } catch (error) {
      if (!(error instanceof EdgeError) || error.code !== 'rate_limited') throw error
      user = await this.hostUser(true)
      const { room } = await user.createRoom(testRoomName(label), 'Probe')
      this.roomsCreated += 1
      recordRoom(room)
      return { room, user }
    }
  }

  /**
   * Create a room and play its first puzzle to the end, so the test knows the
   * answer the way a finished player does.
   */
  async roomWithKnownAnswer(label: string): Promise<{ room: Room; answer: string }> {
    const { room, user } = await this.createRoom(label)
    const puzzle = await user.getPuzzle(room.id, 5, 1)
    const answer = await discoverAnswer(user, puzzle.id)
    return { room, answer }
  }

  /**
   * Learn the answer to a room that already exists — one the UI just made, so
   * the test never had to see its id.
   */
  async answerFor(code: string, playerName: string): Promise<string> {
    const user = await this.hostUser()
    const { room } = await user.joinRoom(code, playerName)
    const puzzle = await user.getPuzzle(room.id, 5, 1)
    return discoverAnswer(user, puzzle.id)
  }

  /** Have a second player solve a puzzle the browser player has not. */
  async solveAsRival(room: Room, answer: string, playerName: string): Promise<void> {
    const user = await this.rivalUser()
    await user.joinRoom(room.code, playerName)
    const puzzle = await user.getPuzzle(room.id, 5, 1)
    const result = await user.submitGuess(puzzle.id, answer)
    if (!result.solved) throw new Error('The rival failed to solve with the known answer')
  }
}

interface WorkerFixtures {
  probe: Probe
  vault: SessionVault
}

interface TestFixtures {
  /** Every response body and websocket frame this page received. */
  wire: WireLog
  /** A signed-in session for a *second* player in the same room. */
  friendSession: string
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  probe: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature.
    async ({}, use) => {
      await use(new Probe())
    },
    { scope: 'worker' },
  ],

  vault: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature.
    async ({}, use) => {
      await use(new SessionVault())
    },
    { scope: 'worker' },
  ],

  page: async ({ page, browser, baseURL, vault }, use) => {
    await hideDevOverlay(page)
    await signInAs(page, await vault.get('player', browser, baseURL ?? ''))
    await use(page)
  },

  friendSession: async ({ browser, baseURL, vault }, use) => {
    await use(await vault.get('friend', browser, baseURL ?? ''))
  },

  wire: async ({ page, baseURL }, use) => {
    const log = WireLog.record(page, baseURL ?? 'http://127.0.0.1:3900')
    await use(log)
  },
})

export const expect = test.expect

/** Skip a whole spec when there is no project to run it against. */
export function requiresSupabase(): void {
  test.skip(
    !isSupabaseConfigured(),
    'No Supabase credentials — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  )
}
