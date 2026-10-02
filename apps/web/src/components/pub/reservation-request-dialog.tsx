import {
  normalizeReservationNote,
  RESERVATION_NOTE_MAX_LENGTH,
  RESERVATION_PARTY_SIZE_MAX,
  reservationNoteLength
} from '@findsports_oficial/db/reservation-limits'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@findsports_oficial/ui/components/dialog'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import {
  formatDayLabel,
  formatEventTime,
  formatMatchup,
  type ProfileEvent
} from '@/domain/pub-profile'
import {
  errorCode,
  formatDateTime,
  wasAnsweredByServer
} from '@/domain/reservation-validation'
import {
  type FanReservation,
  getCreateErrorMessage,
  PENDING_NOTICE,
  SOLD_OUT_MESSAGE
} from '@/domain/reservations'
import { useTRPC } from '@/utils/trpc'

/** Jogo do perfil com o teto já resolvido pelo servidor (WEB-152). */
export type ReservableEvent = ProfileEvent & { reservationsSoldOut: boolean }

type Props = {
  /** O pai monta o diálogo aberto e desmonta ao fechar: cada abertura começa do zero. */
  onClose: () => void
  barName: string
  /** Só jogos que ainda não começaram. Esgotado aparece, sem escolha. */
  events: ReservableEvent[]
  initialEventId: string | null
  houseOffer: string | null
}

/**
 * Pedido de reserva a partir do perfil do bar (WEB-124).
 *
 * O resumo fica colado no botão de envio e acompanha o formulário: o torcedor
 * vê jogo, horário, quantidade e oferta antes de mandar, sem um passo a mais.
 */
export function ReservationRequestDialog({
  onClose,
  barName,
  events,
  initialEventId,
  houseOffer
}: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const ids = useId()
  const [eventId, setEventId] = useState(() => {
    const open = events.filter((event) => !event.reservationsSoldOut)
    return (
      open.find((event) => event.id === initialEventId)?.id ?? open[0]?.id ?? ''
    )
  })
  const [partySize, setPartySize] = useState(2)
  const [note, setNote] = useState('')
  // Um por pedido pretendido. Só muda quando o servidor respondeu: depois de
  // falha de rede não se sabe se o pedido chegou, e repetir precisa ser o
  // mesmo pedido.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<FanReservation | null>(null)

  const selected = events.find(
    (event) => event.id === eventId && !event.reservationsSoldOut
  )
  const noteLength = reservationNoteLength(normalizeReservationNote(note))
  const noteTooLong = noteLength > RESERVATION_NOTE_MAX_LENGTH
  const partySizeValid =
    Number.isInteger(partySize) &&
    partySize >= 1 &&
    partySize <= RESERVATION_PARTY_SIZE_MAX

  const createMutation = useMutation(
    trpc.reservations.create.mutationOptions({
      onSuccess: (reservation) => {
        setCreated(reservation)
        setRequestId(crypto.randomUUID())
        void queryClient.invalidateQueries({
          queryKey: trpc.reservations.mine.queryKey()
        })
        // Reserva marca presença e esconde "Vou assistir aqui".
        void queryClient.invalidateQueries({
          queryKey: trpc.pubs.getById.queryKey()
        })
      }
    })
  )

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selected || !partySizeValid || noteTooLong) return
    if (createMutation.isPending) return
    setError(null)
    createMutation.mutate(
      {
        requestId,
        eventId: selected.id,
        partySize,
        note: normalizeReservationNote(note)
      },
      {
        onError: (err) => {
          if (wasAnsweredByServer(err)) setRequestId(crypto.randomUUID())
          setError(getCreateErrorMessage(err, selected.startsAt))
          // Esgotou enquanto o perfil estava aberto: o perfil precisa saber.
          if (errorCode(err) === 'UNPROCESSABLE_CONTENT') {
            void queryClient.invalidateQueries({
              queryKey: trpc.pubs.getById.queryKey()
            })
          }
        }
      }
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="onside-dialog max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto p-5 sm:max-w-lg sm:p-6">
        <DialogTitle className="onside-display text-2xl">
          {created ? 'Pedido enviado' : 'Reservar mesa'}
        </DialogTitle>
        <DialogDescription className="mt-1 text-[var(--onside-muted)] text-sm">
          {barName}
        </DialogDescription>

        {created ? (
          <div role="status" className="mt-4 space-y-4">
            <p className="text-sm">{PENDING_NOTICE}</p>
            {created.code ? (
              <div className="border-[1.5px] border-[var(--onside-line)] p-4 text-center">
                <p className="onside-kicker">Seu código</p>
                <p className="mt-1 font-[family-name:var(--onside-mono)] font-bold text-3xl tracking-[0.2em]">
                  {created.code}
                </p>
                {created.window ? (
                  <p className="mt-2 text-[var(--onside-muted)] text-xs">
                    Vale no bar de {formatDateTime(created.window.opensAt)} até{' '}
                    {formatDateTime(created.window.closesAt)}.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Link
              to="/dashboard/reservations"
              className="onside-btn onside-btn-acid onside-btn-full min-h-11"
            >
              Ver minhas reservas
            </Link>
          </div>
        ) : (
          <form
            method="post"
            onSubmit={handleSubmit}
            noValidate
            className="mt-4 space-y-4"
          >
            <fieldset>
              <legend className="onside-label">Jogo</legend>
              <div className="space-y-2">
                {events.map((event) => (
                  <label
                    key={event.id}
                    className="flex cursor-pointer items-center gap-3 border-[1.5px] border-[var(--onside-line)] p-3 has-[:checked]:border-[var(--onside-ink)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--onside-ink)]"
                  >
                    <input
                      type="radio"
                      name={`${ids}-event`}
                      value={event.id}
                      checked={event.id === eventId}
                      disabled={event.reservationsSoldOut}
                      onChange={() => setEventId(event.id)}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block font-semibold">
                        {formatMatchup(event)}
                      </span>
                      <span className="block text-[var(--onside-muted)] text-xs">
                        {formatDayLabel(event.startsAt)} ·{' '}
                        {formatEventTime(event.startsAt)}
                      </span>
                      {event.reservationsSoldOut ? (
                        <span className="block font-semibold text-xs">
                          {SOLD_OUT_MESSAGE}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor={`${ids}-party`} className="onside-label">
                Quantas pessoas
              </label>
              <input
                id={`${ids}-party`}
                type="number"
                inputMode="numeric"
                min={1}
                max={RESERVATION_PARTY_SIZE_MAX}
                value={Number.isNaN(partySize) ? '' : partySize}
                onChange={(e) => setPartySize(e.target.valueAsNumber)}
                className="onside-input w-28"
                aria-invalid={partySizeValid ? undefined : true}
                aria-describedby={`${ids}-party-hint`}
              />
              <p
                id={`${ids}-party-hint`}
                className={
                  partySizeValid
                    ? 'mt-1.5 text-[var(--onside-muted)] text-xs'
                    : 'onside-field-error'
                }
              >
                De 1 a {RESERVATION_PARTY_SIZE_MAX} pessoas. Para grupos
                maiores, fale com o bar.
              </p>
            </div>

            <div>
              <label htmlFor={`${ids}-note`} className="onside-label">
                Observação (opcional)
              </label>
              <textarea
                id={`${ids}-note`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="onside-textarea"
                aria-invalid={noteTooLong ? true : undefined}
                aria-describedby={`${ids}-note-count`}
              />
              <p
                id={`${ids}-note-count`}
                className={`mt-1.5 text-right font-[family-name:var(--onside-mono)] text-xs tabular-nums ${noteTooLong ? 'text-[var(--onside-live-text)]' : 'text-[var(--onside-muted)]'}`}
              >
                {noteLength}/{RESERVATION_NOTE_MAX_LENGTH}
              </p>
            </div>

            {selected ? (
              <section
                aria-labelledby={`${ids}-summary`}
                className="bg-[var(--onside-stone)] p-4 text-sm"
              >
                <h3 id={`${ids}-summary`} className="onside-kicker mb-2">
                  Resumo do pedido
                </h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="text-[var(--onside-muted)]">Jogo</dt>
                  <dd>{formatMatchup(selected)}</dd>
                  <dt className="text-[var(--onside-muted)]">Data</dt>
                  <dd>{formatDayLabel(selected.startsAt)}</dd>
                  <dt className="text-[var(--onside-muted)]">Horário</dt>
                  <dd>{formatEventTime(selected.startsAt)}</dd>
                  <dt className="text-[var(--onside-muted)]">Pessoas</dt>
                  <dd>{partySizeValid ? partySize : '—'}</dd>
                  {houseOffer ? (
                    <>
                      <dt className="text-[var(--onside-muted)]">Oferta</dt>
                      <dd className="[overflow-wrap:anywhere]">{houseOffer}</dd>
                    </>
                  ) : null}
                </dl>
                <p className="mt-3 font-semibold">{PENDING_NOTICE}</p>
              </section>
            ) : null}

            {error ? (
              <p className="onside-field-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={
                createMutation.isPending ||
                !selected ||
                !partySizeValid ||
                noteTooLong
              }
              className="onside-btn onside-btn-acid onside-btn-full min-h-12 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
