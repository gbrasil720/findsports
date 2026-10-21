import {
  groupOpeningHours,
  normalizeOpeningHours,
  type OpeningHours
} from '@findsports_oficial/api/lib/opening-hours'
import { type FormEvent, useId, useState } from 'react'
import { OpeningHoursList } from '@/components/pub/opening-hours-section'

type Props = {
  openingHours: OpeningHours | null
  isSaving: boolean
  saveError: string | null
  /** `null` tira o horário da página. Rejeita quando o servidor recusa. */
  onSave: (openingHours: OpeningHours | null) => Promise<unknown>
}

/** Segunda primeiro; o índice é o do `getDay` (0 = domingo). */
const DAYS = [
  [1, 'Segunda'],
  [2, 'Terça'],
  [3, 'Quarta'],
  [4, 'Quinta'],
  [5, 'Sexta'],
  [6, 'Sábado'],
  [0, 'Domingo']
] as const

type Draft = { open: boolean; opens: string; closes: string }[]

const toDraft = (hours: OpeningHours | null): Draft =>
  Array.from({ length: 7 }, (_, day) => {
    const range = hours?.[day]
    return range
      ? { open: true, ...range }
      : // Sem horário nenhum, a semana nasce aberta num horário comum de bar.
        { open: !hours, opens: '17:00', closes: '00:00' }
  })

const fromDraft = (draft: Draft): OpeningHours | null =>
  normalizeOpeningHours(
    draft.map((day) =>
      day.open ? { opens: day.opens, closes: day.closes } : null
    )
  )

/**
 * Horário de funcionamento no painel (WEB-397): uma faixa por dia, e a página
 * do bar agrupa os dias iguais. Campo simples, de propósito: o painel do bar
 * vai ser redesenhado, e a regra (virada da meia-noite, "aberto agora") mora
 * no servidor, em `opening-hours.ts`.
 */
export function OpeningHoursEditor({
  openingHours,
  isSaving,
  saveError,
  onSave
}: Props) {
  const id = useId()
  const titleId = `${id}-title`
  const [draft, setDraft] = useState(() => toDraft(openingHours))
  const [stored, setStored] = useState(openingHours)
  const [saved, setSaved] = useState(false)

  // Mesmo cuidado do cardápio: o rascunho acompanha o valor gravado na
  // renderização, não num efeito que o `<Activity>` da aba recriaria.
  if (JSON.stringify(stored) !== JSON.stringify(openingHours)) {
    setStored(openingHours)
    setDraft(toDraft(openingHours))
  }

  const sameTime = draft.some((day) => day.open && day.opens === day.closes)
  const next = fromDraft(draft)
  const isDirty = JSON.stringify(next) !== JSON.stringify(openingHours)

  const save = async (value: OpeningHours | null) => {
    setSaved(false)
    try {
      await onSave(value)
      setSaved(true)
    } catch {
      // A mensagem chega por `saveError`.
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (sameTime || !isDirty || isSaving) return
    void save(next)
  }

  const update = (day: number, change: Partial<Draft[number]>) => {
    setSaved(false)
    setDraft((prev) =>
      prev.map((item, index) => (index === day ? { ...item, ...change } : item))
    )
  }

  return (
    <section
      id="admin-opening-hours"
      className="onside-panel p-5 md:p-6"
      aria-labelledby={titleId}
    >
      <p className="onside-kicker">Todos os planos</p>
      <h2 id={titleId} className="onside-display text-2xl">
        Horário
      </h2>
      <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm">
        Aparece na página do bar, com “aberto agora” no horário de Brasília.
        Fecha depois da meia-noite? Informe a hora do dia seguinte, como 17:00
        às 02:00.
      </p>

      <form
        method="post"
        onSubmit={handleSubmit}
        noValidate
        className="mt-5 space-y-5"
      >
        <div className="divide-y divide-[var(--onside-line)]">
          {DAYS.map(([day, label]) => {
            const item = draft[day]
            if (!item) return null
            const wrong = item.open && item.opens === item.closes
            return (
              <fieldset
                key={day}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
              >
                <legend className="sr-only">{label}</legend>
                <label className="flex min-h-11 w-36 items-center gap-2.5 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={item.open}
                    disabled={isSaving}
                    onChange={(e) => update(day, { open: e.target.checked })}
                    className="size-4 accent-[var(--onside-ink)]"
                  />
                  {label}
                </label>
                {item.open ? (
                  <div className="flex items-center gap-2">
                    <div className="w-32">
                      <input
                        type="time"
                        aria-label={`${label}, abre`}
                        value={item.opens}
                        readOnly={isSaving}
                        onChange={(e) =>
                          e.target.value &&
                          update(day, { opens: e.target.value })
                        }
                        className="onside-input font-[family-name:var(--onside-mono)]"
                      />
                    </div>
                    <span aria-hidden="true">–</span>
                    <div className="w-32">
                      <input
                        type="time"
                        aria-label={`${label}, fecha`}
                        value={item.closes}
                        readOnly={isSaving}
                        onChange={(e) =>
                          e.target.value &&
                          update(day, { closes: e.target.value })
                        }
                        aria-invalid={wrong || undefined}
                        className="onside-input font-[family-name:var(--onside-mono)]"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[var(--onside-muted)] text-sm">
                    Fechado
                  </span>
                )}
              </fieldset>
            )
          })}
        </div>

        {sameTime ? (
          <p className="onside-field-error" role="alert">
            Abre e fecha no mesmo horário: ajuste o dia marcado.
          </p>
        ) : null}

        {next ? (
          <div>
            <p className="onside-kicker">Como aparece na página</p>
            <OpeningHoursList rows={groupOpeningHours(next)} />
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
            disabled={isSaving || sameTime || !isDirty}
            className="onside-btn onside-btn-acid"
          >
            {isSaving ? 'Salvando…' : 'Salvar'}
          </button>
          {openingHours ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void save(null)}
              className="onside-btn onside-btn-ghost"
            >
              Tirar o horário da página
            </button>
          ) : null}
          <p className="text-[var(--onside-muted)] text-sm" role="status">
            {saved ? 'Horário salvo.' : ''}
          </p>
        </div>
      </form>
    </section>
  )
}
