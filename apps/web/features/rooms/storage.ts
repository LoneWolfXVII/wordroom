/**
 * Browser storage, in one place.
 *
 * Everything here is a *preference*, never a fact. Which room to open is stored;
 * whether you are in it is not — that lives in `players`, behind RLS, and is
 * read back with `fetchMySeats`. Losing all of this costs a player one tap.
 *
 * Every accessor is wrapped: Safari in private mode throws on `localStorage`
 * rather than returning null, and an onboarding flow must not die because of it.
 */

const ACTIVE_ROOM_KEY = 'wordroom.activeRoom'
const SAVE_PROMPT_KEY = 'wordroom.savePromptSeen'
const PENDING_SEAT_KEY = 'wordroom.pendingSeat'
const RETURN_PATH_KEY = 'wordroom.returnPath'

type Store = 'local' | 'session'

function store(kind: Store): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function read(kind: Store, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(kind: Store, key: string, value: string | null): void {
  try {
    const target = store(kind)
    if (!target) return
    if (value === null) target.removeItem(key)
    else target.setItem(key, value)
  } catch {
    // Storage full or blocked. The flow still works, it just forgets.
  }
}

/* -------------------------------------------------------------------------- */
/* Active room                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The room to reopen on the next visit, and what it is called.
 *
 * The name is stored for exactly one reason: the home screen's resume card has
 * to be on screen at first paint, and the real name is two round trips away —
 * the seats query, then the room. It is still a preference like everything else
 * here. It never decides *whether* there is a seat to go back to; `fetchMySeats`
 * does, and `useActiveSeat` clears this the moment that says there is none.
 */
export interface ActiveRoom {
  id: string
  /** Null when the id was stored before the room's name was known. */
  name: string | null
}

export function getActiveRoom(): ActiveRoom | null {
  const raw = read('local', ACTIVE_ROOM_KEY)
  if (!raw) return null

  // Installs from before the name was kept hold a bare id under this key. That
  // reads as "id, no name": those players get one late-arriving card, once,
  // and the next write upgrades them.
  if (!raw.startsWith('{')) return { id: raw, name: null }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const value = parsed as Partial<ActiveRoom>
    if (typeof value.id !== 'string' || value.id === '') return null
    return { id: value.id, name: typeof value.name === 'string' ? value.name : null }
  } catch {
    return null
  }
}

/** The room id to reopen on the next visit. Null until a seat is taken. */
export function getActiveRoomId(): string | null {
  return getActiveRoom()?.id ?? null
}

export function setActiveRoom(room: ActiveRoom | null): void {
  write('local', ACTIVE_ROOM_KEY, room === null ? null : JSON.stringify(room))
}

/* -------------------------------------------------------------------------- */
/* Pending seat — the half-finished create or join                            */
/* -------------------------------------------------------------------------- */

/**
 * What the player has chosen before they reach the name screen.
 *
 * `create-room` and `join-room` both want the player's name in the same call, so
 * neither can be sent until the name is locked. This carries the earlier screen's
 * answer across that gap.
 *
 * In `sessionStorage`, so a reload mid-flow keeps it and a new tab starts clean.
 */
export type PendingSeat = { kind: 'create'; roomName: string } | { kind: 'join'; code: string }

export function getPendingSeat(): PendingSeat | null {
  const raw = read('session', PENDING_SEAT_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const value = parsed as Partial<PendingSeat>
    if (value.kind === 'create' && typeof value.roomName === 'string') {
      return { kind: 'create', roomName: value.roomName }
    }
    if (value.kind === 'join' && typeof value.code === 'string') {
      return { kind: 'join', code: value.code }
    }
    return null
  } catch {
    return null
  }
}

export function setPendingSeat(seat: PendingSeat | null): void {
  write('session', PENDING_SEAT_KEY, seat === null ? null : JSON.stringify(seat))
}

/* -------------------------------------------------------------------------- */
/* Save-progress nudge                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Whether the sign-in nudge has had its one showing.
 *
 * The spec is exact: once, after the first puzzle's result, never before. This
 * flag is the "never again" half; the game tells us when the first result has
 * happened, because only it knows.
 */
export function hasSeenSavePrompt(): boolean {
  return read('local', SAVE_PROMPT_KEY) === '1'
}

export function markSavePromptSeen(): void {
  write('local', SAVE_PROMPT_KEY, '1')
}

/* -------------------------------------------------------------------------- */
/* OAuth return path                                                          */
/* -------------------------------------------------------------------------- */

/** Where to land after an identity link bounces through the provider. */
export function getReturnPath(): string | null {
  const path = read('session', RETURN_PATH_KEY)
  // Only ever a same-origin path, so a tampered value cannot become an open
  // redirect to another site.
  return path?.startsWith('/') && !path.startsWith('//') ? path : null
}

export function setReturnPath(path: string | null): void {
  write('session', RETURN_PATH_KEY, path)
}
