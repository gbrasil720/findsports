import {
  ARRIVAL_UNDO_WINDOW_MS,
  isReservationCodeComplete,
  normalizeReservationCode,
  RESERVATION_CODE_LENGTH
} from '@findsports_oficial/db/reservation-code'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import {
  type ArrivalResult,
  CODE_NOT_FOUND_MESSAGE,
  getArrivalBlocker,
  getArrivalErrorMessage,
  getCounterLabel,
  getLookupErrorMessage,
  getUndoErrorMessage,
  type UndoResult,
  type ValidatedReservation,
  wasAnsweredByServer
} from '@/domain/reservation-validation'
import { ArrivalConfirmDialog } from './arrival-confirm-dialog'
import { ReservationCodeInput } from './reservation-code-input'
import { ReservationSummary } from './reservation-summary'
import { useUndoCountdown } from './use-undo-countdown'

/**
 * `eligible` é Elite vigente (`getMySubscription().currentPlan`) ou reserva
 * em aberto (`barReservations.hasValidatable`, WEB-341). É só para decidir o que
 * desenhar: cada procedimento confere de novo.
 */
export type ValidationAccess =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; eligible: boolean; elite: boolean }

type Props = {
  access: ValidationAccess
  /** Relógio de minuto: a janela abre e fecha com a tela aberta. */
  now: number
  /** `null`: o código não resolve para este bar. */
  lookup: (input: { code: string }) => Promise<ValidatedReservation | null>
  registerArrival: (input: {
    codeId: string
    requestId: string
  }) => Promise<ArrivalResult>
  undoArrival: (input: { useId: string }) => Promise<UndoResult>
  /**
   * O código que veio no link (`?code=`, o QR do app do torcedor): a tela já
   * abre buscando.
   */
  initialCode?: string
  /** Só os testes mudam. */
  undoWindowMs?: number
}

const TITLE_ID = 'code-validation-title'

/**
 * Validação de código de reserva (WEB-126).
 *
 * Sem seletor de bar: o código resolve o bar, e o servidor só resolve código
 * de jogo do bar de quem está logado.
 */
export function CodeValidation({ access, ...panel }: Props) {
  // Sem Elite, a tela só abre pelas reservas já aceitas (WEB-341): dizer
  // "Plano Elite" ali contava ao dono um plano que ele não tem.
  const openOnly = access.status === 'ready' && access.eligible && !access.elite
  return (
    <section
      className="pn-card pn-cv"
      aria-labelledby={TITLE_ID}
      aria-busy={access.status === 'loading' || undefined}
    >
      <p className="pn-k">{openOnly ? 'Códigos em aberto' : 'Plano Elite'}</p>
      <h2 id={TITLE_ID} className="pn-cv-t">
        Código do torcedor
      </h2>
      <p className="pn-note">
        Digite o código que o torcedor mostra no celular. Validado, a oferta da
        casa é dele. Cada código vale uma vez.
      </p>
      {openOnly ? (
        <p className="pn-note">
          Seu plano não emite códigos novos. Os que já saíram continuam valendo,
          e dá para validar até a janela de cada jogo fechar.
        </p>
      ) : null}

      <div className="pn-cv-b">
        {access.status === 'loading' ? (
          <p className="pn-note" role="status">
            Conferindo o seu plano…
          </p>
        ) : access.status === 'error' ? (
          <div className="pn-err" role="alert">
            <p>Não foi possível conferir o seu plano.</p>
            <button
              type="button"
              onClick={access.retry}
              className="pn-btn pn-ghost pn-sm"
            >
              Tentar de novo
            </button>
          </div>
        ) : access.eligible ? (
          <ValidationPanel {...panel} />
        ) : (
          <LockedValidation />
        )}
      </div>
    </section>
  )
}

function LockedValidation() {
  return (
    <div className="pn-lock">
      <span>
        <b>Disponível no plano Elite</b>
        Com o Elite, quem marca “Vou assistir aqui” recebe um código, e você
        registra aqui quem chegou.
      </span>
      <Link
        to="/plan"
        search={{ origin: 'admin' }}
        className="pn-btn pn-ink pn-sm"
      >
        Ver planos
      </Link>
    </div>
  )
}

type FocusTarget = 'input' | 'summary' | 'action'

type LastArrival = { useId: string; expiresAt: number }

function ValidationPanel({
  now,
  lookup,
  registerArrival,
  undoArrival,
  initialCode,
  undoWindowMs = ARRIVAL_UNDO_WINDOW_MS
}: Omit<Props, 'access'>) {
  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  const [code, setCode] = useState(() =>
    normalizeReservationCode(initialCode ?? '')
  )
  const [reservation, setReservation] = useState<ValidatedReservation | null>(
    null
  )
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [pending, setPending] = useState<'lookup' | 'arrival' | 'undo' | null>(
    null
  )
  const [actionError, setActionError] = useState<string | null>(null)
  const [lastArrival, setLastArrival] = useState<LastArrival | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const summaryRef = useRef<HTMLHeadingElement>(null)
  const arrivalRef = useRef<HTMLButtonElement>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const resetRef = useRef<HTMLButtonElement>(null)
  // Um id por chegada PRETENDIDA. Só troca quando o servidor responde: toque
  // duplo e reenvio depois de queda de rede repetem o mesmo id, e o servidor
  // conta uma chegada só.
  const requestIdRef = useRef<string | null>(null)
  // Trava síncrona: `disabled` só vale depois do render, e dois toques cabem
  // no mesmo quadro.
  const busyRef = useRef(false)

  // Foco depois do render: o destino pode nem existir antes dele.
  useEffect(() => {
    if (!focusTarget) return
    const target =
      focusTarget === 'input'
        ? inputRef.current
        : focusTarget === 'summary'
          ? summaryRef.current
          : arrivalRef.current && !arrivalRef.current.disabled
            ? arrivalRef.current
            : resetRef.current
    target?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  const secondsLeft = useUndoCountdown(lastArrival?.expiresAt ?? null, () => {
    // O botão vai sumir: quem estava nele não pode ficar sem foco.
    if (document.activeElement === undoRef.current) setFocusTarget('action')
    setLastArrival(null)
  })

  /** Uma operação por vez; a trava cobre o intervalo até o próximo render. */
  const run = async (
    kind: NonNullable<typeof pending>,
    operation: () => Promise<void>
  ) => {
    if (busyRef.current) return
    busyRef.current = true
    setPending(kind)
    try {
      await operation()
    } finally {
      busyRef.current = false
      setPending(null)
    }
  }

  const clearResult = () => {
    setConfirming(false)
    setReservation(null)
    setLastArrival(null)
    setActionError(null)
    requestIdRef.current = null
  }

  const updateCounter = ({ usedCount, maxUses }: UndoResult) =>
    setReservation((current) => current && { ...current, usedCount, maxUses })

  const handleLookup = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    lookupCode()
  }

  // O código do link busca sozinho, uma vez; incompleto, fica no campo.
  const linkLookup = useRef(isReservationCodeComplete(code))
  useEffect(() => {
    if (!linkLookup.current) return
    linkLookup.current = false
    lookupCode()
  })

  const lookupCode = () => {
    // Código incompleto não gasta tentativa no servidor.
    if (!isReservationCodeComplete(code)) {
      setLookupError(
        `O código tem ${RESERVATION_CODE_LENGTH} letras e números.`
      )
      setFocusTarget('input')
      return
    }

    void run('lookup', async () => {
      setLookupError(null)
      setAnnouncement('')
      clearResult()
      try {
        const found = await lookup({ code })
        if (!found) {
          setLookupError(CODE_NOT_FOUND_MESSAGE)
          setFocusTarget('input')
          return
        }
        setReservation(found)
        setCode('')
        // Quem ouve a tela precisa saber, na mesma frase, que não vai poder
        // registrar ninguém.
        const blocker = getArrivalBlocker(found, now)
        setAnnouncement(
          [
            `Código de ${found.guestName} encontrado.`,
            `${getCounterLabel(found.usedCount, found.maxUses)}.`,
            blocker && `${blocker.title}. ${blocker.detail}`
          ]
            .filter(Boolean)
            .join(' ')
        )
        // Foco no título, não no `+1`: o leitor de tela começa por quem é a
        // reserva. No Safari o Tab daqui cai no menu da conta porque, por
        // padrão, ele só visita campos e menus pop-up; Option+Tab chega ao
        // `+1`. Vale para todo botão do site, não só este (WEB-134).
        setFocusTarget('summary')
      } catch (error) {
        setLookupError(getLookupErrorMessage(error))
        setFocusTarget('input')
      }
    })
  }

  const handleArrival = (target: ValidatedReservation) =>
    run('arrival', async () => {
      setConfirming(false)
      setActionError(null)
      requestIdRef.current ??= crypto.randomUUID()
      try {
        const result = await registerArrival({
          codeId: target.codeId,
          requestId: requestIdRef.current
        })
        requestIdRef.current = null
        updateCounter(result)
        const counter = getCounterLabel(result.usedCount, result.maxUses)
        setLastArrival(
          result.undone
            ? null
            : { useId: result.useId, expiresAt: Date.now() + undoWindowMs }
        )
        setAnnouncement(
          result.undone
            ? `Essa validação já tinha sido desfeita. ${counter}.`
            : result.usedCount >= result.maxUses
              ? 'Código validado. Libere a oferta da casa.'
              : `Validado. ${counter}.`
        )
        setFocusTarget('action')
      } catch (error) {
        if (wasAnsweredByServer(error)) requestIdRef.current = null
        setActionError(getArrivalErrorMessage(error, target, Date.now()))
      }
    })

  const handleUndo = (arrival: LastArrival) =>
    run('undo', async () => {
      setActionError(null)
      try {
        const result = await undoArrival({ useId: arrival.useId })
        updateCounter(result)
        setLastArrival(null)
        setAnnouncement(
          `Validação desfeita. ${getCounterLabel(result.usedCount, result.maxUses)}.`
        )
        setFocusTarget('action')
      } catch (error) {
        if (wasAnsweredByServer(error)) {
          setLastArrival(null)
          setFocusTarget('action')
        }
        setActionError(getUndoErrorMessage(error))
      }
    })

  const handleReset = () => {
    clearResult()
    setLookupError(null)
    setAnnouncement('')
    setCode('')
    setFocusTarget('input')
  }

  const canRegister =
    reservation !== null && getArrivalBlocker(reservation, now) === null
  const isFull =
    reservation !== null && reservation.usedCount >= reservation.maxUses

  return (
    <div className="pn-cv-p">
      <form method="post" onSubmit={handleLookup} noValidate>
        <label htmlFor={fieldId} className="pn-fl-l">
          Código
        </label>
        <div className="pn-cv-row">
          <ReservationCodeInput
            ref={inputRef}
            id={fieldId}
            value={code}
            onChange={(next) => {
              setCode(next)
              setLookupError(null)
            }}
            invalid={lookupError !== null}
            describedBy={lookupError ? `${hintId} ${errorId}` : hintId}
          />
          <button
            type="submit"
            disabled={pending === 'lookup'}
            className="pn-btn pn-ink"
          >
            {pending === 'lookup' ? 'Buscando…' : 'Buscar código'}
          </button>
        </div>
        <p id={hintId} className="pn-hint">
          {RESERVATION_CODE_LENGTH} letras e números. Maiúsculas, espaços e
          hífens não fazem diferença.
        </p>
        {lookupError ? (
          <p id={errorId} className="pn-ferr" role="alert">
            {lookupError}
          </p>
        ) : null}
      </form>

      {/* Sempre montada: região que nasce junto com o texto não é anunciada. */}
      <p className="pn-cv-ann" role="status" aria-live="polite">
        {announcement}
      </p>

      {reservation ? (
        <ReservationSummary
          titleId={`${fieldId}-summary`}
          titleRef={summaryRef}
          reservation={reservation}
          now={now}
          error={actionError}
        >
          {/* Completa, não há mais `+1`: sobra o desfazer curto (WEB-299). */}
          {canRegister && !isFull ? (
            <button
              ref={arrivalRef}
              type="button"
              onClick={() => {
                setActionError(null)
                setConfirming(true)
              }}
              disabled={pending !== null}
              className="pn-btn pn-acid"
            >
              {pending === 'arrival' ? 'Validando…' : 'Validar código'}
            </button>
          ) : null}
          {lastArrival ? (
            <button
              ref={undoRef}
              type="button"
              onClick={() => void handleUndo(lastArrival)}
              disabled={pending !== null}
              aria-label="Desfazer a validação"
              className="pn-btn pn-ghost"
            >
              {pending === 'undo' ? 'Desfazendo…' : 'Desfazer'}
              <span className="pn-mono" aria-hidden="true">
                {secondsLeft}s
              </span>
            </button>
          ) : null}
          <button
            ref={resetRef}
            type="button"
            onClick={handleReset}
            className="pn-btn pn-ghost"
          >
            Validar outro código
          </button>

          <ArrivalConfirmDialog
            open={confirming && canRegister && !isFull}
            reservation={reservation}
            onConfirm={() => void handleArrival(reservation)}
            onCancel={() => setConfirming(false)}
          />
        </ReservationSummary>
      ) : null}
    </div>
  )
}
