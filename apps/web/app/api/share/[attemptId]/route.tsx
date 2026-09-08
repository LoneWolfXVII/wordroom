import type { ShareVariant } from '@/features/game/share'
import { isUuid, loadOwnedAttempt } from '../attempt'
import { CARD_HEIGHT, CARD_WIDTH, ShareCard } from '../card'
import type { CardInput } from '../headline'
import {
  decodeMarksCompact,
  encodeMarksCompact,
  type SharePayload,
  SPOILER_FREE_TTL_SECONDS,
  shareTokenSecret,
  signShareToken,
  verifyShareToken,
  WITH_LETTERS_TTL_SECONDS,
} from '../token'

/**
 * The share image, and the capability that lets someone ask for it.
 *
 *   POST /api/share/<attemptId>          mint  — authenticated, owner only
 *   GET  /api/share/<attemptId>.png?t=…  draw  — anonymous, token only
 *
 * Read `../token.ts` for why it is split like that. The short version: an
 * `<img>` sends no credentials, so the reader cannot be authenticated and the
 * writer has to be instead.
 *
 * Edge runtime. It is where `next/og` is fastest to start, and a cold render is
 * the only render that could miss the one-second budget.
 */
export const runtime = 'edge'

const PNG_SUFFIX = '.png'

/** Both weights, read once per isolate and reused by every render after it. */
const fonts = Promise.all([
  fetch(new URL('../fonts/Geist-SemiBold.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
  fetch(new URL('../fonts/Geist-Regular.ttf', import.meta.url)).then((r) => r.arrayBuffer()),
]).then(([semibold, regular]) => [
  { name: 'Geist', data: semibold, weight: 600 as const, style: 'normal' as const },
  { name: 'Geist', data: regular, weight: 400 as const, style: 'normal' as const },
])

function fail(status: number, code: string, message: string): Response {
  return Response.json(
    { error: code, message },
    { status, headers: { 'cache-control': 'no-store' } },
  )
}

// ---------------------------------------------------------------------------
// GET — draw the card a token describes.
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
): Promise<Response> {
  const { attemptId: segment } = await params
  if (!segment.endsWith(PNG_SUFFIX)) {
    return fail(404, 'not_found', 'Share images are served as .png.')
  }
  const attemptId = segment.slice(0, -PNG_SUFFIX.length)

  const token = new URL(request.url).searchParams.get('t')
  if (!token) {
    return fail(403, 'token_required', 'A share image needs the token its owner minted.')
  }

  const secret = shareTokenSecret()
  if (!secret) return fail(503, 'not_configured', 'Sharing is not configured on this deployment.')

  const result = await verifyShareToken(token, secret)
  if (!result.ok) {
    const status = result.reason === 'expired' ? 410 : 403
    return fail(status, result.reason, 'That share link is no longer valid.')
  }

  // A token names the attempt it was minted for. Pairing it with a different id
  // in the path is refused, so a token cannot be re-aimed at another attempt
  // even though the renderer would happily draw the same picture either way.
  if (result.payload.a !== attemptId) {
    return fail(403, 'token_mismatch', 'That token belongs to a different result.')
  }

  const { ImageResponse } = await import('next/og')
  const payload = result.payload
  let marks: ReturnType<typeof decodeMarksCompact>
  try {
    marks = decodeMarksCompact(payload.m)
  } catch {
    return fail(403, 'malformed', 'That share link is no longer valid.')
  }

  const words = payload.w
  const input: CardInput = {
    puzzleNumber: payload.n,
    roomCode: payload.c,
    rows: marks.map((row, index) => ({ marks: row, word: words?.[index] ?? null })),
    solved: payload.s,
    hardMode: payload.h,
    elapsedMs: payload.t,
    withLetters: words !== undefined,
    // The host the image was requested from, so a preview deploy prints a link
    // to itself rather than to production.
    host: new URL(request.url).host,
  }

  return new ImageResponse(<ShareCard input={input} />, {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts: await fonts,
    headers: {
      // The token carries the whole picture, so a given URL renders the same
      // bytes forever. That lets the CDN answer every scraper and every re-share
      // without waking this function again.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  })
}

// ---------------------------------------------------------------------------
// POST — mint a token for an attempt the caller owns and has finished.
// ---------------------------------------------------------------------------

interface MintBody {
  variant?: ShareVariant
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
): Promise<Response> {
  const { attemptId } = await params
  if (!isUuid(attemptId)) return fail(400, 'bad_request', 'That is not an attempt id.')

  const authorization = request.headers.get('authorization') ?? ''
  const accessToken = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : ''
  if (!accessToken) return fail(401, 'unauthorized', 'Sign-in is required to share a result.')

  let body: MintBody = {}
  try {
    const parsed: unknown = await request.json()
    if (parsed !== null && typeof parsed === 'object') body = parsed as MintBody
  } catch {
    // An empty body is fine; it means the default variant.
  }

  const variant: ShareVariant = body.variant === 'with-letters' ? 'with-letters' : 'spoiler-free'

  const secret = shareTokenSecret()
  if (!secret) return fail(503, 'not_configured', 'Sharing is not configured on this deployment.')

  const lookup = await loadOwnedAttempt(attemptId, accessToken)
  if (!lookup.ok) return fail(lookup.status, lookup.code, lookup.message)
  const attempt = lookup.attempt

  if (variant === 'with-letters' && attempt.guesses.length !== attempt.marks.length) {
    return fail(409, 'attempt_unreadable', 'That result has no words to show.')
  }

  const ttl = variant === 'with-letters' ? WITH_LETTERS_TTL_SECONDS : SPOILER_FREE_TTL_SECONDS
  const base: SharePayload = {
    v: 1,
    a: attempt.id,
    n: attempt.puzzleNumber,
    c: attempt.roomCode,
    s: attempt.solved,
    h: attempt.hardMode,
    t: attempt.elapsedMs,
    m: encodeMarksCompact(attempt.marks),
    x: Math.floor(Date.now() / 1000) + ttl,
  }

  // The words are added on one branch and one branch only. A spoiler-free token
  // does not carry a redacted word or an empty string in its place — the letters
  // are not in the signed bytes at all.
  const payload: SharePayload = variant === 'with-letters' ? { ...base, w: attempt.guesses } : base

  const token = await signShareToken(payload, secret)
  const path = `/api/share/${attempt.id}${PNG_SUFFIX}?t=${token}`

  return Response.json(
    {
      variant,
      path,
      url: new URL(path, request.url).toString(),
      expiresAt: new Date(payload.x * 1000).toISOString(),
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}
