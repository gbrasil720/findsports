import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { ReactNode } from 'react'

type Accent = 'orange' | 'blue'

const ACCENT_TEXT: Record<Accent, string> = {
  orange: 'text-brand-orange',
  blue: 'text-brand-blue'
}

type Feature = {
  icon: IconSvgElement
  text: string
}

type Props = {
  eyebrow: string
  title: ReactNode
  subtitle: string
  features: Feature[]
  accent: Accent
}

export function WelcomeStep({
  eyebrow,
  title,
  subtitle,
  features,
  accent
}: Props) {
  return (
    <div>
      <p
        className={`text-xs font-bold uppercase tracking-[0.3em] ${ACCENT_TEXT[accent]} mb-3`}
      >
        {eyebrow}
      </p>
      <h1 className="font-heading text-4xl md:text-5xl font-bold leading-[1.05] tracking-tight mb-5">
        {title}
      </h1>
      <p className="text-white/70 text-lg max-w-xl">{subtitle}</p>
      <div className="grid sm:grid-cols-3 gap-3 mt-8">
        {features.map(({ icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-3 text-sm"
          >
            <HugeiconsIcon icon={icon} size={16} color="currentColor" strokeWidth={1.5} className={ACCENT_TEXT[accent]} />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
