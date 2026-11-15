import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as SecureStore from 'expo-secure-store'
import { packMarker, unpackMarker } from './pending-marker'

/*
 * O link de confirmação de e-mail volta ao app em `/verified` com a sessão em
 * `?cookie=`. Um deep link qualquer pode trazer esse parâmetro, então a sessão
 * só é adotada se este aparelho pediu o e-mail: ao cadastrar ou reenviar, o
 * app guarda um nonce (1 h, o `emailVerification.expiresIn` do servidor) e o
 * põe no `callbackURL` como `?v=`. O plugin `expo()` do servidor acrescenta o
 * `cookie` ao mesmo endereço, sem tirar o `v`.
 */

const KEY = 'onside.pending-verify'
const TTL_MS = 60 * 60 * 1000

/** O `callbackURL` do cadastro e do reenvio, com o nonce deste aparelho. */
export async function verifiedCallbackURL() {
  const stored = await SecureStore.getItemAsync(KEY).catch(() => null)
  // Reenviar mantém o nonce: o primeiro e-mail continua valendo.
  const nonce = unpackMarker(stored) ?? Crypto.randomUUID()
  await SecureStore.setItemAsync(KEY, packMarker(nonce, TTL_MS))
  return Linking.createURL('/verified', { queryParams: { v: nonce } })
}

/** O nonce do link é o deste aparelho e ainda vale? Se for, é gasto. */
export async function takeVerifyNonce(nonce: string | undefined) {
  if (!nonce) return false
  const stored = await SecureStore.getItemAsync(KEY).catch(() => null)
  if (unpackMarker(stored) !== nonce) return false
  await SecureStore.deleteItemAsync(KEY).catch(() => {})
  return true
}
