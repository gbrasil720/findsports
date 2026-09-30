import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import { formatDateTime, getGameTitle } from '@/domain/reservation-validation'
import {
  ANSWER_RESULT,
  type BarReservation,
  getRespondErrorMessage,
  RESERVATION_STATUS_LABEL,
  type ReservationAnswer
} from '@/domain/reservations'
import { countLabel } from '@/lib/plural'
import { isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { AdminTabPanel } from './admin-tabs'
import { QueryError } from './query-error'

const STATUS_BADGE: Record<BarReservation['status'], string> = {
  pending: 'onside-badge onside-badge-acid',
  confirmed: 'onside-badge onside-badge-stone',
  declined: 'onside-badge onside-badge-ink',
  cancelled: 'onside-badge onside-badge-ink'
}

/**
 * Fila de pedidos de reserva do bar (WEB-125). A confirmação é manual (ADR
 * 0003): sem inventário de mesas, nada vira reserva sem o dono.
 */
export function ReservationsTab({ active }: { active: boolean }) {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.barReservations.list.queryOptions(),
    meta: { errorToast: false }
  })
  const [announcement, setAnnouncement] = useState('')

  return (
    <AdminTabPanel id="admin-reservas" active={active}>
      <div className="mb-6">
        <h2 className="onside-display text-2xl">Reservas</h2>
        <p className="mt-1 text-sm text-[var(--onside-muted)]">
          Pedidos para os jogos que ainda não acabaram. O pedido só vira reserva
          quando você confirma.
        </p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {query.isLoading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">Carregando pedidos de reserva…</span>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : query.isError || !query.data ? (
        <QueryError
          message="Não foi possível carregar os pedidos de reserva."
          retryable={isRetryableError(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.length ? (
        <ul className="space-y-3">
          {query.data.map((reservation) => (
            <li key={reservation.id}>
              <ReservationRequest
                reservation={reservation}
                onAnswered={setAnnouncement}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="onside-panel p-6 text-center">
          <p className="font-semibold text-sm">Nenhum pedido por enquanto.</p>
          <p className="mt-1 text-[var(--onside-muted)] text-sm">
            Os pedidos feitos pelo seu perfil aparecem aqui.
          </p>
        </div>
      )}
    </AdminTabPanel>
  )
}

function ReservationRequest({
  reservation,
  onAnswered
}: {
  reservation: BarReservation
  onAnswered: (message: string) => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const articleRef = useRef<HTMLElement>(null)
  const declineRef = useRef<HTMLButtonElement>(null)
  const [confirmingDecline, setConfirmingDecline] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // O botão clicado some; o foco vai para a confirmação, e não para o body.
  useEffect(() => {
    if (confirmingDecline) declineRef.current?.focus()
  }, [confirmingDecline])

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.barReservations.list.queryKey()
    })

  const respond = useMutation(
    trpc.barReservations.respond.mutationOptions({
      onSuccess: ({ status }) => {
        onAnswered(ANSWER_RESULT[status])
        // Respondido, os botões somem: o foco fica no pedido.
        articleRef.current?.focus()
        void refresh()
      },
      onError: (err) => {
        setError(getRespondErrorMessage(err))
        // Recusa de estado quer dizer que a lista está velha.
        void refresh()
      }
    })
  )

  const answer = (status: ReservationAnswer) => {
    setError(null)
    setConfirmingDecline(false)
    respond.mutate({ reservationId: reservation.id, status })
  }

  const startsAt = new Date(reservation.event.startsAt)
  const titleId = `bar-reservation-${reservation.id}`

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      className="onside-panel p-5"
      aria-labelledby={titleId}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={titleId} className="font-bold text-lg">
            {reservation.guestName} ·{' '}
            {countLabel(reservation.partySize, 'pessoa', 'pessoas')}
          </h3>
          <p className="text-[var(--onside-muted)] text-sm">
            {getGameTitle(reservation.event)} · {formatDayLabel(startsAt)} às{' '}
            {formatEventTime(startsAt)}
          </p>
        </div>
        <span className={STATUS_BADGE[reservation.status]}>
          {RESERVATION_STATUS_LABEL[reservation.status]}
        </span>
      </div>

      {reservation.note ? (
        <p className="mt-2 text-sm [overflow-wrap:anywhere]">
          <span className="font-semibold">Observação:</span> {reservation.note}
        </p>
      ) : null}
      <p className="mt-1 text-[var(--onside-muted)] text-xs">
        Pedido em {formatDateTime(reservation.createdAt)}
      </p>

      {error ? (
        <p className="onside-field-error" role="alert">
          {error}
        </p>
      ) : null}

      {reservation.status === 'pending' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {confirmingDecline ? (
            <>
              <button
                ref={declineRef}
                type="button"
                onClick={() => answer('declined')}
                disabled={respond.isPending}
                className="onside-btn onside-btn-ink min-h-11 text-sm disabled:opacity-50"
              >
                Confirmar recusa
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDecline(false)}
                className="onside-btn onside-btn-outline min-h-11 text-sm"
              >
                Voltar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => answer('confirmed')}
                disabled={respond.isPending}
                className="onside-btn onside-btn-acid min-h-11 text-sm disabled:opacity-50"
              >
                {respond.isPending ? 'Enviando…' : 'Confirmar reserva'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDecline(true)}
                disabled={respond.isPending}
                className="onside-btn onside-btn-outline min-h-11 text-sm"
              >
                Recusar
              </button>
            </>
          )}
        </div>
      ) : null}
    </article>
  )
}
