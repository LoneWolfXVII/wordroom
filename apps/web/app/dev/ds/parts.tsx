'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { cn } from '@/lib/cn'

/** A titled block of the page. */
export function Section({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="border-line border-t pt-6 pb-8">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{title}</h2>
      {note ? <p className="mt-1 text-[13px] leading-[1.45] text-muted">{note}</p> : null}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  )
}

/** One labelled specimen. `state` names the state being shown, if any. */
export function Specimen({
  label,
  state,
  children,
  className,
}: {
  label: string
  state?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-medium text-ink-2">{label}</span>
        {state ? (
          <span className="rounded-[4px] bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted">
            {state}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/**
 * Reads a custom property off :root so this page can never drift from
 * globals.css. Returns an empty string until it has run on the client.
 */
export function useTokenValues(names: readonly string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    const computed = getComputedStyle(document.documentElement)
    const next: Record<string, string> = {}
    for (const name of names) {
      next[name] = computed.getPropertyValue(name).trim()
    }
    setValues(next)
    // The token names are a module-level constant per caller.
  }, [names])

  return values
}

export function TokenRow({
  name,
  value,
  usage,
  preview,
}: {
  name: string
  value: string
  usage: string
  preview: ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      {preview}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{name}</div>
        <div className="text-[12px] text-muted">{usage}</div>
      </div>
      <code className="tabular text-[12px] text-ink-2">{value || '—'}</code>
    </div>
  )
}
