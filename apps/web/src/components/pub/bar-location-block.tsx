import Location from 'reicon-react/icons/Location'
import Route from 'reicon-react/icons/Route'
import { OnsideMap } from '@/components/app/onside-map'
import { env } from '@/lib/env'

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
 * O mapa reaproveita o `OnsideMap` do dashboard em vez de uma imagem estática:
 * a biblioteca já está no bundle das telas com mapa, e o mesmo arquivo de
 * tiles serve os dois.
 *
 * Sem arquivo de tiles configurado, o mapa não é renderizado — e não vira a
 * caixa "Mapa indisponível / tentar novamente" que o `OnsideMap` mostra por
 * padrão. Ali aquele aviso é correto: o mapa é o conteúdo da tela. Aqui ele é
 * apoio, e um botão de repetir que não tem como funcionar só rouba a atenção
 * de quem precisava do endereço e da rota — que continuam inteiros.
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
  const showMap =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Boolean(env.VITE_MAP_TILES_URL)

  return (
    <section className="onside-panel p-5 md:p-6">
      <h2 className="onside-display mb-4 text-2xl">Como chegar</h2>

      <div
        className={`grid gap-4 ${
          showMap ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]' : ''
        }`}
      >
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

        {showMap && (
          <div className="onside-map-frame h-[180px]" aria-hidden="true">
            <OnsideMap
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
