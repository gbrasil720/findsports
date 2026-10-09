import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import {
  getDecisionNotice,
  getLatestDecision,
  getUnseenDecisions
} from '@/domain/reservations'
import { useTRPC } from '@/utils/trpc'

/**
 * Aviso de reserva confirmada ou recusada (WEB-318, ADR 0003 "Aviso ao
 * torcedor"): devolve quantas respostas do bar o torcedor ainda não viu, para
 * o selo do menu, e mostra um toast por carga do app.
 *
 * "Visto" é a data da resposta mais recente que "Minhas reservas" já mostrou
 * neste navegador, por conta.
 * ponytail: `localStorage`, sem estado no servidor — não acompanha o torcedor
 * entre aparelhos (o segundo avisa de novo, uma vez) nem entre abas abertas.
 * Se isso incomodar, a saída é uma coluna "visto até" no usuário.
 */

const RESERVATIONS_PATH = '/dashboard/reservations'

/** Um aviso por resposta; além disso o selo já conta. */
const TOAST_LIMIT = 3

const seen = new Map<string, number>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

const storageKey = (userId: string) => `onside:reservations-seen:${userId}`

function readSeen(userId: string): number {
  let until = seen.get(userId)
  if (until === undefined) {
    try {
      until = Number(localStorage.getItem(storageKey(userId))) || 0
    } catch {
      until = 0
    }
    seen.set(userId, until)
  }
  return until
}

function markSeen(userId: string, until: number) {
  seen.set(userId, until)
  try {
    localStorage.setItem(storageKey(userId), String(until))
  } catch {
    // Armazenamento bloqueado: vale a memória até recarregar.
  }
  for (const listener of listeners) listener()
}

/** Resposta mais recente já anunciada por toast nesta carga do app. */
let toastedUntil = 0

export function useReservationNews(userId: string | undefined): number {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const onList = useLocation({
    select: (location) => location.pathname === RESERVATIONS_PATH
  })
  const { data } = useQuery({
    ...trpc.reservations.mine.queryOptions(),
    enabled: Boolean(userId),
    meta: { errorToast: false }
  })
  // No servidor não há o que comparar: `null` não mostra nada.
  const seenUntil = useSyncExternalStore(
    subscribe,
    () => (userId ? readSeen(userId) : null),
    () => null
  )

  useEffect(() => {
    if (!userId || seenUntil === null) return
    const unseen = getUnseenDecisions(data, seenUntil)
    const latest = getLatestDecision(unseen)
    if (!latest) return
    // A lista está na tela: é ali que ele vê, sem toast por cima.
    if (onList) {
      markSeen(userId, latest)
      return
    }
    if (latest <= toastedUntil) return
    toastedUntil = latest
    for (const reservation of unseen.slice(0, TOAST_LIMIT)) {
      const { title, description } = getDecisionNotice(reservation)
      toast(title, {
        description,
        action: {
          label: 'Ver reservas',
          onClick: () => void navigate({ to: RESERVATIONS_PATH })
        }
      })
    }
  }, [userId, seenUntil, data, onList, navigate])

  return seenUntil === null ? 0 : getUnseenDecisions(data, seenUntil).length
}
