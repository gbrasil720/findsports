import { MapPinIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const RADIUS_LABELS: Record<number, string> = {
  1: 'a pé',
  3: 'bem perto',
  5: 'no bairro',
  10: 'explorar mais'
}

type Props = {
  value: number
  options: readonly number[]
  onChange: (km: number) => void
}

export function RadiusSelector({ value, options, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {options.map((km) => {
        const on = value === km
        return (
          <button
            key={km}
            type="button"
            onClick={() => onChange(km)}
            className={`relative rounded-2xl p-5 text-left transition-all ring-1 ${
              on
                ? 'bg-brand-orange text-white ring-transparent'
                : 'bg-white/5 ring-white/10 hover:bg-white/10'
            }`}
          >
            <HugeiconsIcon
              icon={MapPinIcon}
              size={20}
              color="currentColor"
              strokeWidth={1.5}
              className="mb-3 opacity-80"
            />
            <div className="font-heading text-2xl font-bold leading-none">
              {km} km
            </div>
            <div className="text-xs mt-1 opacity-80">
              {RADIUS_LABELS[km] ?? ''}
            </div>
          </button>
        )
      })}
    </div>
  )
}
