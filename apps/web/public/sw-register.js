/*
 * Registers the service worker.
 *
 * This lives in `public/` rather than in a React component so that wiring it up
 * costs the root layout one `<script defer>` and nothing else — no client
 * boundary, no extra bundle, and no ownership argument over a shared file.
 *
 * Registration waits for `load` and then for the main thread to go idle, so
 * neither the worker script nor its precache ever competes with the first paint
 * for a phone's one slow connection. Nothing about the first visit depends on
 * the worker existing — it is for the visit after this one — so there is no
 * reason to be in a hurry. It is skipped outside a secure context, where
 * `navigator.serviceWorker` does not exist.
 */
;(() => {
  if (!('serviceWorker' in navigator)) return

  const register = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // No worker means no install prompt and no offline page. Everything else
      // about the app is unaffected, so there is nothing to tell the player.
    })
  }

  const whenIdle = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 4000 })
    else setTimeout(register, 2000)
  }

  if (document.readyState === 'complete') whenIdle()
  else addEventListener('load', whenIdle)
})()
