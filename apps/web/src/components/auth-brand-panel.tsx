import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { OnsideBrand, OnsideMark } from '@/components/brand/onside-brand'

interface AuthBrandPanelProps {
  variant: 'login' | 'signup'
  children: ReactNode
}

export function AuthBrandPanel({ variant, children }: AuthBrandPanelProps) {
  return (
    <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden border-[var(--onside-ink)] border-r bg-[var(--onside-ink)] p-12 text-[var(--onside-paper)] lg:flex xl:w-[44%]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #f1eee6 1px, transparent 1px)',
          backgroundSize: '22px 22px'
        }}
        aria-hidden="true"
      />
      <div
        className={`pointer-events-none absolute size-48 border border-[var(--onside-acid)] opacity-30 ${
          variant === 'login' ? '-top-8 -right-8' : '-bottom-8 -left-8'
        }`}
        aria-hidden="true"
      />
      <OnsideMark
        className={`pointer-events-none absolute opacity-[0.08] ${
          variant === 'login' ? 'right-8 bottom-24' : 'top-28 right-10'
        }`}
        size={160}
      />

      <Link
        to="/"
        className="relative w-fit"
        aria-label="Onside — página inicial"
      >
        <OnsideBrand onInk />
      </Link>

      <div className="relative max-w-[22rem]">{children}</div>

      <p className="onside-text-muted-on-ink relative font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.16em]">
        © 2026 Onside · Brasil
      </p>
    </aside>
  )
}
