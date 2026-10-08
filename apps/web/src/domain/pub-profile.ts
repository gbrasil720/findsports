import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { buildDirectionsUrl } from '@/lib/maps-link'
import { buildWhatsAppLink } from '@/lib/whatsapp-link'
import { getEventTemporalState } from './events'

/**
 * Seletores do perfil público do bar.
 *
 * A página tem um trabalho só: levar o torcedor até o bar. Quem chega quase
 * sempre vem de um jogo específico (`?eventId` na busca), então o perfil é
 * organizado em torno desse jogo — e não em torno do cadastro do bar.
 */

export type ProfileTeam = {
  name: string
  logoUrl: string | null
}

export type ProfileEvent = {
  id: string
  championship: string
  startsAt: Date
  endsAt: Date | null
  participantFreeText: string | null
  sport: { name: string; slug: string }
  participants: { team: ProfileTeam }[]
}

export type PubOutput = NonNullable<
  inferRouterOutputs<AppRouter>['pubs']['getById']
>

export type ProfileGame = ProfileEvent & {
  reservationsSoldOut: boolean
  attendance: PubOutput['events'][number]['attendance']
}

export type NormalizedPub = Omit<PubOutput, 'events'> & {
  events: ProfileGame[]
}

/**
 * tRPC serializa `Date` como string. A normalização acontece uma vez, aqui,
 * para que os componentes recebam `Date` e nenhum deles precise adivinhar o
 * formato.
 */
export function normalizePub(raw: PubOutput): NormalizedPub {
  return {
    ...raw,
    events: raw.events.map((event) => ({
      id: event.id,
      championship: event.championship,
      startsAt: new Date(event.startsAt),
      endsAt: event.endsAt ? new Date(event.endsAt) : null,
      participantFreeText: event.participantFreeText,
      reservationsSoldOut: event.reservationsSoldOut,
      attendance: event.attendance,
      sport: { name: event.sport.name, slug: event.sport.slug },
      participants: event.participants.map((participant) => ({
        team: {
          name: participant.team.name,
          logoUrl: participant.team.logoUrl
        }
      }))
    }))
  }
}

/**
 * O que "Garanta seu lugar" oferece a quem visita. O perfil e a prévia do dono
 * no painel passam por aqui, para a prévia não divergir do que o torcedor vê.
 *
 * `acceptsReservations` já vem efetivo do servidor (quer E pode). Reserva só
 * para jogo que ainda não começou e conta de torcedor; o servidor confere de
 * novo ao gravar.
 */
export function resolveProfileActions(
  pub: NormalizedPub,
  heroEvent: ProfileEvent | null,
  viewerRole: string | null | undefined,
  now: number = Date.now()
) {
  const reservableEvents = pub.events.filter(
    (event) => event.startsAt.getTime() > now
  )
  const offersReservation =
    pub.acceptsReservations &&
    viewerRole === 'fan' &&
    reservableEvents.length > 0
  const canReserve =
    offersReservation &&
    reservableEvents.some((event) => !event.reservationsSoldOut)

  return {
    whatsappUrl: buildWhatsAppLink({
      phone: pub.phone,
      acceptsWhatsapp: pub.phoneAcceptsWhatsapp,
      event: heroEvent
        ? {
            matchup: formatMatchup(heroEvent),
            when: `${formatDayLabel(heroEvent.startsAt).toLowerCase()} às ${formatEventTime(heroEvent.startsAt)}`
          }
        : null
    }),
    directionsUrl: buildDirectionsUrl({
      latitude: pub.latitude,
      longitude: pub.longitude,
      name: pub.name,
      address: pub.address
    }),
    phone: pub.phone,
    reservableEvents,
    canReserve,
    reservationsSoldOut: offersReservation && !canReserve
  }
}

/**
 * O jogo que a página destaca no topo.
 *
 * Prioridade: o jogo pelo qual o torcedor chegou. Se o `eventId` não existir
 * mais na resposta — jogo cancelado, ou passado da janela — cai para o
 * próximo jogo em vez de deixar o topo vazio: quem veio ver "o que passa
 * aqui" continua sendo atendido.
 */
export function resolveHeroEvent<T extends ProfileEvent>(
  events: T[],
  eventId: string | null,
  now: Date | number = Date.now()
): T | null {
  if (events.length === 0) return null

  if (eventId) {
    const requested = events.find((item) => item.id === eventId)
    if (requested) return requested
  }

  const upcoming = events
    .filter(
      (item) =>
        getEventTemporalState(item.startsAt, item.endsAt, now) !== 'past'
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  return upcoming[0] ?? null
}

/**
 * Rótulo do confronto. Times cadastrados ganham `×`; sem times, vale o texto
 * livre que o bar escreveu; sem nada disso, o campeonato carrega sozinho.
 */
export function formatMatchup(event: ProfileEvent): string {
  const teams = event.participants
    .map((item) => item.team?.name)
    .filter((name): name is string => Boolean(name))

  if (teams.length > 0) return teams.join(' × ')
  if (event.participantFreeText) return event.participantFreeText
  return event.championship
}

/**
 * Linha de apoio de um jogo: as partes juntas por " · ", menos a que já é o
 * título. Jogo sem times nem texto livre tem o campeonato como título
 * (`formatMatchup`, `getGameTitle`), e repetido embaixo o card dizia
 * "Brasileirão / Brasileirão" (WEB-307).
 */
export function formatGameSubtitle(title: string, parts: string[]): string {
  return parts.filter((part) => part !== title).join(' · ')
}

/** "Hoje" e "Amanhã" antes de qualquer data — é assim que se fala de jogo. */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  if (date.toDateString() === now.toDateString()) return 'Hoje'
  if (date.toDateString() === tomorrow.toDateString()) return 'Amanhã'

  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short'
  })
}

export function formatEventTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export type EventDayGroup<T extends ProfileEvent> = {
  /** `toDateString()` do dia — chave estável para `key` de lista. */
  key: string
  label: string
  events: T[]
}

/**
 * Agrupa a agenda por dia. Uma lista corrida de horários não diz ao torcedor
 * o que rola hoje; o dia é a unidade em que ele decide.
 */
export function groupEventsByDay<T extends ProfileEvent>(
  events: T[],
  now: Date = new Date()
): EventDayGroup<T>[] {
  const groups = new Map<string, EventDayGroup<T>>()

  for (const event of [...events].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime()
  )) {
    const key = event.startsAt.toDateString()
    const group = groups.get(key)

    if (group) {
      group.events.push(event)
      continue
    }

    groups.set(key, {
      key,
      label: formatDayLabel(event.startsAt, now),
      events: [event]
    })
  }

  return [...groups.values()]
}

export type BarPlan = 'starter' | 'pro' | 'elite'

export type PlanPresentation = {
  /** Selo que identifica o plano — só para quem assina acima do starter. */
  planBadge: { label: string; className: string } | null
  /** Altura da capa. Starter não perde informação, perde palco. */
  coverHeight: string
}

const PLAN_PRESENTATION: Record<BarPlan, PlanPresentation> = {
  elite: {
    planBadge: {
      label: 'Elite',
      className: 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
    },
    coverHeight: 'h-[300px] md:h-[360px]'
  },
  pro: {
    planBadge: {
      label: 'Pro',
      className: 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
    },
    coverHeight: 'h-[300px] md:h-[360px]'
  },
  starter: {
    planBadge: null,
    coverHeight: 'h-[150px] md:h-[180px]'
  }
}

export function getPlanPresentation(
  plan: string | null | undefined
): PlanPresentation {
  return (
    PLAN_PRESENTATION[(plan ?? 'starter') as BarPlan] ??
    PLAN_PRESENTATION.starter
  )
}

/** Iniciais do bar para a capa gerada quando não há foto. */
export function getBarInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
