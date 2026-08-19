import Location from 'reicon-react/icons/Location'
import Route from 'reicon-react/icons/Route'
import { GoogleMap } from '@/components/app/google-map'

type Props = {
  barId: string
  name: string
  address: string
  neighborhood: string
  city: string
  latitude: string
  longitude: string
  plan: string | null
  directionsUrl: string | null
  onDirections: () => void
}

/**
 * Onde o bar fica.
 *
 * O endereço aparecia três vezes na página — em três cartões do topo e de novo
 * na lateral — e nenhuma delas mostrava o lugar. Aqui ele aparece uma vez, ao
 * lado de um mapa, que é o que responde "isso é longe de mim?".
 *
 * O mapa reaproveita o `GoogleMap` do dashboard em vez de uma imagem da Static
 * Maps API: a biblioteca já está no bundle e a chave já está configurada para
 * ela, enquanto a Static Maps é outro produto do console — sem ele habilitado,
 * a imagem volta como erro silencioso. Interação fica desligada; o clique leva
 * para a rota.
 */
export function BarLocationBlock({
  barId,
  name,
  address,
  neighborhood,
  city,
  latitude,
  longitude,
  plan,
  directionsUrl,
  onDirections
}: Props) {
  const lat = Number.parseFloat(latitude)
  const lng = Number.parseFloat(longitude)
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng)

  return (
    <section className="onside-panel p-5 md:p-6">
      <h2 className="onside-display mb-4 text-2xl">Como chegar</h2>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex flex-col justify-between gap-4">
          <p className="flex items-start gap-2 text-[var(--onside-ink)] text-sm">
            <Location
              size={16}
              color="currentColor"
              className="mt-0.5 shrink-0 text-[var(--onside-muted)]"
              aria-hidden="true"
            />
            <span>
              {address}
              <br />
              {neighborhood}, {city}
            </span>
          </p>

          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onDirections}
              className="onside-btn onside-btn-ink min-h-12 w-full justify-center text-sm sm:w-auto sm:self-start sm:px-6"
            >
              <Route size={16} color="currentColor" aria-hidden="true" />
              <span className="ml-2">Traçar rota</span>
            </a>
          )}
        </div>

        {hasCoordinates && (
          <div className="onside-map-frame h-[180px]" aria-hidden="true">
            <GoogleMap
              bars={[
                {
                  id: barId,
                  name,
                  lat,
                  lng,
                  accent: plan === 'pro' || plan === 'elite' ? 'acid' : 'ink'
                }
              ]}
              center={{ lat, lng }}
            />
          </div>
        )}
      </div>
    </section>
  )
}
