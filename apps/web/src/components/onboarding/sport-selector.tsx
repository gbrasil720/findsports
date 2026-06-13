import { MedalFirstPlaceIcon, Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'

type Sport = {
  id: string
  name: string
  slug: string
}

type Props = {
  sports: Sport[]
  selectedIds: string[]
  onToggle: (id: string) => void
  isLoading: boolean
  iconMap?: Record<string, IconSvgElement>
}

export function SportSelector({
  sports,
  selectedIds,
  onToggle,
  isLoading,
  iconMap = {}
}: Props) {
  if (isLoading) {
    return <div className="text-white/40 text-sm">Carregando esportes...</div>
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {sports.map((s) => {
        const on = selectedIds.includes(s.id)
        const icon = iconMap[s.slug] ?? MedalFirstPlaceIcon
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`relative rounded-2xl p-5 text-left transition-all ring-1 ${
              on
                ? 'bg-brand-orange text-white ring-transparent scale-[1.02]'
                : 'bg-white/5 ring-white/10 hover:bg-white/10'
            }`}
          >
            <HugeiconsIcon icon={icon} size={24} color="currentColor" strokeWidth={1.5} className="mb-3 opacity-90" />
            <div className="font-heading text-lg font-bold leading-none">
              {s.name}
            </div>
            {on && <HugeiconsIcon icon={Tick01Icon} size={16} color="currentColor" strokeWidth={1.5} className="absolute top-3 right-3" />}
          </button>
        )
      })}
    </div>
  )
}
