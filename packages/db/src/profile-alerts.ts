/**
 * Alerta de perfil incompleto do painel do bar: as chaves, na ordem da fila.
 * Sem imports, para o web e o app importarem o mesmo tipo. As regras moram
 * em `packages/api/src/lib/profile-alert.ts`.
 */
export const PROFILE_ALERTS = [
  'horario',
  'whatsapp',
  'oferta',
  'cardapio',
  'descricao',
  'times'
] as const

export type ProfileAlert = (typeof PROFILE_ALERTS)[number]

/** "Agora não": o assunto some por este tempo, em todo aparelho. */
export const PROFILE_ALERT_DISMISS_DAYS = 3
