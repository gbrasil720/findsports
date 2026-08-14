import Call from 'reicon-react/icons/Call'
import Location from 'reicon-react/icons/Location'
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
    <aside className="space-y-6 lg:sticky lg:top-[calc(var(--banner-h,0px)+var(--onside-header-h)+16px)]">
      <section className="onside-panel p-5">
        <h3 className="onside-display mb-4 text-xl">Informações</h3>
        <ul className="space-y-3 text-sm">
          <li className="flex items-start gap-3 text-[var(--onside-ink)]">
            <Location
              size={16}
              color="currentColor"
              className="mt-0.5 shrink-0 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
            <span className="min-w-0 break-words">
              {bar.address}, {bar.neighborhood}, {bar.city}
            </span>
          </li>
          {bar.phone && (
            <li className="flex items-center gap-3 text-[var(--onside-ink)]">
              <Call
                size={16}
                color="currentColor"
                className="shrink-0 text-[var(--onside-muted)]"
                aria-hidden="true"
              />
              <span className="min-w-0 break-all">
                {formatStoredPhone(bar.phone)}
              </span>
            </li>
          )}
        </ul>
      </section>

      <section className="onside-panel p-5">
        <h3 className="onside-display mb-3 flex items-center gap-2 text-xl">
          <Location
            size={16}
            color="currentColor"
            className="text-[var(--onside-live)]"
            aria-hidden="true"
          />
          Localização
        </h3>
        <div className="onside-map-frame relative h-44">
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
                accent: 'live'
              }
            ]}
          />
        </div>
        <button
          type="button"
          onClick={onDirections}
          className="onside-btn onside-btn-ink onside-btn-full mt-3 min-h-11"
        >
          Como chegar
        </button>
      </section>
    </aside>
  )
}
