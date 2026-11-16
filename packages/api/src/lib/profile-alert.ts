import { db, eq, sql } from '@findsports_oficial/db'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import {
  PROFILE_ALERT_DISMISS_DAYS,
  PROFILE_ALERTS,
  type ProfileAlert
} from '@findsports_oficial/db/profile-alerts'
import {
  bar,
  barProfileAlert,
  barTeam
} from '@findsports_oficial/db/schema/platform'
import { canShowBarMenu } from './bar-menu'
import { issuesCounterCode, type SubscriptionForPlan } from './current-plan'

/**
 * Alerta de perfil incompleto do painel do bar: um assunto por vez, na ordem
 * de `PROFILE_ALERTS`, só os que valem para o plano vigente.
 *
 * Como o servidor sabe que o dono resolveu um assunto sem mexer nas mutations
 * de cada campo: a cada leitura, o assunto devolvido ganha `shown_on` = hoje
 * (dia de Brasília) em `bar_profile_alert`. Se o último assunto mostrado hoje
 * não está mais na fila (foi resolvido, dispensado ou saiu do plano), o dono
 * já mexeu nele hoje e nada aparece até amanhã. Amanhã, o primeiro da fila.
 *
 * `skip` tira assuntos só desta leitura (o app não resolve WhatsApp nem
 * cardápio): o seguinte aparece no lugar. Pulado continua na fila para a
 * regra acima, senão pular o que o web mostrou hoje pareceria resolvido.
 */

export type ProfileFacts = {
  openingHours: unknown
  phone: string | null
  phoneAcceptsWhatsapp: boolean | null
  houseOffer: string | null
  menuUrl: string | null
  description: string | null
  descriptionPending: string | null
  houseTeamCount: number
}

export type ProfileAlertState = {
  alert: ProfileAlert
  dismissedUntil: Date | null
  shownOn: string | null
}

const blank = (text: string | null) => !text?.trim()

/** O que falta no perfil, na ordem da fila, só o que vale para o plano. */
export function missingProfileItems(
  facts: ProfileFacts,
  subscription: SubscriptionForPlan | null,
  now = new Date()
): ProfileAlert[] {
  const missing: Record<ProfileAlert, boolean> = {
    horario: facts.openingHours == null,
    whatsapp:
      (facts.phone ?? '').replace(/\D/g, '').length >= 10 &&
      !facts.phoneAcceptsWhatsapp,
    oferta: issuesCounterCode(subscription, now) && blank(facts.houseOffer),
    cardapio: canShowBarMenu(subscription, now) && facts.menuUrl == null,
    descricao: blank(facts.description) && blank(facts.descriptionPending),
    times: facts.houseTeamCount === 0
  }
  return PROFILE_ALERTS.filter((key) => missing[key])
}

/** O assunto de hoje, ou `null`. */
export function pickProfileAlert(
  missing: ProfileAlert[],
  states: ProfileAlertState[],
  today: string,
  now = new Date(),
  skip: readonly ProfileAlert[] = []
): ProfileAlert | null {
  const dismissed = new Set(
    states
      .filter((s) => s.dismissedUntil && s.dismissedUntil > now)
      .map((s) => s.alert)
  )
  const queue = missing.filter((key) => !dismissed.has(key))
  const shownToday = states.filter((s) => s.shownOn === today)
  if (shownToday.some((s) => !queue.includes(s.alert))) return null
  return queue.find((key) => !skip.includes(key)) ?? null
}

export function profileAlertDismissedUntil(now = new Date()): Date {
  return new Date(now.getTime() + PROFILE_ALERT_DISMISS_DAYS * 86_400_000)
}

/**
 * Lê o assunto de hoje do bar e marca `shown_on`. Bar fora do ar não tem
 * alerta. A escrita só sai quando o assunto ainda não foi marcado hoje.
 */
export async function readProfileAlert(
  barId: string,
  subscription: SubscriptionForPlan | null,
  skip: readonly ProfileAlert[] = [],
  now = new Date()
): Promise<ProfileAlert | null> {
  const [row] = await db
    .select({
      isActive: bar.isActive,
      openingHours: bar.openingHours,
      phone: bar.phone,
      phoneAcceptsWhatsapp: bar.phoneAcceptsWhatsapp,
      houseOffer: bar.houseOffer,
      menuUrl: bar.menuUrl,
      description: bar.description,
      descriptionPending: bar.descriptionPending,
      houseTeamCount: sql<number>`(SELECT count(*)::int FROM ${barTeam} WHERE ${barTeam.barId} = ${bar.id})`
    })
    .from(bar)
    .where(eq(bar.id, barId))
  if (!row?.isActive) return null

  const states = await db
    .select({
      alert: barProfileAlert.alert,
      dismissedUntil: barProfileAlert.dismissedUntil,
      shownOn: barProfileAlert.shownOn
    })
    .from(barProfileAlert)
    .where(eq(barProfileAlert.barId, barId))
  const today = brasiliaDay(now)
  const alert = pickProfileAlert(
    missingProfileItems(row, subscription, now),
    states,
    today,
    now,
    skip
  )
  if (alert && !states.some((s) => s.alert === alert && s.shownOn === today)) {
    await db
      .insert(barProfileAlert)
      .values({ barId, alert, shownOn: today })
      .onConflictDoUpdate({
        target: [barProfileAlert.barId, barProfileAlert.alert],
        set: { shownOn: today }
      })
  }
  return alert
}

/** "Agora não": idempotente, cada chamada recomeça os 3 dias. */
export async function dismissProfileAlert(
  barId: string,
  alert: ProfileAlert,
  now = new Date()
) {
  const dismissedUntil = profileAlertDismissedUntil(now)
  await db
    .insert(barProfileAlert)
    .values({ barId, alert, dismissedUntil })
    .onConflictDoUpdate({
      target: [barProfileAlert.barId, barProfileAlert.alert],
      set: { dismissedUntil }
    })
}
