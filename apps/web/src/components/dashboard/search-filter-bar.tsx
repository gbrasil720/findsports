import { Cancel01Icon, SearchingIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

const RADIUS_OPTIONS = [
  { km: 1, label: 'a pé' },
  { km: 3, label: 'perto' },
  { km: 5, label: 'no bairro' },
  { km: 10, label: 'explorar' }
] as const

type ActiveFilter = { label: string; clear: () => void }
type Sport = { id: string; name: string; slug: string }

type Props = {
  championship: string
  onChampionshipChange: (v: string) => void
  sportId: string | undefined
  onSportChange: (v: string | undefined) => void
  radiusKm: 1 | 3 | 5 | 10
  onRadiusChange: (v: 1 | 3 | 5 | 10) => void
  sports: Sport[]
  activeFilters: ActiveFilter[]
  onReset: () => void
}

// Emojis por slug como fallback visual rápido
const SPORT_EMOJI: Record<string, string> = {
  futebol: '⚽',
  basquete: '🏀',
  volei: '🏐',
  'futebol-americano': '🏈',
  'formula-1': '🏎️',
  'mma-ufc': '🥊'
}

export function SearchFilterBar({
  championship,
  onChampionshipChange,
  sportId,
  onSportChange,
  radiusKm,
  onRadiusChange,
  sports,
  activeFilters,
  onReset
}: Props) {
  const [focused, setFocused] = useState(false)

  return (
    <div className="sticky top-16 z-20 -mx-4 px-4 md:mx-0 md:px-0 mb-6">
      <div className="bg-white rounded-2xl ring-1 ring-black/5 shadow-sm overflow-hidden">
        {/* Campo de busca */}
        <div
          className={`flex items-center gap-3 px-4 py-3 border-b transition-colors ${focused ? 'border-brand-orange/30 bg-orange-50/30' : 'border-zinc-100'}`}
        >
          <HugeiconsIcon
            icon={SearchingIcon}
            size={18}
            color="currentColor"
            strokeWidth={1.5}
            className={`shrink-0 transition-colors ${focused ? 'text-brand-orange' : 'text-zinc-400'}`}
          />
          <input
            value={championship}
            onChange={(e) => onChampionshipChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Buscar bar, time ou campeonato..."
            className="flex-1 bg-transparent text-sm font-medium text-zinc-800 placeholder-zinc-400 outline-none"
          />
          {championship && (
            <button
              type="button"
              onClick={() => onChampionshipChange('')}
              className="p-1.5 rounded-full hover:bg-zinc-100 transition-colors shrink-0"
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                size={13}
                color="currentColor"
                strokeWidth={1.5}
                className="text-zinc-400"
              />
            </button>
          )}
        </div>

        {/* Esportes como chips */}
        <div className="px-4 py-3 border-b border-zinc-100">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onSportChange(undefined)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                !sportId
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Todos
            </button>
            {sports.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  onSportChange(sportId === s.id ? undefined : s.id)
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  sportId === s.id
                    ? 'bg-brand-orange text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <span>{SPORT_EMOJI[s.slug] ?? '🏆'}</span>
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* Raio */}
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 whitespace-nowrap shrink-0">
            Raio
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {RADIUS_OPTIONS.map(({ km, label }) => (
              <button
                key={km}
                type="button"
                onClick={() => onRadiusChange(km)}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  radiusKm === km
                    ? 'bg-brand-orange text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {km} km
                <span
                  className={`${radiusKm === km ? 'text-white/70' : 'text-zinc-400'} hidden sm:inline`}
                >
                  · {label}
                </span>
              </button>
            ))}
          </div>

          {/* Limpar tudo */}
          {activeFilters.length > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="ml-auto text-[11px] font-bold text-zinc-400 hover:text-brand-orange transition-colors whitespace-nowrap"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
