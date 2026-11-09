import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

/*
 * "O jogo de hoje" (rodada 1 do redesign) aparece só na primeira abertura,
 * até a primeira escolha: um jogo, "Ver bares perto de mim" ou a cidade.
 * Depois o app abre direto no Explorar, com ou sem conta. Fica no aparelho:
 * reinstalar mostra de novo.
 */
const KEY = 'onside.jogo-de-hoje-visto'

export const firstOpenSeen = () =>
  SecureStore.getItemAsync(KEY).then(
    (value) => value === '1',
    () => true
  )

/** A primeira escolha: marca como visto e troca para o Explorar, sem volta. */
export function leaveFirstOpen(params?: Record<string, string>) {
  SecureStore.setItemAsync(KEY, '1').catch(() => {})
  if (router.canDismiss()) router.dismissAll()
  router.replace({ pathname: '/explore', params })
}
