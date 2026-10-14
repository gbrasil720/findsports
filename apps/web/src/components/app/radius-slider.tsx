import {
  SEARCH_RADIUS_MAX_KM,
  SEARCH_RADIUS_MIN_KM
} from '@findsports_oficial/db/search-radius'
import { useEffect, useId, useRef, useState } from 'react'

/** Espera depois do último movimento antes de buscar ou salvar. */
const COMMIT_DELAY_MS = 350

type Props = {
  label: string
  value: number
  /** Chamado quando a pessoa para de arrastar, não a cada quilômetro. */
  onCommit: (km: number) => void
  disabled?: boolean
  /** Linha curta sob o controle, ex.: "Seu raio: 5 km". */
  note?: string
}

/**
 * Raio de busca de 1 a 50 km. O arraste mostra o número na hora, mas só
 * entrega o valor quando para: cada quilômetro virava uma busca (no painel)
 * ou uma gravação (no perfil).
 */
export function RadiusSlider({
  label,
  value,
  onCommit,
  disabled,
  note
}: Props) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  // O valor de fora muda (outra aba, "limpar filtros"): o controle acompanha.
  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => commitRef.current(draft), COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, value])

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="onside-kicker">
          {label}
        </label>
        <output
          htmlFor={id}
          className="onside-display text-xl tabular-nums leading-none"
        >
          {draft} km
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={SEARCH_RADIUS_MIN_KM}
        max={SEARCH_RADIUS_MAX_KM}
        step={1}
        value={draft}
        disabled={disabled}
        aria-valuetext={`${draft} km`}
        onChange={(event) => setDraft(Number(event.target.value))}
        className="w-full cursor-pointer accent-[var(--onside-ink)] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="flex justify-between font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
        <span>{SEARCH_RADIUS_MIN_KM} km</span>
        {note ? (
          <span className="normal-case tracking-normal">{note}</span>
        ) : null}
        <span>{SEARCH_RADIUS_MAX_KM} km</span>
      </div>
    </div>
  )
}
