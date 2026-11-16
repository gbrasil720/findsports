import {
  PROFILE_ALERT_DISMISS_DAYS,
  PROFILE_ALERTS,
  type ProfileAlert
} from '@findsports_oficial/db/profile-alerts'
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
  now = new Date()
): ProfileAlert | null {
  const dismissed = new Set(
    states
      .filter((s) => s.dismissedUntil && s.dismissedUntil > now)
      .map((s) => s.alert)
  )
  const queue = missing.filter((key) => !dismissed.has(key))
  const shownToday = states.filter((s) => s.shownOn === today)
  if (shownToday.some((s) => !queue.includes(s.alert))) return null
  return queue[0] ?? null
}

export function profileAlertDismissedUntil(now = new Date()): Date {
  return new Date(now.getTime() + PROFILE_ALERT_DISMISS_DAYS * 86_400_000)
}
