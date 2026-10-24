import { BRASILIA_TIME_ZONE as TZ } from '@findsports_oficial/db/event-window'
import * as SecureStore from 'expo-secure-store'

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
 * Convite aberto por quem ainda não entrou (ou não terminou o onboarding):
 * fica no aparelho até a conta chegar às abas do torcedor, que o aceitam
 * (`usePendingInvite`, em `app/(fan)/_layout.tsx`).
 */
const PENDING_INVITE = 'onside.pending-invite'

export const savePendingInvite = (code: string) =>
  SecureStore.setItemAsync(PENDING_INVITE, code).catch(() => {})

/** O convite guardado, que sai do aparelho ao ser lido. */
export async function takePendingInvite() {
  const code = await SecureStore.getItemAsync(PENDING_INVITE).catch(() => null)
  if (code) await SecureStore.deleteItemAsync(PENDING_INVITE).catch(() => {})
  return code
}
