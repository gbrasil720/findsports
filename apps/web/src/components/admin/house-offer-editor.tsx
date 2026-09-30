import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { type FormEvent, useId, useState } from 'react'
import type { PlanState } from './admin-model'
import { PaidFeatureCard } from './paid-feature-card'

type Props = {
  /** Texto gravado. Continua existindo mesmo sem Elite. */
  houseOffer: string | null
  plan: PlanState
  isSaving: boolean
  saveError: string | null
  /** `null` limpa a oferta. Rejeita quando o servidor recusa. */
  onSave: (houseOffer: string | null) => Promise<unknown>
}

/**
 * Oferta da casa no painel (WEB-120).
 *
 * Sem exemplos no placeholder de propósito: a Onside não sugere o que o bar
 * oferece. O texto de apoio diz só onde aparece e de quem é a promessa.
 */
export function HouseOfferEditor({ houseOffer, plan, ...form }: Props) {
  return (
    <PaidFeatureCard
      id="admin-house-offer"
      tier="elite"
      title="Oferta da casa"
      description="O que você oferece a quem chega pela Onside. Aparece no perfil público do seu bar enquanto o recebimento de reservas estiver ligado. A promessa é sua com o cliente: a Onside não define nem confere o conteúdo."
      plan={plan}
      loadingLabel="Carregando oferta da casa…"
      skeleton={
        <>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-11 w-36" />
        </>
      }
      locked={
        houseOffer ? (
          <p className="text-sm opacity-90 [overflow-wrap:anywhere]">
            Sua oferta continua guardada — “{houseOffer}” — mas não aparece no
            perfil enquanto o plano Elite não estiver ativo.
          </p>
        ) : (
          <p className="text-sm opacity-90">
            Com o Elite, você escreve o que oferece a quem chega pela Onside e o
            texto aparece no perfil do bar.
          </p>
        )
      }
    >
      {(eligible) =>
        eligible ? <HouseOfferForm houseOffer={houseOffer} {...form} /> : null
      }
    </PaidFeatureCard>
  )
}

type FormProps = Omit<Props, 'plan'>

function HouseOfferForm({
  houseOffer,
  isSaving,
  saveError,
  onSave
}: FormProps) {
  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const errorId = `${fieldId}-error`
  const [draft, setDraft] = useState(houseOffer ?? '')
  const [saved, setSaved] = useState<'saved' | 'cleared' | null>(null)
  const [stored, setStored] = useState(houseOffer)

  // O valor gravado muda depois do refetch do `getMe`: o rascunho acompanha
  // para o botão voltar a ficar desabilitado sem mudança pendente. A
  // comparação é na renderização, não em efeito: o painel vive dentro de um
  // `<Activity>`, que recria efeitos ao voltar para a aba, e um efeito aqui
  // apagaria o que o dono digitou antes de trocar de aba.
  if (stored !== houseOffer) {
    setStored(houseOffer)
    setDraft(houseOffer ?? '')
  }

  const normalized = normalizeHouseOffer(draft)
  const length = houseOfferLength(normalized)
  const overLimit = length > HOUSE_OFFER_MAX_LENGTH
  const isDirty = normalized !== houseOffer
  const limitError = overLimit
    ? `A oferta aceita até ${HOUSE_OFFER_MAX_LENGTH} caracteres. Tire ${length - HOUSE_OFFER_MAX_LENGTH}.`
    : null
  const error = limitError ?? saveError

  const submit = async (value: string | null) => {
    setSaved(null)
    try {
      await onSave(value)
      setSaved(value === null ? 'cleared' : 'saved')
    } catch {
      // A mensagem chega por `saveError`, anunciada no campo.
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (overLimit || !isDirty || isSaving) return
    void submit(normalized)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor={fieldId} className="onside-label">
        Sua oferta (opcional)
      </label>
      <textarea
        id={fieldId}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setSaved(null)
        }}
        rows={3}
        className="onside-textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      />
      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
        <p id={hintId} className="text-[var(--onside-muted)] text-xs">
          Deixe em branco para não exibir oferta. Reservas já feitas mantêm o
          texto que estava valendo quando foram criadas.
        </p>
        <p
          className={`font-[family-name:var(--onside-mono)] text-xs tabular-nums ${overLimit ? 'text-[var(--onside-live-text)]' : 'text-[var(--onside-muted)]'}`}
          aria-hidden="true"
        >
          {length}/{HOUSE_OFFER_MAX_LENGTH}
        </p>
      </div>

      {error ? (
        <p id={errorId} className="onside-field-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={isSaving || overLimit || !isDirty}
          className="onside-btn onside-btn-acid min-h-11 text-xs disabled:opacity-50"
        >
          {isSaving ? 'Salvando…' : 'Salvar oferta'}
        </button>
        {houseOffer ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void submit(null)}
            className="onside-btn onside-btn-outline min-h-11 text-xs disabled:opacity-50"
          >
            Remover oferta
          </button>
        ) : null}
        <p className="text-[var(--onside-muted)] text-sm" role="status">
          {saved === 'saved'
            ? 'Oferta salva.'
            : saved === 'cleared'
              ? 'Oferta removida do perfil.'
              : ''}
        </p>
      </div>
    </form>
  )
}
