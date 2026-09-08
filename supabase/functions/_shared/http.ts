/**
 * Request plumbing shared by every function: CORS, JSON parsing, one response
 * envelope, and a single place where an exception becomes a status code.
 */

import type { z } from 'zod'
import { AppError, badRequest } from './errors.ts'

const DEFAULT_ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-supabase-api-version'

/**
 * Browsers call these functions directly, so preflight has to work. Set
 * `WORDROOM_ALLOWED_ORIGINS` (comma separated) in production; the fallback of
 * `*` is fine for local work because every function still requires a JWT.
 */
function allowedOrigins(): string[] {
  const raw = Deno.env.get('WORDROOM_ALLOWED_ORIGINS')?.trim()
  if (!raw) return ['*']
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = allowedOrigins()
  const origin = req.headers.get('origin')
  const allowOrigin =
    allowed.includes('*') || origin === null || !allowed.includes(origin) ? '*' : origin

  return {
    'access-control-allow-origin': allowOrigin === '*' ? '*' : allowOrigin,
    'access-control-allow-headers': DEFAULT_ALLOWED_HEADERS,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'content-type': 'application/json; charset=utf-8' },
  })
}

export function errorResponse(req: Request, error: AppError): Response {
  const body = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  }
  return jsonResponse(req, body, error.status)
}

/** Parse and validate a JSON body. Zod issues come back as readable text. */
export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Expected a JSON body.')
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path.join('.')
    throw badRequest(first ? `${path ? `${path}: ` : ''}${first.message}` : 'Invalid request body.')
  }
  return parsed.data
}

/**
 * Wrap a handler so every function behaves the same way: OPTIONS is answered,
 * only POST is accepted, and nothing escapes as an unhandled rejection.
 */
export function serveFunction(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }

    if (req.method !== 'POST') {
      return errorResponse(
        req,
        new AppError('method_not_allowed', 405, 'Use POST for this endpoint.'),
      )
    }

    try {
      return await handler(req)
    } catch (cause) {
      if (cause instanceof AppError) return errorResponse(req, cause)
      console.error('unhandled error', cause)
      return errorResponse(req, new AppError('internal', 500, 'Something went wrong. Try again.'))
    }
  })
}
