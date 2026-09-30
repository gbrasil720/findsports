import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useId, useState } from 'react'
import type { EliteAccess } from './admin-model'
import { EliteLockedCallout, PlanCheckError } from './elite-callouts'

type Props = {
  /** Interruptor gravado. Continua existindo mesmo sem Elite. */
  acceptsReservations: boolean
  /** Só para avisar que a oferta some do perfil com o recebimento desligado. */
  hasHouseOffer: boolean
  access: EliteAccess
  isSaving: boolean
  saveError: string | null
  /** Rejeita quando o servidor recusa. */
  onChange: (acceptsReservations: boolean) => Promise<unknown>
}

const TITLE_ID = 'admin-reservation-intake-title'

/**
 * Interruptor de recebimento de reservas (WEB-131).
 *
 * Elite diz que o bar pode; este card diz se ele quer. Desligado é o padrão.
 * O servidor confere o plano de novo antes de ligar.
 */
export function ReservationIntakeCard({
  acceptsReservations,
  hasHouseOffer,
  access,
  isSaving,
  saveError,
  onChange
}: Props) {
  return (
    <section
      id="admin-reservation-intake"
      className="onside-panel scroll-mt-6 p-5 md:p-6"
      aria-labelledby={TITLE_ID}
    >
      <p className="onside-kicker mb-2">Plano Elite</p>
      <h2 id={TITLE_ID} className="onside-display text-2xl">
        Reservas pela Onside
      </h2>
      <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm">
        Ligado, o torcedor pode pedir mesa pelo perfil do seu bar e a oferta da
        casa aparece junto. Desligado, o perfil mostra só o contato e a rota.
      </p>

      <div className="mt-5">
        {access.status === 'loading' ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <span className="sr-only">Carregando recebimento de reservas…</span>
            <Skeleton className="h-11 w-64" />
          </div>
        ) : access.status === 'error' ? (
          <PlanCheckError retry={access.retry} />
        ) : (
          // O interruptor fica montado mesmo sem Elite: quem perdeu o plano
          // com ele ligado precisa conseguir desligar, e o anúncio do
          // resultado não pode sumir junto com o componente.
          <div className="space-y-4">
            {access.eligible ? null : (
              <EliteLockedCallout>
                <p className="text-sm opacity-90">
                  Com o Elite, você decide se recebe pedidos de reserva pelo
                  perfil.
                </p>
              </EliteLockedCallout>
            )}
            <IntakeSwitch
              acceptsReservations={acceptsReservations}
              hasHouseOffer={hasHouseOffer}
              eligible={access.eligible}
              isSaving={isSaving}
              saveError={saveError}
              onChange={onChange}
            />
          </div>
        )}
      </div>
    </section>
  )
}

function IntakeSwitch({
  acceptsReservations,
  hasHouseOffer,
  eligible,
  isSaving,
  saveError,
  onChange
}: Omit<Props, 'access'> & { eligible: boolean }) {
  const id = useId()
  const labelId = `${id}-label`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const [result, setResult] = useState<string | null>(null)

  const toggle = async () => {
    const next = !acceptsReservations
    setResult(null)
    try {
      await onChange(next)
      setResult(
        next
          ? 'Recebimento ligado. O perfil já aceita pedidos de reserva.'
          : 'Recebimento desligado. Reservas já feitas continuam valendo.'
      )
    } catch {
      // A mensagem chega por `saveError`, anunciada abaixo.
    }
  }

  const hint = !eligible
    ? acceptsReservations
      ? 'Sem o Elite, o perfil não recebe pedidos. Desligue para não voltar a receber quando o plano voltar.'
      : 'Nenhum pedido chega sem o plano Elite.'
    : acceptsReservations
      ? 'Desligar impede pedidos novos. Reservas já feitas continuam valendo, com o código.'
      : hasHouseOffer
        ? 'Sua oferta da casa está guardada, mas só aparece no perfil com o recebimento ligado.'
        : 'Nenhum pedido chega enquanto estiver desligado.'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={labelId} className="font-semibold text-sm">
          Receber pedidos de reserva
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={acceptsReservations}
          aria-labelledby={labelId}
          aria-describedby={saveError ? `${hintId} ${errorId}` : hintId}
          // Sem Elite, só desligar: o servidor recusa ligar.
          disabled={isSaving || (!eligible && !acceptsReservations)}
          onClick={() => void toggle()}
          className={`flex min-h-11 items-center gap-3 border border-[var(--onside-ink)] px-3 py-2 font-bold text-xs transition-colors disabled:opacity-50 ${
            acceptsReservations
              ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
              : 'bg-[var(--onside-paper)] text-[var(--onside-muted)]'
          }`}
        >
          <span
            aria-hidden="true"
            className="grid size-4 place-items-center border border-current text-[10px] leading-none"
          >
            {acceptsReservations ? '✓' : ''}
          </span>
          <span className="onside-kicker text-[10px]">
            {isSaving
              ? 'Salvando…'
              : acceptsReservations
                ? 'Ligado'
                : 'Desligado'}
          </span>
        </button>
      </div>
      <p id={hintId} className="mt-1.5 text-[var(--onside-muted)] text-xs">
        {hint}
      </p>

      {saveError ? (
        <p id={errorId} className="onside-field-error" role="alert">
          {saveError}
        </p>
      ) : null}
      <p className="mt-2 text-[var(--onside-muted)] text-sm" role="status">
        {result ?? ''}
      </p>
    </div>
  )
}
