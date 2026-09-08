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

  /*
   * Never in development.
   *
   * The worker caches `/_next/static/**` first-hit-wins, which is safe in
   * production because Next fingerprints those filenames by content: a new
   * build asks for URLs no cache can already hold. `next dev` does not
   * fingerprint them — it serves `webpack.js?v=...` and re-uses the same paths
   * across rebuilds — so the cache answers a rebuilt page with the previous
   * build's chunks and the app dies on a module graph that no longer matches
   * itself. That is a white screen and a `TypeError` pointing at nothing, and
   * it costs an hour to recognise the second time as much as the first.
   */
  const dev = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  if (dev) {
    // Also undo it for anyone who already has one from before this guard.
    navigator.serviceWorker.getRegistrations().then((all) => {
      for (const one of all) void one.unregister()
    })
    return
  }

  // Set by the root layout from the deployment's commit sha. It makes the
  // worker URL change per build, which is what makes a deploy replace the
  // worker rather than reuse it.
  const build = document.querySelector('script[data-build]')?.dataset.build ?? 'dev'

  const register = () => {
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(build)}`, { scope: '/' })
      .catch(() => {
        // No worker means no install prompt and no offline page. Everything
        // else about the app is unaffected, so there is nothing to tell the
        // player.
      })
  }

  const whenIdle = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(register, { timeout: 4000 })
    else setTimeout(register, 2000)
  }

  if (document.readyState === 'complete') whenIdle()
  else addEventListener('load', whenIdle)
})()
