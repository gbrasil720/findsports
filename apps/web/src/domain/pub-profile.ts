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
    .filter((item) => getEventTemporalState(item.startsAt, now) !== 'past')
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
  /** Selo de verificado no topo — só para quem assina acima do starter. */
  badge: { label: string; className: string } | null
  /** Altura da capa. Starter não perde informação, perde palco. */
  coverHeight: string
}

const PLAN_PRESENTATION: Record<BarPlan, PlanPresentation> = {
  elite: {
    badge: {
      label: 'Elite',
      className: 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
    },
    coverHeight: 'h-[220px] md:h-[300px]'
  },
  pro: {
    badge: {
      label: 'Pro',
      className: 'bg-[var(--onside-ink)] text-[var(--onside-paper)]'
    },
    coverHeight: 'h-[220px] md:h-[300px]'
  },
  starter: {
    badge: null,
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
