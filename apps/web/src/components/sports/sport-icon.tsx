import type { ComponentType } from 'react'
import Basketball from 'reicon-react/icons/Basketball'
import Car from 'reicon-react/icons/Car'
import Flag from 'reicon-react/icons/Flag'
import Football from 'reicon-react/icons/Football'
import Lightbulb from 'reicon-react/icons/Lightbulb'
import Rugby from 'reicon-react/icons/Rugby'
import Volleyball from 'reicon-react/icons/Volleyball'

type IconProps = {
  size?: number
  color?: string
  className?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}

type SportPresentation = {
  filter: ComponentType<IconProps>
  onboarding: ComponentType<IconProps> | 'text'
  onboardingText?: string
}

const SPORT_PRESENTATIONS: Record<string, SportPresentation> = {
  futebol: { filter: Football, onboarding: Football },
  basquete: { filter: Basketball, onboarding: Basketball },
  volei: { filter: Volleyball, onboarding: Volleyball },
  'futebol-americano': { filter: Rugby, onboarding: Rugby },
  'formula-1': { filter: Flag, onboarding: Car },
  'mma-ufc': {
    filter: Lightbulb,
    onboarding: 'text',
    onboardingText: 'MMA'
  }
}

type Props = IconProps & {
  slug: string
  name: string
  presentation?: 'filter' | 'onboarding'
}

export function SportIcon({
  slug,
  name,
  presentation = 'filter',
  ...iconProps
}: Props) {
  const configured = SPORT_PRESENTATIONS[slug]
  const selected = configured?.[presentation]
  if (selected && selected !== 'text') {
    const Icon = selected
    return (
      <Icon
        {...iconProps}
        className={`${iconProps.className ?? ''}${presentation === 'onboarding' ? ' opacity-90' : ''}`}
      />
    )
  }

  return (
    <span
      className={iconProps.className}
      aria-hidden={iconProps['aria-hidden']}
      title={name}
    >
      {presentation === 'onboarding'
        ? (configured?.onboardingText ?? name.slice(0, 3).toUpperCase())
        : name.slice(0, 2).toUpperCase()}
    </span>
  )
}
