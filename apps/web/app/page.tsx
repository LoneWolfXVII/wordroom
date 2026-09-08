import { MAX_GUESSES, MODES } from '@wordroom/shared'

/**
 * Placeholder shell. Workstream 1 replaces this with the real home screen;
 * it exists so the scaffold builds and CI has something to compile.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex h-dvh max-w-[520px] flex-col justify-end px-5 pb-8">
      <h1 className="text-[36px] font-semibold tracking-[-0.03em] leading-none">Wordroom</h1>
      <p className="mt-4 max-w-[30ch] text-[17px] leading-[1.4] text-ink-2">
        {MAX_GUESSES} guesses. {MODES.join(', ')} letters. One room, one leaderboard.
      </p>
      <p className="mt-6 text-[13px] text-muted">Scaffold only — screens land in workstream 1.</p>
    </main>
  )
}
