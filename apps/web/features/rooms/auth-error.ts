/**
 * What a failed sign-in actually says.
 *
 * The provider and GoTrue both report a refusal by redirecting back with an
 * `error_code`, and the screen used to render one sentence for all of them:
 * "That sign-in did not complete." True, and useless — "you cancelled" and
 * "that Google account belongs to someone else" need different things from the
 * player, and the second one is not retryable however many times they try.
 *
 * `error_description` is deliberately never shown. It is written for whoever
 * configured the project, not for the player: "Unable to exchange external
 * code: 4/0A..." is a wrong client secret, which is nothing a player can act on.
 */

export interface AuthFailure {
  /** The heading. A statement of what happened, not an apology. */
  title: string
  /** What it means for them, and what to do about it if anything. */
  detail: string
  /** False when trying again cannot possibly help. */
  retryable: boolean
}

/**
 * Codes arrive in `error_code`, older ones in `error`. Both are checked, most
 * specific first, because `invalid_request` accompanies several of these and
 * says the least of any of them.
 */
export function readAuthFailure(params: URLSearchParams): AuthFailure | null {
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null

  switch (code) {
    // The player closed Google's window, or pressed cancel on its consent
    // screen. Not a fault, and the wording should not imply one.
    case 'access_denied':
      return {
        title: 'Sign-in cancelled.',
        detail: 'You are still playing as a guest, in the same room, under the same name.',
        retryable: true,
      }

    // `linkIdentity` onto an account whose email already belongs to another
    // user. Retrying is guaranteed to fail: the collision is permanent until
    // one side changes, and this seat cannot be merged into the other account.
    case 'email_exists':
    case 'identity_already_exists':
      return {
        title: 'That account is already in use.',
        detail:
          'Another player has already signed in with it. Use a different Google account, ' +
          'or carry on as a guest on this device.',
        retryable: false,
      }

    // Magic links are single-use and short-lived, and a mail client that
    // prefetches links burns one before the player ever taps it.
    case 'otp_expired':
      return {
        title: 'That link has expired.',
        detail: 'Links last one hour and work once. Ask for a new one and open it straight away.',
        retryable: true,
      }

    case 'over_email_send_rate_limit':
      return {
        title: 'Too many links, too quickly.',
        detail: 'Wait a few minutes before asking for another one.',
        retryable: true,
      }

    // GoTrue could not complete the exchange with the provider. In practice
    // this is the project's own OAuth configuration — a wrong client secret
    // reaches the player as exactly this. Retrying will not fix it, and saying
    // "try again" would send them round the loop indefinitely.
    case 'unexpected_failure':
    case 'server_error':
      return {
        title: 'Google sign-in is unavailable.',
        detail: 'This is a problem on our side, not yours. Your room and your name are safe.',
        retryable: false,
      }

    default:
      return {
        title: 'That sign-in did not complete.',
        detail: 'Your room and your name are unchanged. You can carry on as a guest.',
        retryable: true,
      }
  }
}
