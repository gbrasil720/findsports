import {
  ARRIVAL_UNDO_WINDOW_MS,
  CODE_ALPHABET,
  normalizeReservationCode,
  RESERVATION_CODE_LENGTH
} from '@findsports_oficial/db/reservation-code'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useUndoCountdown } from '@/components/admin/use-undo-countdown'
import { useMinuteNow } from '@/components/app/minute-tick'
import { Beer, Close } from '@/components/landing/v3/icons'
import {
  CODE_NOT_FOUND_MESSAGE,
  formatDateTime,
  getAllValidatedMessage,
  getArrivalBlocker,
  getArrivalErrorMessage,
  getCounterLabel,
  getGameTitle,
  getLookupErrorMessage,
  getUndoErrorMessage,
  type ValidatedReservation,
  wasAnsweredByServer
} from '@/domain/reservation-validation'
import { useTRPC, useTRPCClient } from '@/utils/trpc'

/*
 * "Validar código" da casca do painel (protótipo: `openVal`, `doVal`,
 * `resetVal`). Seis caixas no alfabeto do código; a sexta letra busca
 * (`lookup`), a tela mostra quem é, o jogo e a oferta, e "Confirmar chegada"
 * grava (`registerArrival`), com o desfazer curto. A confirmação é a do painel
 * antigo: cada validação custa a oferta ao bar. `/admin/validate` continua
 * para o QR, os códigos antigos e o lançamento pela comanda.
 */

const EMPTY = Array.from({ length: RESERVATION_CODE_LENGTH }, () => '')
const EXCLUDED_HINT = 'O código não tem O, 0, I, 1 nem L.'

export function ValidarCodigo({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // O `showModal` foca o primeiro botão (Fechar); a caixa abre para digitar.
      dialog.querySelector('input')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: o Esc do teclado já fecha o `<dialog>` nativo; o clique é só o do fundo.
    <dialog
      ref={ref}
      className="pn-val"
      aria-labelledby="pn-val-t"
      // Só o fechamento desta folha: o React repassa o `close` de um
      // `<dialog>` de dentro (uma confirmação) para cá.
      onClose={(event) => {
        if (event.target === ref.current) onClose()
      }}
      // Clique no fundo (fora da caixa) fecha, como no protótipo.
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
    >
      {open ? <Conteudo onClose={onClose} /> : null}
    </dialog>
  )
}

type Arrival = { useId: string; expiresAt: number }

function Conteudo({ onClose }: { onClose: () => void }) {
  const trpc = useTRPC()
  const { reservationValidation } = useTRPCClient()
  const now = useMinuteNow()

  const subscription = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })
  const elite = subscription.data?.currentPlan === 'elite'
  const openCodes = useQuery({
    ...trpc.barReservations.hasValidatable.queryOptions(),
    enabled: subscription.isSuccess && !elite,
    meta: { errorToast: false }
  })

  const [chars, setChars] = useState<string[]>(EMPTY)
  const [message, setMessage] = useState<string | null>(null)
  const [found, setFound] = useState<ValidatedReservation | null>(null)
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const [pending, setPending] = useState<'lookup' | 'arrival' | 'undo' | null>(
    null
  )
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  // O mesmo id até o servidor responder: toque duplo conta uma chegada só.
  const requestId = useRef<string | null>(null)
  const busy = useRef(false)

  const secondsLeft = useUndoCountdown(arrival?.expiresAt ?? null, () =>
    setArrival(null)
  )

  const run = async (
    kind: NonNullable<typeof pending>,
    operation: () => Promise<void>
  ) => {
    if (busy.current) return
    busy.current = true
    setPending(kind)
    try {
      await operation()
    } finally {
      busy.current = false
      setPending(null)
    }
  }

  const reset = () => {
    setChars(EMPTY)
    setMessage(null)
    setFound(null)
    setArrival(null)
    requestId.current = null
    boxes.current[0]?.focus()
  }

  const lookup = (code: string) =>
    run('lookup', async () => {
      setMessage(null)
      try {
        const result = await reservationValidation.lookup.mutate({ code })
        if (!result) {
          setMessage(CODE_NOT_FOUND_MESSAGE)
          return
        }
        setFound(result)
      } catch (error) {
        setMessage(getLookupErrorMessage(error))
      }
    })

  const register = (target: ValidatedReservation) =>
    run('arrival', async () => {
      setMessage(null)
      requestId.current ??= crypto.randomUUID()
      try {
        const result = await reservationValidation.registerArrival.mutate({
          codeId: target.codeId,
          requestId: requestId.current
        })
        requestId.current = null
        setFound({
          ...target,
          usedCount: result.usedCount,
          maxUses: result.maxUses
        })
        setArrival(
          result.undone
            ? null
            : {
                useId: result.useId,
                expiresAt: Date.now() + ARRIVAL_UNDO_WINDOW_MS
              }
        )
        if (result.undone)
          setMessage(
            `Essa validação já tinha sido desfeita. ${getCounterLabel(result.usedCount, result.maxUses)}.`
          )
      } catch (error) {
        if (wasAnsweredByServer(error)) requestId.current = null
        setMessage(getArrivalErrorMessage(error, target, Date.now()))
      }
    })

  const undo = (target: ValidatedReservation, last: Arrival) =>
    run('undo', async () => {
      setMessage(null)
      try {
        const result = await reservationValidation.undoArrival.mutate({
          useId: last.useId
        })
        setFound({
          ...target,
          usedCount: result.usedCount,
          maxUses: result.maxUses
        })
        setArrival(null)
        setMessage(
          `Validação desfeita. ${getCounterLabel(result.usedCount, result.maxUses)}.`
        )
      } catch (error) {
        if (wasAnsweredByServer(error)) setArrival(null)
        setMessage(getUndoErrorMessage(error))
      }
    })

  /** Põe o que foi digitado (ou colado) a partir da caixa `at`. */
  const type = (at: number, raw: string) => {
    // Caixa já cheia que recebe outra letra: vale a nova.
    const incoming =
      raw.length === 2 && raw[0] === chars[at] ? raw.slice(1) : raw
    const typed = [...normalizeReservationCode(incoming)]
    const valid = typed.filter((c) => CODE_ALPHABET.includes(c))
    const next = [...chars]
    valid.slice(0, RESERVATION_CODE_LENGTH - at).forEach((c, i) => {
      next[at + i] = c
    })
    if (raw === '') next[at] = ''
    setChars(next)
    setMessage(valid.length < typed.length ? EXCLUDED_HINT : null)
    const code = next.join('')
    if (code.length === RESERVATION_CODE_LENGTH) {
      void lookup(code)
      return
    }
    if (valid.length) {
      const empty = next.findIndex((c, i) => i > at && !c)
      boxes.current[empty === -1 ? at : empty]?.focus()
    }
  }

  const key = (at: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !chars[at] && at > 0) {
      event.preventDefault()
      const next = [...chars]
      next[at - 1] = ''
      setChars(next)
      boxes.current[at - 1]?.focus()
    } else if (event.key === 'ArrowLeft' && at > 0) {
      boxes.current[at - 1]?.focus()
    } else if (event.key === 'ArrowRight' && at < RESERVATION_CODE_LENGTH - 1) {
      boxes.current[at + 1]?.focus()
    } else if (event.key === 'Enter') {
      submit()
    }
  }

  const submit = () => {
    const missing = chars.filter((c) => !c).length
    if (missing) {
      setMessage(
        `${missing === 1 ? 'Falta 1 letra' : `Faltam ${missing} letras`}. O código tem ${RESERVATION_CODE_LENGTH}, sem O, 0, I, 1 nem L.`
      )
      boxes.current[chars.findIndex((c) => !c)]?.focus()
      return
    }
    void lookup(chars.join(''))
  }

  const eligible = elite || openCodes.data === true
  const checking =
    subscription.isLoading ||
    (!elite && subscription.isSuccess && openCodes.isLoading)
  const failed = subscription.isError || (!elite && openCodes.isError)

  const blocker = found ? getArrivalBlocker(found, now) : null
  const full = found ? found.usedCount >= found.maxUses : false
  const game = found ? getGameTitle(found.event) : ''

  return (
    <div className="pn-val-in">
      <div className="pn-val-top">
        <div>
          <h2 className="pn-disp" id="pn-val-t">
            Validar código
          </h2>
          <p>Digite as 6 letras que o torcedor mostra no celular.</p>
        </div>
        <button
          type="button"
          className="pn-btn pn-ghost pn-ic"
          onClick={onClose}
          aria-label="Fechar"
        >
          <Close size={20} />
        </button>
      </div>

      {checking ? (
        <p className="pn-val-note" role="status">
          Conferindo o seu plano…
        </p>
      ) : failed ? (
        <div className="pn-val-note" role="alert">
          <p>Não foi possível conferir o seu plano.</p>
          <button
            type="button"
            className="pn-btn pn-ink pn-sm"
            onClick={() => {
              void subscription.refetch()
              void openCodes.refetch()
            }}
          >
            Tentar de novo
          </button>
        </div>
      ) : !eligible ? (
        <div className="pn-val-note">
          <p>
            <b>Disponível no plano Elite.</b> Com o Elite, quem marca “Vou
            assistir aqui” recebe um código, e você valida aqui quem chegou.
          </p>
          <Link
            to="/plan"
            search={{ origin: 'admin' }}
            className="pn-btn pn-ink pn-sm"
            onClick={onClose}
          >
            Ver planos
          </Link>
        </div>
      ) : found ? (
        <div
          className={`pn-vres${arrival || (full && !blocker) ? ' is-ok' : ''}`}
          role="status"
        >
          {arrival ? (
            <b className="pn-vres-t">Código validado</b>
          ) : (
            <span className="pn-vres-code">{found.code}</span>
          )}
          <p className="pn-vres-who">
            <strong>{found.guestName}</strong> · {game}
            {found.event.championship !== game
              ? ` · ${found.event.championship}`
              : ''}{' '}
            · {formatDateTime(found.event.startsAt)}
          </p>
          <p className="pn-vres-offer">
            <Beer size={20} />
            {found.offerSnapshot
              ? arrival
                ? `Libere a oferta: ${found.offerSnapshot}`
                : `Oferta da casa: ${found.offerSnapshot}`
              : 'O bar não tinha oferta quando a pessoa marcou.'}
          </p>
          {found.maxUses > 1 || found.usedCount > 0 ? (
            <p className="pn-vres-n">
              {getCounterLabel(found.usedCount, found.maxUses)}
            </p>
          ) : null}
          {blocker ? (
            <p className="pn-vres-warn">
              <b>{blocker.title}.</b> {blocker.detail}
            </p>
          ) : full && !arrival ? (
            <p className="pn-vres-warn">
              {getAllValidatedMessage(found.maxUses)}
            </p>
          ) : null}
          {message ? <p className="pn-vres-err">{message}</p> : null}
          <div className="pn-val-acts">
            {!blocker && !full ? (
              <button
                type="button"
                className="pn-btn pn-acid pn-sm"
                disabled={pending !== null}
                onClick={() => void register(found)}
                // biome-ignore lint/a11y/noAutofocus: o próximo passo é este botão.
                autoFocus
              >
                {pending === 'arrival'
                  ? 'Validando…'
                  : arrival
                    ? 'Validar mais uma pessoa'
                    : 'Confirmar chegada'}
              </button>
            ) : null}
            {arrival ? (
              <button
                type="button"
                className="pn-btn pn-ghost pn-sm"
                disabled={pending !== null}
                onClick={() => void undo(found, arrival)}
                aria-label="Desfazer a validação"
              >
                {pending === 'undo' ? 'Desfazendo…' : 'Desfazer'}
                <span className="pn-mono" aria-hidden="true">
                  {secondsLeft}s
                </span>
              </button>
            ) : null}
            <span className="pn-sp" />
            <button
              type="button"
              className="pn-btn pn-ink pn-sm"
              onClick={reset}
              // biome-ignore lint/a11y/noAutofocus: sem o que confirmar, o próximo passo é outro código.
              autoFocus={Boolean(blocker || full)}
            >
              Validar outro
            </button>
          </div>
        </div>
      ) : (
        <>
          <fieldset className="pn-boxes">
            <legend className="sr-only">Código do torcedor</legend>
            {chars.map((c, i) => (
              <input
                // biome-ignore lint/suspicious/noArrayIndexKey: casas fixas, uma por letra.
                key={i}
                ref={(el) => {
                  boxes.current[i] = el
                }}
                value={c}
                readOnly={pending === 'lookup'}
                maxLength={RESERVATION_CODE_LENGTH}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={`Letra ${i + 1}`}
                aria-invalid={message ? true : undefined}
                // biome-ignore lint/a11y/noAutofocus: a caixa abre para digitar.
                autoFocus={i === 0}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => type(i, event.currentTarget.value)}
                onKeyDown={(event) => key(i, event)}
              />
            ))}
          </fieldset>
          <p className="pn-val-msg" role="status">
            {pending === 'lookup' ? 'Buscando o código…' : message}
          </p>
          <div className="pn-val-acts">
            <Link to="/admin/validate" className="pn-lnk" onClick={onClose}>
              Abrir a página de validação
            </Link>
            <span className="pn-sp" />
            <button
              type="button"
              className="pn-btn pn-acid pn-sm"
              disabled={pending !== null}
              onClick={submit}
            >
              {pending === 'lookup' ? 'Buscando…' : 'Validar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
