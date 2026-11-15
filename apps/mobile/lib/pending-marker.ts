/*
 * Marcador guardado no aparelho com prazo e, quando há conta, o dono. Serve ao
 * link de confirmação de e-mail (`lib/verify-link.ts`) e ao convite de amizade
 * (`lib/invite.ts`): o que chega por deep link só vale se este aparelho pediu,
 * há pouco tempo, e para a mesma conta. Sem imports, para o teste.
 */

type Marker = { value: string; expiresAt: number; userId?: string }

export const packMarker = (
  value: string,
  ttlMs: number,
  now = Date.now(),
  userId?: string
) =>
  JSON.stringify({
    value,
    expiresAt: now + ttlMs,
    ...(userId ? { userId } : {})
  } satisfies Marker)

/** O valor guardado, se ainda vale e, preso a uma conta, se é dela. */
export function unpackMarker(
  raw: string | null | undefined,
  now = Date.now(),
  userId?: string
): string | null {
  if (!raw) return null
  let marker: Partial<Marker>
  try {
    marker = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof marker?.value !== 'string' || !marker.value) return null
  if (typeof marker.expiresAt !== 'number' || marker.expiresAt <= now)
    return null
  if (marker.userId && marker.userId !== userId) return null
  return marker.value
}
