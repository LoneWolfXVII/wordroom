'use client'

import { useEffect, useState } from 'react'
import { Button, Help, Icon, Input, toast } from '@/components/ui'
import { GoogleIcon, LinkIcon, SendLinkIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { resolveRoomsError } from './errors'
import { looksLikeEmail, signInWithEmail, signInWithGoogle } from './identity'

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
 * The two ways to stop being a guest. Either one reaches a new account or an
 * existing one, and the guest's rooms come along — see `identity.ts`.
 */
export function SignInPanel({
  returnPath,
  secondaryAction,
  onEmailSent,
  className,
}: SignInPanelProps) {
  const [mode, setMode] = useState<'choose' | 'email'>('choose')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // Two different waits, and only one of them ends by itself. `sending` is a
  // request we will get an answer to. `leaving` is the tab being handed to
  // Google, which has no failure callback at all.
  const busy = sending || leaving

  /**
   * Give the button back when the player is demonstrably still here.
   *
   * Handing the tab to Google is the one action with no completion to await, so
   * `leaving` used to be set and never cleared. Cancel at Google's account
   * picker and you came back to a spinner over a dead button, with the email
   * link behind it disabled too - the panel was waiting for a trip that was
   * already over.
   *
   * There is no "the player cancelled" event, but there is proof by return: a
   * bfcache restore replays `pageshow` with `persisted`, and a tab that was
   * never unloaded fires `visibilitychange` back to `visible`. Either one means
   * this page is in front of the player, so nothing is pending.
   *
   * Scoped to `leaving` on purpose. An in-flight `sending` must survive the
   * player glancing at another tab, or they can send a second link on top of
   * the first.
   */
  useEffect(() => {
    if (!leaving) return
    const stopWaiting = () => setLeaving(false)
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) stopWaiting()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') stopWaiting()
    }
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [leaving])

  const google = async () => {
    setLeaving(true)
    setProblem(null)
    try {
      await signInWithGoogle(returnPath)
    } catch (error) {
      setProblem(resolveRoomsError(error).message)
      setLeaving(false)
    }
    // No cleanup on success: the page is already navigating to Google.
  }

  const sendLink = async () => {
    if (!looksLikeEmail(email)) {
      setProblem('That does not look like an email address.')
      return
    }
    setSending(true)
    setProblem(null)
    try {
      await signInWithEmail(email.trim(), returnPath)
      toast('Check your email')
      onEmailSent?.()
    } catch (error) {
      setProblem(resolveRoomsError(error).message)
    } finally {
      setSending(false)
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
            if (event.key !== 'Enter') return
            event.preventDefault()
            void sendLink()
          }}
          className="h-11 text-[15px]"
        />
        {problem ? (
          <Help tone="error" className="mt-2">
            {problem}
          </Help>
        ) : (
          <Help className="mt-2">We'll send a link. Your rooms and names come with you.</Help>
        )}
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2.5">
          <Button size="sm" variant="ghost" onClick={() => setMode('choose')} disabled={busy}>
            Back
          </Button>
          <Button size="sm" variant="primary" className="w-full" loading={busy} onClick={sendLink}>
            <Icon icon={SendLinkIcon} size={18} />
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
      {/* No empty first column without a secondary action: its gap alone
          indented the button off the sheet's edge. */}
      <div className={cn('grid gap-2.5', secondaryAction && 'grid-cols-[auto_1fr]')}>
        {secondaryAction}
        <Button size="sm" variant="primary" className="w-full" loading={busy} onClick={google}>
          <Icon icon={GoogleIcon} size={18} />
          Continue with Google
        </Button>
      </div>
      <button
        type="button"
        onClick={() => {
          setLeaving(false)
          setProblem(null)
          setMode('email')
        }}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-md text-[13px] text-ink-2 transition-colors duration-state active:text-ink"
      >
        <Icon icon={LinkIcon} size={16} />
        Use an email link instead
      </button>
    </div>
  )
}
