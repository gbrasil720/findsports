import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Logo } from '@/components/landing/logo'

interface AuthBrandPanelProps {
  variant: 'login' | 'signup'
  children: ReactNode
}

export function AuthBrandPanel({ variant, children }: AuthBrandPanelProps) {
  const blob1 =
    variant === 'login'
      ? 'pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-brand-orange/20 blur-3xl'
      : 'pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-brand-blue/20 blur-3xl'

  const blob2 =
    variant === 'login'
      ? 'pointer-events-none absolute -right-24 bottom-24 size-72 rounded-full bg-brand-blue/15 blur-3xl'
      : 'pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-brand-orange/15 blur-3xl'

  return (
    <aside className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-zinc-950 p-12 lg:flex">
      <div className={blob1} />
      <div className={blob2} />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #ffffff 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      <Link to="/" className="relative flex w-fit items-center gap-3">
        <Logo className="size-10" />
        <span className="font-bold font-heading text-white text-xl tracking-tight">
          FindSports
        </span>
      </Link>

      <div className="relative">{children}</div>

      <p className="relative text-xs text-zinc-600 uppercase tracking-widest">
        © 2026 FindSports · Brasil
      </p>
    </aside>
  )
}
