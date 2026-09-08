import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { normaliseCode } from '@/features/rooms'

export const metadata: Metadata = {
  title: 'Join a room',
  description: 'Someone invited you to play word puzzles with them.',
}

/**
 * `/r/<CODE>` — the link the lobby shares.
 *
 * A redirect rather than a screen of its own, so the join flow has exactly one
 * implementation and the code lands in the boxes already filled in. Nothing is
 * looked up here: a non-member cannot read a room, and answering "does this code
 * exist?" for an unauthenticated visitor would turn the share URL into an oracle
 * for enumerating live rooms.
 *
 * A code that survives normalisation is passed on; anything else drops through
 * to an empty join screen rather than prefilling something wrong.
 */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const normalised = normaliseCode(decodeURIComponent(code))
  redirect(normalised ? `/join?code=${normalised}` : '/join')
}
