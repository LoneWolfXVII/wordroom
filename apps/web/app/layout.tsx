import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/ui/app-shell'
import { Toaster } from '@/components/ui/toast'
import { RoomsProvider } from '@/features/rooms'
import { geist } from './fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wordroom',
  description: 'Play word puzzles with your friends. Unlimited puzzles, one room, one leaderboard.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F5F1EA',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.variable}>
      <body>
        <RoomsProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
        </RoomsProvider>
      </body>
    </html>
  )
}
