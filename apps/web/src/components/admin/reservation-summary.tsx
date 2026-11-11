import { gameTitle } from '@findsports_oficial/db/game-title'
import type { ReactNode, Ref } from 'react'
import { formatGameSubtitle } from '@/domain/pub-profile'
import {
  formatDateTime,
  getAllValidatedMessage,
  getArrivalBlocker,
  getCounterLabel,
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

/** Resumo do código: quem marcou, qual jogo, se já chegou. */
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
    <section aria-labelledby={titleId} className="pn-cv-res">
      <p className="pn-k">
        Código <span className="pn-mono pn-cv-code">{reservation.code}</span>
      </p>
      <h3 ref={titleRef} id={titleId} tabIndex={-1} className="pn-cv-who">
        {reservation.guestName}
      </h3>

      <dl className="pn-cv-dl">
        <div>
          <dt>Jogo</dt>
          <dd>
            <b>{gameTitle(reservation.event)}</b>
          </dd>
          <dd>
            {formatGameSubtitle(gameTitle(reservation.event), [
              reservation.event.championship,
              formatDateTime(reservation.event.startsAt)
            ])}
          </dd>
        </div>
        <div>
          <dt>Oferta da casa</dt>
          <dd>
            <b>
              {reservation.offerSnapshot ??
                'O bar não tinha oferta quando a pessoa marcou.'}
            </b>
          </dd>
        </div>
      </dl>

      {/* Chegada registrada é resultado; "0 de N" ainda não é. */}
      <p
        className={`pn-disp pn-cv-n${reservation.usedCount > 0 ? ' is-on' : ''}`}
      >
        {getCounterLabel(reservation.usedCount, reservation.maxUses)}
      </p>

      {blocker ? (
        <div className="pn-lock">
          <span>
            <b>{blocker.title}</b>
            {blocker.detail}
          </span>
        </div>
      ) : isFull ? (
        <div className="pn-aviso-ok">
          <b>Código validado</b>
          <p>{getAllValidatedMessage(reservation.maxUses)}</p>
        </div>
      ) : null}

      {error ? (
        <div className="pn-err" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <div className="pn-acts pn-cv-acts">{children}</div>
    </section>
  )
}
