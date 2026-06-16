import { Link } from '@tanstack/react-router'
import { Logo } from '@/components/landing/logo'

type Accent = 'orange' | 'blue'

const ACCENT_DOT: Record<Accent, string> = {
  orange: 'bg-brand-orange',
  blue: 'bg-brand-blue'
}

type Props = {
  label: string
  accent: Accent
  mb?: string
}

export function OnboardingHeader({ label, accent, mb = 'mb-10' }: Props) {
  return (
    <div className={`flex items-center justify-between ${mb}`}>
      <Link to="/" className="inline-flex items-center gap-2.5">
        <Logo className="size-9" />
        <span className="font-heading text-xl font-bold tracking-tight">
          FindSports
        </span>
      </Link>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">
        <span className={`size-2 rounded-full ${ACCENT_DOT[accent]}`} />
        {label}
      </div>
    </div>
  )
}
