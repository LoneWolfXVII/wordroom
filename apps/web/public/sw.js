/*
 * Wordroom's service worker.
 *
 * It exists for two reasons and no others: to make the app installable, and to
 * have something warm-white to show when the network is gone. It is deliberately
 * the smallest worker that does those two things.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CACHES
 *
 *   - `/_next/static/**` — the JS, CSS and font chunks Next fingerprints by
 *     content. A new build changes the hash, so a cached chunk can never be the
 *     stale version of a chunk a new page asked for. The guess list is one of
 *     these: it is a dynamic `import()` of `words-5/6/7`, which the bundler
 *     emits as its own hashed chunk. Caching it is the one bit of game data this
 *     worker is allowed to hold, and CLAUDE.md says why — it is the spelling
 *     list, never the answer list.
 *   - `/offline.html` — precached on install, because a page shown when the
 *     network is gone cannot be fetched when the network is gone. It is the only
 *     precache: it draws its tile in CSS and needs no image, so nothing else has
 *     to be in the cache before the first failure.
 *   - `/icons/**` and `/og.png` — cached opportunistically, if and when
 *     something asks for them.
 *
 * WHAT IT REFUSES TO CACHE
 *
 *   - Every cross-origin request, which is where all game data lives. Puzzles,
 *     attempts, guesses, marks and the leaderboard are Supabase REST, Edge
 *     Function and realtime calls to `*.supabase.co`, and this worker returns
 *     before it looks at them. An answer therefore cannot end up in a cache
 *     here, because an answer never travels over this origin.
 *   - `/api/**`, which is this app's own share-image endpoint. A rendered share
 *     card shows a finished attempt's letters; it has no business in a cache
 *     shared by every tab on the origin.
 *   - HTML documents. Navigations are network-only with the offline page as the
 *     failure branch. That is the deliberate limit on this worker's scope: an
 *     app-shell cache would mean a returning player could get yesterday's HTML
 *     pointing at chunks that no longer exist, and a word game does not need
 *     offline-first badly enough to accept that risk.
 */

const VERSION = 'v1'
const SHELL = `wordroom-shell-${VERSION}`
const ASSETS = `wordroom-assets-${VERSION}`
const KEEP = [SHELL, ASSETS]

const OFFLINE_URL = '/offline.html'

/** The whole precache: one page, so installing costs one request. */
const PRECACHE = [OFFLINE_URL]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      // A failed precache must not wedge the worker in "installing" forever;
      // the app works fine without it, it just loses the offline page.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

/** True for the fingerprinted build output and the committed artwork. */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/og.png'
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    )
    return
  }

  if (!isCacheableAsset(url)) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        // Only a clean same-origin 200 is worth keeping. An opaque or errored
        // response cached here would be indistinguishable from a real asset.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          void caches.open(ASSETS).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
