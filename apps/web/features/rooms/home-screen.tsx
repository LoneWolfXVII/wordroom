'use client'

import { motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Icon, Screen, ScreenFooter, Sheet } from '@/components/ui'
import { ForwardIcon, JoinIcon, LockIcon, PlusIcon, RulesIcon } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { DemoTiles } from './demo-tiles'
import { type ResumeRoom, resolveResumeRoom, roomMark } from './resume-room'
import { RulesSheet } from './rules-sheet'
import { useSession } from './session'
import { SignInPanel } from './sign-in-panel'
import { type ActiveRoom, getActiveRoom, setActiveRoom } from './storage'
import { useActiveSeat, useMyRooms } from './use-rooms'

/**
 * The home screen.
 *
 * `.hero` and `.foot` both take an auto margin, which is what centres the hero
 * in whatever space the footer leaves — the prototype's layout, and the reason
 * this fits 375x667 without a scrollbar at any of the footer heights.
 */
export function HomeScreen() {
  const [rulesOpen, setRulesOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const { seat, isLoading, hasAnySeat } = useActiveSeat()
  const rooms = useMyRooms()
  const { status, isAnonymous } = useSession()

  /*
   * The remembered room, read on mount rather than during render: this route is
   * prerendered, so there is no `localStorage` on the server, and a card in the
   * client's first render that is absent from the HTML is a hydration mismatch.
   * Mount is still far earlier than the queries — it does not wait for a
   * network answer, or even for one to be asked for.
   *
   * A layout effect would guarantee the card is in the first frame after a
   * client-side navigation back here. Measured over three round trips through
   * /create, React already flushes this one before the paint, so the guarantee
   * bought nothing and the plain effect stays.
   */
  const [hint, setHint] = useState<ActiveRoom | null>(null)
  useEffect(() => {
    setHint(getActiveRoom())
  }, [])

  const resume = resolveResumeRoom({ seat, hint, isLoading })
  const others = rooms.filter((room) => room.id !== resume?.id)

  // Not while seats are still loading: whether this links or signs in depends
  // on whether there are any.
  const showSignIn = status === 'ready' && isAnonymous && !isLoading

  return (
    <Screen>
      <div className="mt-auto mb-7">
        <div className="text-[36px] leading-none font-semibold tracking-[-0.03em]">Wordroom</div>
        <DemoTiles />
        <p className="m-0 max-w-[30ch] text-[17px] leading-[1.4] text-ink-2">
          Unlimited word puzzles. Same words as your friends, whenever you want to play.
        </p>
      </div>

      <ScreenFooter>
        {/*
         * Not in the prototype, which always starts from a blank slate. A player
         * who already holds a seat needs one tap back into it, and putting that
         * anywhere else would make the common case the slow one.
         */}
        {resume ? <ResumeCard room={resume} /> : null}

        {/*
         * Every other room this account sits in. Quieter than the resume card,
         * and capped so a long list scrolls inside itself rather than pushing
         * the hero off a 375x667 screen.
         */}
        {others.length > 0 ? (
          <ul className="mb-1.5 grid max-h-[118px] min-w-0 gap-1.5 overflow-y-auto">
            {others.map((room) => (
              <li key={room.id} className="min-w-0">
                <OtherRoomLink room={room} />
              </li>
            ))}
          </ul>
        ) : null}

        {/*
         * Create and join share a row. They are the two ways into a room and
         * neither follows the other, so stacked they read as a sequence — and
         * pairing them buys back the height the card above costs, which is what
         * keeps the hero from being squeezed at 375x667. Colour carries the
         * hierarchy the full width used to: with no seat, create is still the
         * only accent button on the screen.
         */}
        <div className="grid grid-cols-2 gap-2.5">
          <Button asChild variant={resume ? 'default' : 'primary'}>
            <Link href="/create">
              <Icon icon={PlusIcon} size={18} />
              Create a room
            </Link>
          </Button>
          <Button asChild>
            <Link href="/join">
              <Icon icon={JoinIcon} size={18} />
              Join with a code
            </Link>
          </Button>
        </div>
        {/*
         * Sign in sits beside the rules for a guest, so a player on a new phone
         * is never locked out of their rooms. It is never the first thing asked
         * of anyone: a new player can ignore it, and the one prompt stays where
         * it was, after their first result.
         */}
        <div className={cn('grid gap-2.5', showSignIn && 'grid-cols-2')}>
          <Button variant="ghost" onClick={() => setRulesOpen(true)}>
            <Icon icon={RulesIcon} size={18} />
            How to play
          </Button>
          {showSignIn ? (
            <Button variant="ghost" onClick={() => setSignInOpen(true)}>
              <Icon icon={LockIcon} size={18} />
              Sign in
            </Button>
          ) : null}
        </div>
      </ScreenFooter>

      <RulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />

      {/*
       * A guest holding a seat *links*, so that seat comes with them. One holding
       * none *signs in*, which is the only way to reach an account made on
       * another device. See identity.ts.
       */}
      <Sheet
        open={signInOpen}
        onOpenChange={setSignInOpen}
        title={hasAnySeat ? 'Keep your rooms' : 'Sign in'}
        description={
          hasAnySeat
            ? 'Sign in so your rooms and scores follow you to any device.'
            : 'Already played on another device? Sign in to get your rooms back.'
        }
      >
        <SignInPanel
          mode={hasAnySeat ? 'link' : 'sign-in'}
          returnPath="/"
          onEmailSent={() => setSignInOpen(false)}
        />
      </Sheet>
    </Screen>
  )
}

/**
 * The way back into the room you are already in.
 *
 * This was a fourth full-width button reading "Back to wed", and a player could
 * not tell that "wed" was their room's name rather than a stray word — a stack
 * of identical pills gives a name nothing to be a name *of*. So it stops being
 * a pill: a card, at the card radius, carrying a tile with the room's initial,
 * the name on its own line, and "Your room" underneath to say what the line
 * above it is. The tile is deliberately the game's tile shape — the room gets a
 * mark the way a player gets an avatar.
 *
 * No back chevron: going to the room you are in is not a retreat. The forward
 * chevron says where the tap leads instead.
 *
 * The room's member count would earn its place in the caption, but `Room` — and
 * the `room_details` view behind it — does not carry one, and a second query for
 * it would put the card back on the critical path this change exists to remove.
 */
function ResumeCard({ room }: { room: ResumeRoom }) {
  const reduced = useReducedMotion()

  return (
    <motion.div
      // Painted from cache this is already on screen, but a player whose cache
      // predates the stored name still meets it arriving from the query. Fade,
      // on --duration-state, so that path is not a pop.
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
      // `min-w-0` is not decoration. `ScreenFooter` is a grid whose one track is
      // `auto`, and an auto track is floored by its items' min-content — which
      // for a nowrap name is the whole name. Without it a 40-character room
      // name (`ROOM_NAME_MAX`) stretched the track to 476px inside a 375px
      // screen, `truncate` never engaged, and `overflow-hidden` on the shell
      // quietly clipped the chevron off. Measured, not guessed.
      //
      // `mb-1.5` is half a gap more than the grid's, so the card reads as its
      // own thing rather than the top of the stack.
      className="mb-1.5 min-w-0"
    >
      <Link
        href="/lobby"
        aria-label={`Open ${room.name}, your room`}
        className={cn(
          'flex items-center gap-3 rounded-lg border border-accent bg-accent p-3',
          'text-on-accent shadow-sm',
          '[transition:transform_var(--duration-micro),background-color_var(--duration-micro)]',
          'active:scale-[0.98] active:bg-accent-pressed',
          // The global focus ring is the accent, which is this card's own
          // background. Inside, in the ink that sits on it.
          'focus-visible:-outline-offset-4 focus-visible:outline-on-accent',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-10 flex-none place-items-center rounded-sm',
            'bg-on-accent/15 text-[18px] font-semibold',
          )}
        >
          {roomMark(room.name)}
        </span>

        {/* min-w-0 is what lets the name truncate instead of pushing the
            chevron off a 375px screen. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] leading-tight font-medium">{room.name}</span>
          {/* /80 rather than /70: at 70% this lands at 4.48:1 on the accent,
              which is under AA for 13px text. */}
          <span className="mt-0.5 block text-[13px] text-on-accent/80">Your room</span>
        </span>

        <Icon icon={ForwardIcon} size={18} className="text-on-accent/80" />
      </Link>
    </motion.div>
  )
}

/**
 * A room other than the one the resume card opens. Tapping it makes it the
 * active room first, so the lobby and the game open on it — they both pick the
 * stored room among the account's seats.
 */
function OtherRoomLink({ room }: { room: { id: string; name: string } }) {
  return (
    <Link
      href="/lobby"
      onClick={() => setActiveRoom({ id: room.id, name: room.name })}
      aria-label={`Open ${room.name}`}
      className={cn(
        'flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2',
        '[transition:transform_var(--duration-micro),background-color_var(--duration-micro)]',
        'active:scale-[0.98] active:bg-surface-2',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-8 flex-none place-items-center rounded-sm bg-surface-2 text-[15px] font-semibold"
      >
        {roomMark(room.name)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{room.name}</span>
      <Icon icon={ForwardIcon} size={18} className="text-ink-2" />
    </Link>
  )
}
