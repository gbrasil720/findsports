import type { ReactNode, Ref } from 'react'
import CircleInfo from 'reicon-react/icons/CircleInfo'
import {
  formatDateTime,
  getAllValidatedMessage,
  getArrivalBlocker,
  getCounterLabel,
  getGameTitle,
  type ValidatedReservation
} from '@/domain/reservation-validation'

type Props = {
  titleId: string
  titleRef: Ref<HTMLHeadingElement>
  reservation: ValidatedReservation
  now: number
  error: string | null
  /** Botões de ação; quem decide o que fazer é o painel. */
  children: ReactNode
}

/** Resumo da reserva que o código resolveu: quem, qual jogo, quantos já chegaram. */
export function ReservationSummary({
  titleId,
  titleRef,
  reservation,
  now,
  error,
  children
}: Props) {
  const blocker = getArrivalBlocker(reservation, now)
  const isFull = reservation.usedCount >= reservation.maxUses

  return (
    <section
      aria-labelledby={titleId}
      className="border-[var(--onside-ink)] border-t-[1.5px] pt-5"
    >
      <p className="onside-kicker mb-1">
        Código{' '}
        <span className="font-[family-name:var(--onside-mono)] tracking-[0.18em]">
          {reservation.code}
        </span>
      </p>
      <h3
        ref={titleRef}
        id={titleId}
        tabIndex={-1}
        className="onside-display text-2xl [overflow-wrap:anywhere]"
      >
        Reserva de {reservation.guestName}
      </h3>

      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--onside-muted)] text-xs">Jogo</dt>
          <dd className="font-semibold [overflow-wrap:anywhere]">
            {getGameTitle(reservation.event)}
          </dd>
          <dd className="text-[var(--onside-muted)]">
            {reservation.event.championship} ·{' '}
            {formatDateTime(reservation.event.startsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--onside-muted)] text-xs">
            Pessoas na reserva
          </dt>
          <dd className="font-semibold tabular-nums">
            {reservation.partySize}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[var(--onside-muted)] text-xs">
            Oferta da casa nesta reserva
          </dt>
          <dd className="font-semibold [overflow-wrap:anywhere]">
            {reservation.offerSnapshot ?? 'Reserva feita sem oferta.'}
          </dd>
        </div>
      </dl>

      <p className="onside-display mt-5 text-4xl tabular-nums">
        {getCounterLabel(reservation.usedCount, reservation.maxUses)}
      </p>

      {blocker ? (
        <div className="onside-callout onside-callout-warn mt-4">
          <CircleInfo
            size={20}
            color="currentColor"
            className="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 font-semibold text-sm">{blocker.title}</p>
            <p className="text-sm opacity-90">{blocker.detail}</p>
          </div>
        </div>
      ) : isFull ? (
        <div className="onside-callout onside-callout-acid mt-4">
          <p className="font-semibold text-sm">
            {getAllValidatedMessage(reservation.maxUses)}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="onside-callout onside-callout-danger mt-4" role="alert">
          <p className="font-semibold text-sm">{error}</p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}
