import type { Metadata } from 'next'
import { DesignSystem } from './design-system'

export const metadata: Metadata = {
  title: 'Design system · Wordroom',
  robots: { index: false, follow: false },
}

/**
 * Storybook-lite. Every token and every component state on one scrollable page,
 * inside the real 520px shell so nothing is demoed at a width the product never
 * has. Resize past 820px to see the framed layout and sheets-as-right-panel.
 */
export default function DesignSystemPage() {
  return <DesignSystem />
}
