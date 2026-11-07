import type { RadiusKm } from '@/domain/discovery'

const RADIUS_LABELS: Record<number, string> = {
  1: 'a pé',
  3: 'bem perto',
  5: 'no bairro',
  10: 'explorar mais',
  25: 'a cidade',
  50: 'a região'
}

type Props = {
  value: RadiusKm
  options: readonly RadiusKm[]
  onChange: (km: RadiusKm) => void
}

export function RadiusSelector({ value, options, onChange }: Props) {
  return (
    <fieldset className="ob-radius">
      <legend className="sr-only">Raio de busca em quilômetros</legend>
      {options.map((km) => (
        <button
          key={km}
          type="button"
          aria-pressed={value === km}
          onClick={() => onChange(km)}
        >
          <b>{km} km</b>
          <span>{RADIUS_LABELS[km] ?? ''}</span>
        </button>
      ))}
    </fieldset>
  )
}
