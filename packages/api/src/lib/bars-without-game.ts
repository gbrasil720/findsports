import { db, sql } from '@findsports_oficial/db'
import { brasiliaDayStart } from '@findsports_oficial/db/event-window'

import { declaredAmenityIds } from './amenities'
import {
  normalizeOpeningHours,
  type OpeningHours,
  openingStatus
} from './opening-hours'
import { createTtlCache } from './ttl-cache'

/*
 * "Sem jogo marcado" do Explorar do web (dono, 07/11/2026): os bares no ar
 * perto do ponto que não publicaram jogo no dia escolhido, do mais perto ao
 * mais longe, abaixo dos que passam o jogo. Primo do `nearbyWithoutGames` do
 * app, que olha qualquer jogo por acabar; aqui a tela é de um dia, então o
 * bar com jogo só amanhã aparece hoje como sem jogo. Aberta, como a régua.
 */

/** A lista é um complemento: os mais perto bastam. */
const LIMIT = 20

export type WithoutGameInput = {
  lat: number
  lng: number
  radiusKm: number
  /** `AAAA-MM-DD`, dia de Brasília. */
  day: string
}

type Row = {
  id: string
  name: string
  neighborhood: string
  photo_url: string | null
  latitude: string
  longitude: string
  amenities: number[] | null
  opening_hours: OpeningHours | null
  distance_km: number
}

const cache = createTtlCache<Row[]>({
  ttlMs: 60_000,
  maxEntries: 200
})

function readRows(input: WithoutGameInput) {
  const start = brasiliaDayStart(input.day).toISOString()
  const origin = sql`ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography`
  return db
    .execute<Row>(sql`
      SELECT b.id, b.name, b.neighborhood, b.photo_url, b.latitude,
        b.longitude, b.amenities, b.opening_hours,
        ST_Distance(b.geo, ${origin}) / 1000 AS distance_km
      FROM bar b
      WHERE b.is_active
        AND ST_DWithin(b.geo, ${origin}, ${input.radiusKm * 1000})
        AND NOT EXISTS (
          SELECT 1 FROM event e
          WHERE e.bar_id = b.id
            AND e.published_at IS NOT NULL
            AND e.starts_at >= ${start}::timestamp
            AND e.starts_at < ${start}::timestamp + interval '1 day'
        )
      ORDER BY distance_km, b.id
      LIMIT ${LIMIT}
    `)
    .then((result) => result.rows)
}

export async function readBarsWithoutGame(
  input: WithoutGameInput,
  now = new Date()
) {
  const key = `${input.day}:${input.radiusKm}:${input.lat.toFixed(3)}:${input.lng.toFixed(3)}`
  const rows = await cache.get(key, () => readRows(input))
  // Aberto ou fechado é do minuto: fica fora do cache.
  return rows.map((row) => ({
    barId: row.id,
    name: row.name,
    neighborhood: row.neighborhood,
    photoUrl: row.photo_url,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distanceKm: Number(row.distance_km),
    amenities: declaredAmenityIds(row.amenities ?? []),
    opening: openingStatus(normalizeOpeningHours(row.opening_hours), now)
  }))
}
