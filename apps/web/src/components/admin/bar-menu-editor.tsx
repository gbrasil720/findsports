import {
  averageSpendInputValue,
  formatAverageSpend,
  menuUrlHost,
  parseAverageSpendInput,
  parseMenuUrl
} from '@findsports_oficial/db/bar-menu'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { type FormEvent, useId, useState } from 'react'
import { BarMenuInfo } from '@/components/pub/bar-characteristics'
import type { PlanState } from './admin-model'
import { PaidFeatureCard } from './paid-feature-card'

export type BarMenuValues = {
  menuUrl: string | null
  averageSpendCents: number | null
}

type Props = BarMenuValues & {
  plan: PlanState
  isSaving: boolean
  saveError: string | null
  /** Só os campos que mudaram; `null` remove. Rejeita quando o servidor recusa. */
  onSave: (changes: Partial<BarMenuValues>) => Promise<unknown>
}

/** Cardápio e gasto médio por pessoa no painel (WEB-39). */
export function BarMenuEditor({
  menuUrl,
  averageSpendCents,
  plan,
  ...form
}: Props) {
  return (
    <PaidFeatureCard
      id="admin-bar-menu"
      tier="pro"
      title="Cardápio e preço médio"
      description="Aparecem nas características do seu bar, no perfil público, como informação declarada por você."
      plan={plan}
      loadingLabel="Carregando cardápio e preço médio…"
      skeleton={
        <>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-11 w-36" />
        </>
      }
      locked={
        <LockedBarMenu
          menuUrl={menuUrl}
          averageSpendCents={averageSpendCents}
        />
      }
    >
      {(eligible) =>
        eligible ? (
          <BarMenuForm
            menuUrl={menuUrl}
            averageSpendCents={averageSpendCents}
            {...form}
          />
        ) : null
      }
    </PaidFeatureCard>
  )
}

function LockedBarMenu({ menuUrl, averageSpendCents }: BarMenuValues) {
  const preserved = [
    menuUrl ? `o link do cardápio (${menuUrlHost(menuUrl)})` : null,
    averageSpendCents
      ? `o preço médio de ${formatAverageSpend(averageSpendCents)}`
      : null
  ].filter(Boolean)

  return preserved.length === 2 ? (
    <p className="text-sm opacity-90 [overflow-wrap:anywhere]">
      Continuam guardados {preserved.join(' e ')}, mas não aparecem no perfil
      enquanto o plano Pro ou Elite não estiver ativo. Ao voltar para um deles,
      reaparecem sem precisar preencher de novo.
    </p>
  ) : preserved.length === 1 ? (
    <p className="text-sm opacity-90 [overflow-wrap:anywhere]">
      Continua guardado {preserved[0]}, mas não aparece no perfil enquanto o
      plano Pro ou Elite não estiver ativo. Ao voltar para um deles, reaparece
      sem precisar preencher de novo.
    </p>
  ) : (
    <p className="text-sm opacity-90">
      Com o Pro ou o Elite, você informa o link do cardápio e o preço médio por
      pessoa, e os dois aparecem no perfil do bar.
    </p>
  )
}

type FormProps = Omit<Props, 'plan'>

function BarMenuForm({
  menuUrl,
  averageSpendCents,
  isSaving,
  saveError,
  onSave
}: FormProps) {
  const id = useId()
  const urlId = `${id}-url`
  const spendId = `${id}-spend`
  const [urlDraft, setUrlDraft] = useState(menuUrl ?? '')
  const [spendDraft, setSpendDraft] = useState(
    averageSpendInputValue(averageSpendCents)
  )
  const [touched, setTouched] = useState({ url: false, spend: false })
  const [saved, setSaved] = useState(false)
  const [stored, setStored] = useState({ menuUrl, averageSpendCents })

  // Depois do refetch do `getMe`, o rascunho acompanha o valor gravado — já
  // normalizado pelo servidor — e o botão volta a ficar desabilitado. A
  // comparação é na renderização, não em efeito: o painel vive dentro de um
  // `<Activity>`, que recria efeitos ao voltar para a aba, e um efeito aqui
  // apagaria o que o dono digitou antes de trocar de aba.
  if (
    stored.menuUrl !== menuUrl ||
    stored.averageSpendCents !== averageSpendCents
  ) {
    setStored({ menuUrl, averageSpendCents })
    if (stored.menuUrl !== menuUrl) setUrlDraft(menuUrl ?? '')
    if (stored.averageSpendCents !== averageSpendCents) {
      setSpendDraft(averageSpendInputValue(averageSpendCents))
    }
  }

  const url = parseMenuUrl(urlDraft)
  const spend = parseAverageSpendInput(spendDraft)
  const urlError = touched.url && !url.ok ? url.error : null
  const spendError = touched.spend && !spend.ok ? spend.error : null

  const changes: Partial<BarMenuValues> = {}
  if (url.ok && url.url !== menuUrl) changes.menuUrl = url.url
  if (spend.ok && spend.cents !== averageSpendCents) {
    changes.averageSpendCents = spend.cents
  }
  const isValid = url.ok && spend.ok
  const isDirty = Object.keys(changes).length > 0

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setTouched({ url: true, spend: true })
    if (!isValid || !isDirty || isSaving) return
    setSaved(false)
    try {
      await onSave(changes)
      setSaved(true)
    } catch {
      // A mensagem chega por `saveError`, anunciada no formulário.
    }
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5"
    >
      <div>
        <label htmlFor={urlId} className="onside-label">
          Link do cardápio (opcional)
        </label>
        <input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://"
          value={urlDraft}
          readOnly={isSaving}
          onChange={(e) => {
            setUrlDraft(e.target.value)
            // Erro só depois de sair do campo: meio link não é link errado.
            setTouched((t) => ({ ...t, url: false }))
            setSaved(false)
          }}
          onBlur={() => setTouched((t) => ({ ...t, url: true }))}
          className="onside-input"
          aria-invalid={urlError ? true : undefined}
          aria-describedby={
            urlError ? `${urlId}-hint ${urlId}-error` : `${urlId}-hint`
          }
        />
        <p
          id={`${urlId}-hint`}
          className="mt-1.5 text-[var(--onside-muted)] text-xs"
        >
          Endereço público do cardápio: site, PDF ou perfil em rede social.
          Deixe em branco para remover.
        </p>
        {urlError ? (
          <p id={`${urlId}-error`} className="onside-field-error" role="alert">
            {urlError}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor={spendId} className="onside-label">
          Preço médio por pessoa, em R$ (opcional)
        </label>
        <input
          id={spendId}
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={spendDraft}
          readOnly={isSaving}
          onChange={(e) => {
            setSpendDraft(e.target.value)
            setTouched((t) => ({ ...t, spend: false }))
            setSaved(false)
          }}
          onBlur={() => setTouched((t) => ({ ...t, spend: true }))}
          className="onside-input max-w-48"
          aria-invalid={spendError ? true : undefined}
          aria-describedby={
            spendError ? `${spendId}-hint ${spendId}-error` : `${spendId}-hint`
          }
        />
        <p
          id={`${spendId}-hint`}
          className="mt-1.5 max-w-2xl text-[var(--onside-muted)] text-xs"
        >
          Sua estimativa do que uma pessoa gasta com comida e bebida, sem taxa
          de serviço. O perfil mostra como informado pelo bar. Deixe em branco
          para remover.
        </p>
        {spendError ? (
          <p
            id={`${spendId}-error`}
            className="onside-field-error"
            role="alert"
          >
            {spendError}
          </p>
        ) : null}
      </div>

      {url.ok && spend.ok && (url.url || spend.cents) ? (
        <div>
          <p className="onside-kicker mb-2">Como aparece no perfil</p>
          <BarMenuInfo menuUrl={url.url} averageSpendCents={spend.cents} />
        </div>
      ) : null}

      {saveError ? (
        <p className="onside-field-error" role="alert">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          // Com erro na tela não há o que salvar (WEB-353). Antes de o erro
          // aparecer o botão segue ativo: é o envio que o revela.
          disabled={
            isSaving || Boolean(urlError || spendError) || (isValid && !isDirty)
          }
          className="onside-btn onside-btn-acid min-h-11 text-xs disabled:opacity-50"
        >
          {isSaving ? 'Salvando…' : 'Salvar'}
        </button>
        <p className="text-[var(--onside-muted)] text-sm" role="status">
          {saved ? 'Cardápio e preço médio salvos.' : ''}
        </p>
      </div>
    </form>
  )
}
