import { CallIcon, MapPinIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { GoogleMap } from '@/components/app/google-map'

import { formatStoredPhone } from '@/utils/format-phone'

type Bar = {
  id: string
  name: string
  address: string
  neighborhood: string
  city: string
  phone?: string | null
  latitude: string
  longitude: string
}

type Props = {
  bar: Bar
  onDirections: () => void
}

export function BarInfoSidebar({ bar, onDirections }: Props) {
  return (
    <aside className="space-y-6">
      <section className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
        <h3 className="font-heading text-lg font-bold mb-4">Informações</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3 text-zinc-700">
            <HugeiconsIcon
              icon={MapPinIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
              className="text-zinc-400 mt-0.5 shrink-0"
            />
            {bar.address}, {bar.neighborhood}, {bar.city}
          </li>
          {bar.phone && (
            <li className="flex items-center gap-3 text-zinc-700">
              <HugeiconsIcon
                icon={CallIcon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
                className="text-zinc-400 shrink-0"
              />
              {formatStoredPhone(bar.phone)}
            </li>
          )}
        </ul>
      </section>

      <section className="bg-white rounded-2xl ring-1 ring-black/5 p-5">
        <h3 className="font-heading text-lg font-bold mb-3 flex items-center gap-2">
          <HugeiconsIcon
            icon={MapPinIcon}
            size={16}
            color="currentColor"
            strokeWidth={1.5}
            className="text-brand-orange"
          />{' '}
          Localização
        </h3>
        <div className="relative h-44 rounded-xl overflow-hidden bg-zinc-100">
          <GoogleMap
            center={{
              lat: parseFloat(bar.latitude),
              lng: parseFloat(bar.longitude)
            }}
            bars={[
              {
                id: bar.id,
                name: bar.name,
                lat: parseFloat(bar.latitude),
                lng: parseFloat(bar.longitude),
                accent: 'orange',
                occupancy: 0
              }
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onDirections}
          className="w-full mt-3 bg-black text-white text-xs font-bold py-2.5 rounded-full hover:bg-brand-orange transition-colors"
        >
          Como chegar
        </button>
      </section>
    </aside>
  )
}
