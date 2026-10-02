import { randomUUID } from 'node:crypto'
import { type APIRequestContext, expect, type Page } from '@playwright/test'
import { BASE_URL } from '../env'
import { signIn } from './auth'
import { insert, query } from './db'
import { createPub, type PubOptions, type TestPub } from './pubs'
import { createUser, type TestUser, type UserOptions } from './users'

/**
 * Blocos do app do torcedor (WEB-178): lugar no mapa, jogos, preferências e
 * chamadas tRPC como o próprio navegador faria.
 */

export type Spot = { latitude: number; longitude: number }

/**
 * Ponto aleatório no interior do Brasil, longe do centro de São Paulo onde a
 * fundação e os outros testes criam bares. A busca é por raio (até 10 km, 15
 * na recomendação), então dois testes paralelos nunca se enxergam.
 */
export function uniqueSpot(): Spot {
  return {
    latitude: -30 + Math.random() * 20,
    longitude: -60 + Math.random() * 15
  }
}

/** `km` ao norte de `spot` (1 grau de latitude ≈ 111 km). */
export function north(spot: Spot, km: number): Spot {
  return { latitude: spot.latitude + km / 111, longitude: spot.longitude }
}

/**
 * Torcedor novo, logado e parado em `spot`. Os testes daqui mudam favoritos,
 * preferências e reservas, então nenhum usa a sessão compartilhada.
 */
export async function signInFanAt(
  page: Page,
  spot: Spot,
  options: Omit<UserOptions, 'role'> = {}
): Promise<TestUser> {
  const fan = await createUser({ ...options, role: 'fan' })
  await signIn(page, fan)
  await page.context().setGeolocation(spot)
  return fan
}

/** Bar ativo em `spot`, com nome único (o card na lista é "Ver <nome>"). */
export async function pubAt(
  spot: Spot,
  options: PubOptions = {}
): Promise<TestPub & { name: string }> {
  const name = `Bar ${randomUUID().slice(0, 8)}`
  const pub = await createPub({
    ...options,
    bar: { ...options.bar, name, ...spot }
  })
  return { ...pub, name }
}

export const hours = (n: number) => new Date(Date.now() + n * 3_600_000)
export const days = (n: number) => hours(n * 24)

export async function sportId(slug: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    'SELECT id FROM sport WHERE slug = $1',
    [slug]
  )
  if (!row) throw new Error(`esporte ${slug} não semeado`)
  return row.id
}

export async function team(
  slug: string
): Promise<{ id: string; name: string; sport_id: string }> {
  const [row] = await query<{ id: string; name: string; sport_id: string }>(
    'SELECT id, name, sport_id FROM team WHERE slug = $1',
    [slug]
  )
  if (!row) throw new Error(`time ${slug} não semeado`)
  return row
}

type EventOptions = {
  barId: string
  startsAt: Date
  endsAt?: Date
  sport?: string
  championship?: string
  /** Texto do confronto; também é o nome do jogo na tela quando não há times. */
  freeText?: string
  teamIds?: string[]
}

export async function createEvent(options: EventOptions): Promise<string> {
  const id = randomUUID()
  await insert('event', {
    id,
    bar_id: options.barId,
    sport_id: await sportId(options.sport ?? 'futebol'),
    championship: options.championship ?? 'Campeonato E2E',
    starts_at: options.startsAt,
    ends_at: options.endsAt ?? null,
    participant_free_text: options.freeText ?? null
  })
  for (const teamId of options.teamIds ?? []) {
    await insert('event_participants', { event_id: id, team_id: teamId })
  }
  return id
}

/** Esportes e times favoritos, como o onboarding grava. */
export async function setPreferences(
  userId: string,
  { sports = [], teams = [] }: { sports?: string[]; teams?: string[] }
) {
  for (const slug of sports) {
    await insert('user_preference_sports', {
      user_id: userId,
      sport_id: await sportId(slug)
    })
  }
  for (const slug of teams) {
    const { id, sport_id } = await team(slug)
    await insert('user_favorite_teams', {
      user_id: userId,
      sport_id,
      team_id: id
    })
  }
}

export async function isFavorite(userId: string, barId: string) {
  const rows = await query(
    'SELECT 1 FROM user_favorite_bars WHERE user_id = $1 AND bar_id = $2',
    [userId, barId]
  )
  return rows.length > 0
}

/**
 * Mutação tRPC com a sessão de quem chama (`page.request` leva o cookie do
 * contexto), como o cliente do app chamaria.
 */
export async function trpc<T = unknown>(
  request: APIRequestContext,
  path: string,
  input: unknown
): Promise<T> {
  const response = await request.post(`/api/trpc/${path}`, {
    data: input,
    headers: { origin: BASE_URL }
  })
  const body = await response.json()
  expect(response.ok(), JSON.stringify(body)).toBe(true)
  return body.result.data as T
}
