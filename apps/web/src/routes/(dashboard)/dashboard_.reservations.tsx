import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/app/app-shell'
import { formatDayLabel, formatEventTime } from '@/domain/pub-profile'
import { formatDateTime, getGameTitle } from '@/domain/reservation-validation'
import {
  type FanReservation,
  getCancelErrorMessage,
  RESERVATION_STATUS_DETAIL,
  RESERVATION_STATUS_LABEL
} from '@/domain/reservations'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(dashboard)/dashboard_/reservations')({
  head: () => ({
    meta: [
      { title: 'Minhas reservas — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: MyReservationsPage
})

const STATUS_BADGE: Record<FanReservation['status'], string> = {
  pending: 'onside-badge onside-badge-stone',
  confirmed: 'onside-badge onside-badge-acid',
  declined: 'onside-badge onside-badge-ink',
  cancelled: 'onside-badge onside-badge-ink',
  expired: 'onside-badge onside-badge-ink'
}

/**
 * Os pedidos de reserva do torcedor (WEB-124), sem depender do bar: continua
 * legível e cancelável mesmo se o bar perder o plano ou desligar o
 * recebimento.
 */
function MyReservationsPage() {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.reservations.mine.queryOptions(),
    meta: { errorToast: false }
  })
  const [announcement, setAnnouncement] = useState('')

  return (
    <AppShell variant="fan">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <h1 className="onside-display text-3xl">Minhas reservas</h1>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>

        {query.isLoading ? (
          <div role="status" aria-busy="true" className="space-y-3">
            <span className="sr-only">Carregando reservas…</span>
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : query.isError ? (
          <div className="onside-panel p-5" role="alert">
            <p className="text-sm">
              {getUserFacingMessage(
                query.error,
                'Não foi possível carregar suas reservas. Tente novamente.'
              )}
            </p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="onside-btn onside-btn-outline mt-3 min-h-11 text-sm"
            >
              Tentar novamente
            </button>
          </div>
        ) : query.data?.length ? (
          <ul className="space-y-3">
            {query.data.map((reservation) => (
              <li key={reservation.id}>
                <ReservationCard
                  reservation={reservation}
                  onCancelled={() => setAnnouncement('Pedido cancelado.')}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="onside-panel p-6 text-center">
            <p className="font-semibold text-sm">
              Você ainda não pediu reserva.
            </p>
            <p className="mt-1 text-[var(--onside-muted)] text-sm">
              No perfil de um bar que recebe reservas, use “Reservar mesa”.
            </p>
            <Link
              to="/dashboard"
              className="onside-btn onside-btn-acid mt-4 min-h-11 text-sm"
            >
              Procurar bares
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function ReservationCard({
  reservation,
  onCancelled
}: {
  reservation: FanReservation
  onCancelled: () => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // O botão clicado some; o foco vai para a confirmação, e não para o body.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])
  const [error, setError] = useState<string | null>(null)
  const startsAt = new Date(reservation.event.startsAt)
  const titleId = `reservation-${reservation.id}`

  const cancelMutation = useMutation(
    trpc.reservations.cancel.mutationOptions({
      onSuccess: () => {
        setConfirming(false)
        onCancelled()
        void queryClient.invalidateQueries({
          queryKey: trpc.reservations.mine.queryKey()
        })
      },
      onError: (err) => setError(getCancelErrorMessage(err))
    })
  )

  const cancel = () => {
    setError(null)
    cancelMutation.mutate({ reservationId: reservation.id })
  }

  return (
    <article className="onside-panel p-5" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="font-bold text-lg">
            {getGameTitle(reservation.event)}
          </h2>
          <p className="text-[var(--onside-muted)] text-sm">
            <Link
              to="/pub/$pubId"
              params={{ pubId: reservation.bar.id }}
              className="underline"
            >
              {reservation.bar.name}
            </Link>{' '}
            · {formatDayLabel(startsAt)} às {formatEventTime(startsAt)} ·{' '}
            {reservation.partySize}{' '}
            {reservation.partySize === 1 ? 'pessoa' : 'pessoas'}
          </p>
        </div>
        <span className={STATUS_BADGE[reservation.status]}>
          {RESERVATION_STATUS_LABEL[reservation.status]}
        </span>
      </div>

      <p className="mt-2 text-sm">
        {RESERVATION_STATUS_DETAIL[reservation.status]}
      </p>

      {reservation.code ? (
        <div className="mt-3 border-[1.5px] border-[var(--onside-line)] p-3">
          <p className="onside-kicker">Código</p>
          <p className="font-[family-name:var(--onside-mono)] font-bold text-2xl tracking-[0.2em]">
            {reservation.code}
          </p>
          {reservation.window ? (
            <p className="text-[var(--onside-muted)] text-xs">
              Vale no bar de {formatDateTime(reservation.window.opensAt)} até{' '}
              {formatDateTime(reservation.window.closesAt)}.
            </p>
          ) : null}
        </div>
      ) : null}

      {reservation.offerSnapshot ? (
        <p className="mt-3 text-sm [overflow-wrap:anywhere]">
          <span className="font-semibold">Oferta da casa:</span>{' '}
          {reservation.offerSnapshot}
        </p>
      ) : null}
      {reservation.note ? (
        <p className="mt-1 text-[var(--onside-muted)] text-sm [overflow-wrap:anywhere]">
          Sua observação: {reservation.note}
        </p>
      ) : null}

      {error ? (
        <p className="onside-field-error" role="alert">
          {error}
        </p>
      ) : null}

      {reservation.canCancel ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {confirming ? (
            <>
              <button
                ref={confirmRef}
                type="button"
                onClick={cancel}
                disabled={cancelMutation.isPending}
                className="onside-btn onside-btn-ink min-h-11 text-sm disabled:opacity-50"
              >
                {cancelMutation.isPending
                  ? 'Cancelando…'
                  : 'Confirmar cancelamento'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={cancelMutation.isPending}
                className="onside-btn onside-btn-outline min-h-11 text-sm"
              >
                Manter pedido
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="onside-btn onside-btn-outline min-h-11 text-sm"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      ) : null}
    </article>
  )
}
