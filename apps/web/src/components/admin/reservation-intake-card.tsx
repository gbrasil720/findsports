import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useId, useState } from 'react'
import type { PlanState } from './admin-model'
import { PaidFeatureCard } from './paid-feature-card'

type Props = {
  /** Interruptor gravado. Continua existindo mesmo sem Elite. */
  acceptsReservations: boolean
  /** Só para avisar que a oferta some do perfil com o recebimento desligado. */
  hasHouseOffer: boolean
  plan: PlanState
  isSaving: boolean
  saveError: string | null
  /** Rejeita quando o servidor recusa. */
  onChange: (acceptsReservations: boolean) => Promise<unknown>
}

/**
 * Interruptor de recebimento de reservas (WEB-131).
 *
 * Elite diz que o bar pode; este card diz se ele quer. Desligado é o padrão.
 * O servidor confere o plano de novo antes de ligar.
 */
export function ReservationIntakeCard({ plan, ...intake }: Props) {
  return (
    <PaidFeatureCard
      id="admin-reservation-intake"
      tier="elite"
      title="Reservas pela Onside"
      description="Ligado, o torcedor pode pedir mesa pelo perfil do seu bar e a oferta da casa aparece junto. Desligado, o perfil mostra só o contato e a rota."
      plan={plan}
      loadingLabel="Carregando recebimento de reservas…"
      skeleton={<Skeleton className="h-11 w-64" />}
      locked={
        <p className="text-sm opacity-90">
          Com o Elite, você decide se recebe pedidos de reserva pelo perfil.
        </p>
      }
    >
      {/* O interruptor fica montado mesmo sem Elite: quem perdeu o plano com
          ele ligado precisa conseguir desligar, e o anúncio do resultado não
          pode sumir junto com o componente. */}
      {(eligible) => <IntakeSwitch {...intake} eligible={eligible} />}
    </PaidFeatureCard>
  )
}

function IntakeSwitch({
  acceptsReservations,
  hasHouseOffer,
  eligible,
  isSaving,
  saveError,
  onChange
}: Omit<Props, 'plan'> & { eligible: boolean }) {
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

  // Ligado sem Elite não recebe pedido nenhum: aparece pausado, em cinza, e
  // continua clicável para desligar (WEB-353).
  const paused = !eligible && acceptsReservations
  const receiving = eligible && acceptsReservations

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
            receiving
              ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
              : 'bg-[var(--onside-paper)] text-[var(--onside-muted)]'
          }`}
        >
          <span
            aria-hidden="true"
            className="grid size-4 place-items-center border border-current text-[10px] leading-none"
          >
            {receiving ? '✓' : ''}
          </span>
          <span className="onside-kicker text-[10px]">
            {isSaving
              ? 'Salvando…'
              : paused
                ? 'Pausado (sem Elite)'
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
