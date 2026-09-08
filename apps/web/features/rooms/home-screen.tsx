'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Icon, Screen, ScreenFooter } from '@/components/ui'
import { BackIcon } from '@/components/ui/icons'
import { DemoTiles } from './demo-tiles'
import { RulesSheet } from './rules-sheet'
import { useActiveSeat } from './use-rooms'

/**
 * The home screen.
 *
 * `.hero` and `.foot` both take an auto margin, which is what centres the hero
 * in whatever space the footer leaves — the prototype's layout, and the reason
 * this fits 375x667 without a scrollbar at any of the three footer heights.
 */
export function HomeScreen() {
  const [rulesOpen, setRulesOpen] = useState(false)
  const { seat } = useActiveSeat()

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
        {seat ? (
          <Button asChild variant="primary">
            {/*
             * The icon is not decoration. This sits above two buttons that are
             * also a room and also a tap away, and without it the three read as
             * one list of equal choices - the arrow is what says this one is a
             * return rather than a start.
             */}
            <Link href="/lobby">
              <Icon icon={BackIcon} size={18} />
              Back to {seat.room.name}
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={seat ? 'default' : 'primary'}>
          <Link href="/create">Create a room</Link>
        </Button>
        <Button asChild>
          <Link href="/join">Join with a code</Link>
        </Button>
        <Button variant="ghost" onClick={() => setRulesOpen(true)}>
          How to play
        </Button>
      </ScreenFooter>

      <RulesSheet open={rulesOpen} onOpenChange={setRulesOpen} />
    </Screen>
  )
}
