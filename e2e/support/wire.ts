import type { Page, Response } from '@playwright/test'

/**
 * Everything this browser session received, kept so a test can prove a string
 * was never on the wire.
 *
 * HTTP responses *and* websocket frames, because the leaderboard subscribes to
 * `attempts` over realtime and a realtime payload carries whatever columns the
 * subscribing role may select. The RLS migration says so in a comment addressed
 * to this workstream; this is the assertion it asks for.
 */

export type WireKind = 'response' | 'ws-received' | 'ws-sent'

export interface WireEntry {
  kind: WireKind
  url: string
  detail: string
  body: string
}

/**
 * The app's own JavaScript bundles are not scanned, and that exclusion is
 * load-bearing rather than convenient.
 *
 * The client ships the *guess* list — every spellable five-letter word, roughly
 * ten thousand of them — so the answer is necessarily inside that chunk, along
 * with 9,999 words that are not the answer. Finding it there reveals nothing
 * and is exactly what CLAUDE.md says should ship. What must never happen is the
 * *backend* naming the answer: a REST row, an edge-function body, an SSR
 * payload, a realtime frame. Those are all scanned.
 */
function isAppBundle(url: string, contentType: string, appOrigin: string): boolean {
  if (!url.startsWith(appOrigin)) return false
  if (url.includes('/_next/')) return true
  return /javascript|text\/css|font|image\//.test(contentType)
}

function redact(text: string): string {
  // Access tokens travel on this wire; a failure message should not paste one
  // into a CI log.
  return text.replace(/eyJ[A-Za-z0-9_-]{10,}/g, '<jwt>')
}

export class WireLog {
  private readonly entries: WireEntry[] = []
  private readonly pending: Promise<void>[] = []

  private constructor(private readonly appOrigin: string) {}

  /** Start recording. Call before the first navigation or frames are missed. */
  static record(page: Page, appOrigin: string): WireLog {
    const log = new WireLog(appOrigin)
    log.watch(page)
    return log
  }

  /** Record a second page in the same context (a popup, a second tab). */
  watch(page: Page): void {
    page.on('response', (response) => {
      this.pending.push(this.capture(response))
    })

    page.on('websocket', (ws) => {
      ws.on('framereceived', (frame) => {
        this.entries.push({
          kind: 'ws-received',
          url: ws.url(),
          detail: 'frame',
          body: typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'),
        })
      })
      ws.on('framesent', (frame) => {
        this.entries.push({
          kind: 'ws-sent',
          url: ws.url(),
          detail: 'frame',
          body: typeof frame.payload === 'string' ? frame.payload : frame.payload.toString('utf8'),
        })
      })
    })
  }

  private async capture(response: Response): Promise<void> {
    const url = response.url()
    const contentType = response.headers()['content-type'] ?? ''
    if (isAppBundle(url, contentType, this.appOrigin)) return

    try {
      const body = await response.body()
      this.entries.push({
        kind: 'response',
        url,
        detail: `${response.request().method()} ${response.status()} ${contentType}`,
        body: body.toString('utf8'),
      })
    } catch {
      // A body that is gone (a redirect, a cancelled request, a page that
      // navigated away) carried nothing this assertion can read. Recording the
      // miss keeps the count honest.
      this.entries.push({
        kind: 'response',
        url,
        detail: `${response.request().method()} ${response.status()} <body unavailable>`,
        body: '',
      })
    }
  }

  /** Let in-flight body reads finish before asserting over the log. */
  async settle(): Promise<void> {
    await Promise.all([...this.pending])
  }

  get size(): number {
    return this.entries.length
  }

  /** How many entries came from the backend rather than the app origin. */
  get backendCount(): number {
    return this.entries.filter((entry) => !entry.url.startsWith(this.appOrigin)).length
  }

  find(needle: string): WireEntry[] {
    const lower = needle.toLowerCase()
    return this.entries.filter((entry) => entry.body.toLowerCase().includes(lower))
  }

  /** A short, token-free description of where a string was found. */
  describe(needle: string): string {
    const lower = needle.toLowerCase()
    return this.find(needle)
      .map((entry) => {
        const at = entry.body.toLowerCase().indexOf(lower)
        const context = entry.body.slice(Math.max(0, at - 80), at + needle.length + 80)
        return `  [${entry.kind}] ${entry.url}\n    (${entry.detail})\n    …${redact(context)}…`
      })
      .join('\n')
  }
}
