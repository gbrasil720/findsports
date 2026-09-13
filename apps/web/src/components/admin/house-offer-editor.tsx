import {
  HOUSE_OFFER_MAX_LENGTH,
  houseOfferLength,
  normalizeHouseOffer
} from '@findsports_oficial/db/house-offer'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Link } from '@tanstack/react-router'
import { type FormEvent, useEffect, useId, useState } from 'react'
import ArrowRight from 'reicon-react/icons/ArrowRight'
import CircleInfo from 'reicon-react/icons/CircleInfo'

/**
 * `eligible` vem de `getMySubscription().currentPlan === 'elite'` — o plano
 * vigente, com status, e não `bar.plan`. É só para decidir o que desenhar: o
 * procedimento confere o plano de novo antes de gravar.
 */
export type HouseOfferAccess =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; eligible: boolean }

type Props = {
  /** Texto gravado. Continua existindo mesmo sem Elite. */
  houseOffer: string | null
  access: HouseOfferAccess
  isSaving: boolean
  saveError: string | null
  /** `null` limpa a oferta. Rejeita quando o servidor recusa. */
  onSave: (houseOffer: string | null) => Promise<unknown>
}

const TITLE_ID = 'admin-house-offer-title'

/**
 * Oferta da casa no painel (WEB-120).
 *
 * Sem exemplos no placeholder de propósito: a Onside não sugere o que o bar
 * oferece. O texto de apoio diz só onde aparece e de quem é a promessa.
 */
export function HouseOfferEditor({
  houseOffer,
  access,
  isSaving,
  saveError,
  onSave
}: Props) {
  return (
    <section
      id="admin-house-offer"
      className="onside-panel scroll-mt-6 p-5 md:p-6"
      aria-labelledby={TITLE_ID}
    >
      <p className="onside-kicker mb-2">Plano Elite</p>
      <h2 id={TITLE_ID} className="onside-display text-2xl">
        Oferta da casa
      </h2>
      <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm">
        O que você oferece a quem chega pela Onside. Aparece no perfil público
        do seu bar. A promessa é sua com o cliente: a Onside não define nem
        confere o conteúdo.
      </p>

      <div className="mt-5">
        {access.status === 'loading' ? (
          <div className="space-y-3" role="status" aria-busy="true">
            <span className="sr-only">Carregando oferta da casa…</span>
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-24 w-full" />
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
          <HouseOfferForm
            houseOffer={houseOffer}
            isSaving={isSaving}
            saveError={saveError}
            onSave={onSave}
          />
        ) : (
          <LockedHouseOffer houseOffer={houseOffer} />
        )}
      </div>
    </section>
  )
}

function LockedHouseOffer({ houseOffer }: { houseOffer: string | null }) {
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
        {houseOffer ? (
          <p className="text-sm opacity-90 [overflow-wrap:anywhere]">
            Sua oferta continua guardada — “{houseOffer}” — mas não aparece no
            perfil enquanto o plano Elite não estiver ativo.
          </p>
        ) : (
          <p className="text-sm opacity-90">
            Com o Elite, você escreve o que oferece a quem chega pela Onside e o
            texto aparece no perfil do bar.
          </p>
        )}
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

type FormProps = Omit<Props, 'access'>

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

  // O valor gravado muda depois do refetch do `getMe`: o rascunho acompanha
  // para o botão voltar a ficar desabilitado sem mudança pendente.
  useEffect(() => {
    setDraft(houseOffer ?? '')
  }, [houseOffer])

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
