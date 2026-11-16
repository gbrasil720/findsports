import { unpackMarker } from './pending-marker'
import { rawParam } from './raw-param'

/*
 * O que `/verified` faz com o link que abriu o app (sem imports de Expo, para
 * o teste). Só resgata a sessão com o código do servidor e o verificador
 * guardado neste aparelho, ainda no prazo; o resto sai sem sessão.
 */
export type VerifiedGate =
  | { kind: 'redeem'; code: string; verifier: string }
  | { kind: 'leave'; notice: 'confirmed' | 'expired' }

export function verifiedGate(
  url: string | null | undefined,
  storedVerifier: string | null | undefined,
  now = Date.now()
): VerifiedGate {
  const code = url ? rawParam(url, 'code') : undefined
  const verifier = unpackMarker(storedVerifier, now)
  if (code && verifier) return { kind: 'redeem', code, verifier }
  // Com `?error=` o servidor não confirmou (link vencido ou já usado); sem
  // ele, o e-mail foi confirmado e só falta entrar.
  const failed = !url || rawParam(url, 'error') !== undefined
  return { kind: 'leave', notice: failed ? 'expired' : 'confirmed' }
}
