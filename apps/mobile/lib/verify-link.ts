import * as Crypto from 'expo-crypto'
import * as Linking from 'expo-linking'
import * as SecureStore from 'expo-secure-store'
import { packMarker, unpackMarker } from './pending-marker'

/*
 * O link de confirmação de e-mail volta ao app em `/verified`. A sessão não
 * vem na URL (qualquer app pode registrar `onside://`): vem um código de uso
 * único, que o app troca pela sessão apresentando um verificador que só ele
 * tem, como no PKCE (`packages/auth/src/app-session-handoff.ts`). Ao cadastrar
 * ou reenviar, o app guarda o verificador (1 h, o `emailVerification.expiresIn`
 * do servidor) e manda o SHA-256 dele no `callbackURL` como `?c=`.
 */

const KEY = 'onside.pending-verify'
const TTL_MS = 60 * 60 * 1000

const randomVerifier = () =>
  Array.from(Crypto.getRandomBytes(32), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

/** O `callbackURL` do cadastro e do reenvio, com o desafio deste aparelho. */
export async function verifiedCallbackURL() {
  const stored = await SecureStore.getItemAsync(KEY).catch(() => null)
  // Reenviar mantém o verificador: o primeiro e-mail continua valendo.
  const verifier = unpackMarker(stored) ?? randomVerifier()
  await SecureStore.setItemAsync(KEY, packMarker(verifier, TTL_MS))
  const challenge = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.HEX }
  )
  return Linking.createURL('/verified', {
    queryParams: { c: challenge.toLowerCase() }
  })
}

/** O verificador guardado, cru (com prazo), para `verifiedGate`. */
export const readStoredVerifier = () =>
  SecureStore.getItemAsync(KEY).catch(() => null)

export const clearVerifier = () =>
  SecureStore.deleteItemAsync(KEY).catch(() => {})
