/*
 * Registers the service worker.
 *
 * This lives in `public/` rather than in a React component so that wiring it up
 * costs the root layout one `<script defer>` and nothing else — no client
 * boundary, no extra bundle, and no ownership argument over a shared file.
 *
 * Registration waits for `load` so it never competes with the first paint for
 * bandwidth on a phone, and it is skipped outside a secure context, where
 * `navigator.serviceWorker` does not exist.
 */
;(() => {
  if (!('serviceWorker' in navigator)) return

  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // No worker means no install prompt and no offline page. Everything else
      // about the app is unaffected, so there is nothing to tell the player.
    })
  })
})()
