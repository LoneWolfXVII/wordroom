import { MAX_GUESSES, MODES } from '@wordroom/shared'
import { Screen } from '@/components/ui'

/**
 * Placeholder home screen. Workstream 3 owns the real one under
 * `app/(onboarding)`; this exists so the scaffold builds and shows that the
 * shell, the font and the tokens are wired up.
 */
export default function HomePage() {
  return (
    <Screen className="justify-end pb-8">
      <h1 className="text-[36px] leading-none font-semibold tracking-[-0.03em]">Wordroom</h1>
      <p className="mt-4 max-w-[30ch] text-[17px] leading-[1.4] text-ink-2">
        {MAX_GUESSES} guesses. {MODES.join(', ')} letters. One room, one leaderboard.
      </p>
      <p className="mt-6 text-[13px] text-muted">
        Scaffold only — screens land in workstream 3. The design system is at{' '}
        <a className="text-accent underline underline-offset-2" href="/dev/ds">
          /dev/ds
        </a>
        .
      </p>
    </Screen>
  )
}
