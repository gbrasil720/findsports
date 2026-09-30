import { useEffect, useState } from 'react'

/**
 * Segundos que restam até `expiresAt`, contados de um em um. Chama `onExpire`
 * quando o prazo acaba. Sem prazo (`null`), não conta nada.
 */
export function useUndoCountdown(
  expiresAt: number | null,
  onExpire: () => void
): number {
  const [secondsLeft, setSecondsLeft] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `onExpire` é recriado a cada render de quem chama; o prazo é o que reinicia a contagem.
  useEffect(() => {
    if (expiresAt === null) return
    const tick = () => {
      const remaining = expiresAt - Date.now()
      if (remaining > 0) setSecondsLeft(Math.ceil(remaining / 1000))
      else onExpire()
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return secondsLeft
}
