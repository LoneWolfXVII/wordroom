'use client'

import { useState } from 'react'
import { Button, Help, Icon, Input, toast } from '@/components/ui'
import { GoogleIcon, LinkIcon } from '@/components/ui/icons'
import { resolveRoomsError } from './errors'
import { linkEmail, linkGoogle, looksLikeEmail } from './identity'

export interface SignInPanelProps {
  /** Where to come back to after Google bounces the player through its screens. */
  returnPath: string
  /** Rendered beside the primary action — the nudge's "Not now", for instance. */
  secondaryAction?: React.ReactNode
  /** Called once an email link is on its way; Google navigates away instead. */
  onEmailSent?: () => void
  className?: string
}

/**
 * The two ways to stop being a guest.
 *
 * Both *link* an identity onto the existing anonymous user rather than signing a
 * new one in, so the room and the locked name survive. See `identity.ts`.
 */
export function SignInPanel({
  returnPath,
  secondaryAction,
  onEmailSent,
  className,
}: SignInPanelProps) {
  const [mode, setMode] = useState<'choose' | 'email'>('choose')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const google = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await linkGoogle(returnPath)
    } catch (error) {
      setProblem(resolveRoomsError(error).message)
      setBusy(false)
    }
    // No cleanup on success: the page is already navigating to Google.
  }

  const sendLink = async () => {
    if (!looksLikeEmail(email)) {
      setProblem('That does not look like an email address.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await linkEmail(email.trim())
      toast('Check your email')
      onEmailSent?.()
    } catch (error) {
      setProblem(resolveRoomsError(error).message)
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'email') {
    return (
      <div className={className}>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="you@example.com"
          aria-label="Email address"
          aria-invalid={problem ? true : undefined}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setProblem(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void sendLink()
          }}
          className="h-11 text-[15px]"
        />
        {problem ? (
          <Help tone="error" className="mt-2">
            {problem}
          </Help>
        ) : (
          <Help className="mt-2">
            We'll send a link. Your name and room stay exactly as they are.
          </Help>
        )}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2.5">
          <Button size="sm" variant="ghost" onClick={() => setMode('choose')} disabled={busy}>
            Back
          </Button>
          <Button size="sm" variant="primary" className="w-full" loading={busy} onClick={sendLink}>
            Send link
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {problem ? (
        <Help tone="error" className="mb-2.5">
          {problem}
        </Help>
      ) : null}
      <div className="grid grid-cols-[auto_1fr] gap-2.5">
        {secondaryAction ?? <span />}
        <Button size="sm" variant="primary" className="w-full" loading={busy} onClick={google}>
          <Icon icon={GoogleIcon} size={18} />
          Continue with Google
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setMode('email')}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md text-[13px] text-ink-2 transition-colors duration-state active:text-ink"
      >
        <Icon icon={LinkIcon} size={16} />
        Use an email link instead
      </button>
    </div>
  )
}
