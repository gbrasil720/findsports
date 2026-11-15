import { BRASILIA_TIME_ZONE as TZ } from '@findsports_oficial/db/event-window'
import * as SecureStore from 'expo-secure-store'
import { packMarker, unpackMarker } from './pending-marker'

/*
 * O link de convite dos amigos (S1): a página do web que abre o app no
 * convite (`/convite/<código>`). Quem cria conta por ele já entra como amigo.
 */

export const inviteUrl = (code: string) =>
  `${process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://onside.sh'}/convite/${encodeURIComponent(code)}`

/** A mensagem que vai junto do link ao compartilhar. */
export const inviteMessage = (code: string) =>
  `Bora ver os jogos juntos na Onside? Me adiciona: ${inviteUrl(code)}`

/** "outubro": o mês de agora, em português. */
export const monthName = (now = new Date()) =>
  now.toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: TZ
  })

/*
 * Convite aceito ("Criar conta e ser amigo", "Entrar e aceitar") por quem
 * ainda não entrou ou não terminou o onboarding: fica no aparelho por 1 h, até
 * a conta chegar às abas do torcedor, que o aceitam (`usePendingInvite`, em
 * `app/(fan)/_layout.tsx`). Tocado já com conta, só ela o aceita. Só abrir o
 * link não guarda nada, e "Fechar" apaga.
 */
const PENDING_INVITE = 'onside.pending-invite'
const INVITE_TTL_MS = 60 * 60 * 1000

export const savePendingInvite = (code: string, userId?: string) =>
  SecureStore.setItemAsync(
    PENDING_INVITE,
    packMarker(code, INVITE_TTL_MS, Date.now(), userId)
  ).catch(() => {})

export const clearPendingInvite = () =>
  SecureStore.deleteItemAsync(PENDING_INVITE).catch(() => {})

/** O convite guardado para esta conta; sai do aparelho ao ser lido. */
export async function takePendingInvite(userId: string) {
  const raw = await SecureStore.getItemAsync(PENDING_INVITE).catch(() => null)
  if (raw) await clearPendingInvite()
  return unpackMarker(raw, Date.now(), userId)
}
