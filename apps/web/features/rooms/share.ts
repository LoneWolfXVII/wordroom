/**
 * Sharing a room.
 *
 * The link format is `/r/<CODE>`, which the build plan already uses in its share
 * example. It opens the join screen with the code filled in, so the person
 * receiving it never retypes four characters into a phone.
 *
 * Nothing here mentions a puzzle, a number or a result — that share text belongs
 * to the game's result sheet and carries a colour grid. This is only ever an
 * invitation.
 */

/** Absolute URL for a room's invitation. Browser only — it needs an origin. */
export function shareUrl(code: string): string {
  return `${window.location.origin}/r/${code}`
}

/**
 * Copy text, with the fallback that keeps this working outside a secure context.
 *
 * `navigator.clipboard` is undefined on plain http, which includes a phone
 * testing against a laptop's LAN address, so the deprecated `execCommand` path
 * stays until that stops mattering.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Denied or unavailable; fall through.
  }

  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(field)
    return copied
  } catch {
    return false
  }
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Offer the room link through the OS share sheet, falling back to the clipboard.
 *
 * A cancelled share sheet is reported as `cancelled` rather than retried through
 * the clipboard: the player closed it on purpose, and a "Link copied" toast after
 * that reads as the app ignoring them.
 */
export async function shareRoom(code: string, roomName: string): Promise<ShareOutcome> {
  const url = shareUrl(code)

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: 'Wordroom',
        text: `Join ${roomName} on Wordroom. The code is ${code}.`,
        url,
      })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Anything else — a share sheet that refused to open — falls through to
      // the clipboard, which always works.
    }
  }

  return (await copyText(url)) ? 'copied' : 'failed'
}
