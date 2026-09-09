'use client'

/**
 * Which build this device is running.
 *
 * The app is a PWA behind a service worker, so "are you on the latest version?"
 * is a question neither the player nor we could answer before this line
 * existed — and the answer changes what a bug report means. A stale build
 * explaining a bug is a different problem from a current build explaining it.
 *
 * Deliberately quiet: it is not a setting, it is the label on the tin.
 */
export function BuildStamp() {
  const version = process.env.NEXT_PUBLIC_VERSION ?? '0.0.0'

  return (
    <p className="m-0 pt-1 text-center text-[12px] text-muted">
      Version <span className="tabular">v{version}</span>
    </p>
  )
}
