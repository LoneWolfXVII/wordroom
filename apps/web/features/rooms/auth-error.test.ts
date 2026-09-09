import { describe, expect, it } from 'vitest'
import { readAuthFailure } from './auth-error'

const read = (query: string) => readAuthFailure(new URLSearchParams(query))

describe('readAuthFailure', () => {
  it('says nothing when the callback carries no error', () => {
    expect(read('code=abc123')).toBeNull()
    expect(read('')).toBeNull()
  })

  it('reads the modern error_code in preference to the older error', () => {
    // Supabase sends both, and `error` is the vaguer of the two: an
    // `email_exists` collision arrives as `error=invalid_request`, which on its
    // own would land in the default branch and tell the player to try again
    // forever.
    const failure = read('error=invalid_request&error_code=email_exists')
    expect(failure?.title).toBe('That account is already in use.')
    expect(failure?.retryable).toBe(false)
  })

  it('falls back to error when there is no error_code', () => {
    expect(read('error=access_denied')?.title).toBe('Sign-in cancelled.')
  })

  it('does not blame the player for cancelling', () => {
    const failure = read('error_code=access_denied')
    expect(failure?.retryable).toBe(true)
    expect(failure?.detail).toContain('same name')
  })

  it('marks the unretryable failures as unretryable', () => {
    // The two that no amount of tapping will fix: a permanent collision, and a
    // misconfigured provider. Anything that says "try again" here is a lie.
    for (const code of ['email_exists', 'identity_already_exists', 'unexpected_failure']) {
      expect(read(`error_code=${code}`)?.retryable, code).toBe(false)
    }
    for (const code of ['access_denied', 'otp_expired', 'over_email_send_rate_limit']) {
      expect(read(`error_code=${code}`)?.retryable, code).toBe(true)
    }
  })

  it('turns a wrong client secret into something a player can read', () => {
    // The live shape of a bad Google secret, verbatim from the callback URL.
    const failure = read(
      'error=server_error&error_code=unexpected_failure&' +
        'error_description=Unable+to+exchange+external+code%3A+4%2F0A',
    )
    expect(failure?.title).toBe('Google sign-in is unavailable.')
    expect(failure?.retryable).toBe(false)
  })

  it('never puts the raw error_description in front of a player', () => {
    // It is written for whoever configured the project. "Unable to exchange
    // external code" is a wrong client secret; a player can do nothing with it,
    // and it names internals on a screen anyone can reach.
    const queries = [
      'error_code=unexpected_failure&error_description=Unable+to+exchange+external+code%3A+4%2F0A',
      'error_code=email_exists&error_description=A+user+with+this+email+address+has+already+been+registered',
      'error_code=something_new&error_description=Internal+database+error+at+auth.users',
    ]
    for (const query of queries) {
      const failure = read(query)
      const shown = `${failure?.title} ${failure?.detail}`
      expect(shown).not.toContain('exchange')
      expect(shown).not.toContain('database')
      expect(shown).not.toContain('auth.users')
      expect(shown).not.toContain('registered')
    }
  })

  it('still says something useful for a code it has never seen', () => {
    const failure = read('error_code=a_code_from_the_future')
    expect(failure?.title).toBeTruthy()
    expect(failure?.detail).toBeTruthy()
    expect(failure?.retryable).toBe(true)
  })

  it('ends every sentence it shows', () => {
    // These render as a heading and a paragraph, not as fragments.
    const codes = [
      'access_denied',
      'email_exists',
      'identity_already_exists',
      'otp_expired',
      'over_email_send_rate_limit',
      'unexpected_failure',
      'server_error',
      'unknown',
    ]
    for (const code of codes) {
      const failure = read(`error_code=${code}`)
      expect(failure?.title.endsWith('.'), code).toBe(true)
      expect(failure?.detail.endsWith('.'), code).toBe(true)
    }
  })
})
