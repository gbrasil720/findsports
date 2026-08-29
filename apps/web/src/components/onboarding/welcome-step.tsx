import type { ComponentType, ReactNode, SVGAttributes } from 'react'

type IconProps = SVGAttributes<SVGSVGElement> & {
  size?: number | string
  color?: string
}

type Feature = {
  icon: ComponentType<IconProps>
  text: string
}

type Props = {
  eyebrow: string
  title: ReactNode
  subtitle: string
  features: Feature[]
}

export function WelcomeStep({ eyebrow, title, subtitle, features }: Props) {
  return (
    <div>
      <p className="onside-kicker onside-kicker-acid mb-3">{eyebrow}</p>
      <h1
        tabIndex={-1}
        className="onside-display mb-5 text-4xl text-[var(--onside-paper)] outline-none md:text-5xl"
      >
        {title}
      </h1>
      <p className="onside-text-muted-on-ink max-w-xl text-lg">{subtitle}</p>
      <div className="mt-8 grid gap-0 border-[rgb(241_238_230_/_18%)] border-t sm:grid-cols-3">
        {features.map(({ icon: Icon, text }, index) => (
          <div
            key={text}
            className={`flex items-start gap-3 px-0 py-4 text-sm text-[var(--onside-paper)] sm:px-4 sm:py-5 ${
              index > 0 ? 'border-[rgb(241_238_230_/_18%)] sm:border-l' : ''
            }`}
          >
            <Icon
              size={16}
              color="currentColor"
              className="mt-0.5 shrink-0 text-[var(--onside-acid)]"
              aria-hidden="true"
            />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
