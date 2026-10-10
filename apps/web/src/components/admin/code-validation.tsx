import {
  ARRIVAL_UNDO_WINDOW_MS,
  isReservationCodeComplete,
  RESERVATION_CODE_LENGTH
} from '@findsports_oficial/db/reservation-code'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'
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
  | { status: 'ready'; eligible: boolean }

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
  return (
    <section
      className="onside-panel p-5 md:p-6"
      aria-labelledby={TITLE_ID}
      aria-busy={access.status === 'loading' || undefined}
    >
      <p className="onside-kicker mb-2">Plano Elite</p>
      <h2 id={TITLE_ID} className="onside-display text-2xl">
        Código da reserva
      </h2>
      <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm">
        Digite o código que o torcedor mostra no celular e registre cada pessoa
        que chegar. O grupo pode chegar aos poucos: o mesmo código vale até
        completar a reserva.
      </p>

      <div className="mt-5">
        {access.status === 'loading' ? (
          <div className="space-y-3" role="status">
            <span className="sr-only">Conferindo o seu plano…</span>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-12 w-full max-w-md" />
            <Skeleton className="h-11 w-36" />
          </div>
        ) : access.status === 'error' ? (
          <div className="onside-callout onside-callout-danger" role="alert">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">
                Não foi possível conferir o seu plano.
              </p>
            </div>
            <button
              type="button"
              onClick={access.retry}
              className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
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
    <div className="onside-callout onside-callout-stone">
      <CircleInfo
        size={20}
        color="currentColor"
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 font-semibold text-sm">
          Disponível no plano Elite
        </p>
        <p className="text-sm opacity-90">
          Com o Elite, o torcedor reserva pela Onside e você registra aqui quem
          chegou.
        </p>
      </div>
      <Link
        to="/plan"
        search={{ origin: 'admin' }}
        className="onside-btn onside-btn-ink min-h-11 shrink-0 px-4 text-xs"
      >
        Ver planos
        <ArrowRight size={13} color="currentColor" aria-hidden="true" />
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
  undoWindowMs = ARRIVAL_UNDO_WINDOW_MS
}: Omit<Props, 'access'>) {
  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`

  const [code, setCode] = useState('')
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
            `Reserva de ${found.guestName} encontrada.`,
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
            ? `Essa chegada já tinha sido desfeita. ${counter}.`
            : `Chegada registrada. ${counter}.${result.usedCount >= result.maxUses ? ' Reserva completa.' : ''}`
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
          `Chegada desfeita. ${getCounterLabel(result.usedCount, result.maxUses)}.`
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
    <div className="space-y-6">
      <form method="post" onSubmit={handleLookup} noValidate>
        <label htmlFor={fieldId} className="onside-label">
          Código
        </label>
        <div className="flex flex-wrap items-center gap-3">
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
            className="onside-btn onside-btn-ink min-h-12 px-5 text-xs disabled:opacity-50"
          >
            {pending === 'lookup' ? 'Buscando…' : 'Buscar reserva'}
          </button>
        </div>
        <p id={hintId} className="mt-1.5 text-[var(--onside-muted)] text-xs">
          {RESERVATION_CODE_LENGTH} letras e números. Maiúsculas, espaços e
          hífens não fazem diferença.
        </p>
        {lookupError ? (
          <p id={errorId} className="onside-field-error" role="alert">
            {lookupError}
          </p>
        ) : null}
      </form>

      {/* Sempre montada: região que nasce junto com o texto não é anunciada. */}
      <p
        className="min-h-5 font-semibold text-sm"
        role="status"
        aria-live="polite"
      >
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
              className="onside-btn onside-btn-acid min-h-12 px-5 text-sm disabled:opacity-50"
            >
              {pending === 'arrival'
                ? 'Registrando…'
                : 'Registrar chegada (+1)'}
            </button>
          ) : null}
          {lastArrival ? (
            <button
              ref={undoRef}
              type="button"
              onClick={() => void handleUndo(lastArrival)}
              disabled={pending !== null}
              aria-label="Desfazer a última chegada"
              className="onside-btn onside-btn-outline min-h-12 px-4 text-xs disabled:opacity-50"
            >
              {pending === 'undo' ? 'Desfazendo…' : 'Desfazer'}
              <span className="tabular-nums opacity-70" aria-hidden="true">
                {secondsLeft}s
              </span>
            </button>
          ) : null}
          <button
            ref={resetRef}
            type="button"
            onClick={handleReset}
            className="onside-btn onside-btn-ghost min-h-12 px-4 text-xs"
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
