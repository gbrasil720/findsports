import { useId, useState } from 'react'
import {
  carregarMunicipios,
  filtrarMunicipios,
  type Municipio
} from '@/components/internal/controle-cidades'

/**
 * Campo de cidade do torcedor (WEB-319), no onboarding e no perfil.
 *
 * A lista de municípios e a busca sem acento são as do autocomplete de
 * `/internal/flags`: ~5.500 nomes baixados na primeira interação com o campo,
 * e só as sugestões da busca viram elemento na tela.
 */

export type CityChoice = { name: string; uf: string }

/**
 * O texto do campo e a cidade escolhida. `city` fica `null` enquanto o texto
 * não for uma escolha da lista — é assim que a tela sabe que digitar
 * "Campinas" e seguir sem escolher não informou cidade nenhuma.
 */
export type CityFieldValue = { text: string; city: CityChoice | null }

export function cityLabel(city: CityChoice): string {
  return `${city.name}, ${city.uf}`
}

export function cityFieldValue(
  city: CityChoice | null | undefined
): CityFieldValue {
  return { text: city ? cityLabel(city) : '', city: city ?? null }
}

/** Texto digitado que ainda não é uma cidade da lista. */
export function isCityPending(value: CityFieldValue): boolean {
  return value.text.trim().length > 0 && !value.city
}

/** `filtrarMunicipios` esconde as já adicionadas; aqui não há o que esconder. */
const NENHUMA_ADICIONADA = new Set<string>()

type Props = {
  value: CityFieldValue
  onChange: (value: CityFieldValue) => void
  label: string
  hint: string
  disabled?: boolean
  /** Sobre o painel ink do onboarding. */
  ink?: boolean
}

export function CityField({
  value,
  onChange,
  label,
  hint,
  disabled,
  ink
}: Props) {
  const campoId = useId()
  const listaId = useId()
  const dicaId = useId()

  const [municipios, setMunicipios] = useState<Municipio[] | null>(null)
  const [destacado, setDestacado] = useState(0)
  const [aberto, setAberto] = useState(false)

  const pendente = isCityPending(value)
  const sugestoes =
    municipios && pendente
      ? filtrarMunicipios(municipios, value.text, NENHUMA_ADICIONADA)
      : []
  const mostrandoLista = aberto && sugestoes.length > 0

  function escolher([name, uf]: Municipio) {
    onChange(cityFieldValue({ name, uf }))
    setAberto(false)
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') {
      setAberto(false)
      return
    }
    if (sugestoes.length === 0) return

    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      const passo = evento.key === 'ArrowDown' ? 1 : -1
      // Com a lista fechada, a seta só reabre no item que já estava marcado.
      if (mostrandoLista) {
        setDestacado(
          (atual) => (atual + passo + sugestoes.length) % sugestoes.length
        )
      }
      setAberto(true)
      return
    }
    if (evento.key === 'Enter' && mostrandoLista) {
      evento.preventDefault()
      const escolhido = sugestoes[destacado]
      if (escolhido) escolher(escolhido)
    }
  }

  return (
    <div className="max-w-md">
      <label
        htmlFor={campoId}
        className={`onside-label ${ink ? 'text-[color-mix(in_srgb,var(--onside-paper)_70%,transparent)]' : ''}`}
      >
        {label}
      </label>
      {/* Só o campo e a lista: ela abre colada nele, por cima da dica. */}
      <div className="relative">
        <input
          id={campoId}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          value={value.text}
          placeholder="Buscar cidade…"
          maxLength={100}
          aria-expanded={mostrandoLista}
          aria-controls={listaId}
          aria-describedby={dicaId}
          aria-autocomplete="list"
          aria-activedescendant={
            mostrandoLista ? `${listaId}-${destacado}` : undefined
          }
          onChange={(evento) => {
            onChange({ text: evento.target.value, city: null })
            setDestacado(0)
            setAberto(true)
          }}
          onFocus={() => {
            if (!municipios) {
              // Sem a lista o campo fica sem sugestão, e a dica abaixo continua
              // dizendo o que falta; não há o que fazer com o erro aqui.
              void carregarMunicipios()
                .then(setMunicipios)
                .catch(() => {})
            }
            setAberto(true)
          }}
          // As opções seguram o foco no campo (`onMouseDown`), então perder o
          // foco é sempre sair do controle: Tab, clique fora, teclado fechado.
          onBlur={() => setAberto(false)}
          onKeyDown={aoTeclar}
          className={`onside-input ${ink ? 'onside-input-ink' : ''}`}
        />
        {mostrandoLista ? (
          <div
            id={listaId}
            role="listbox"
            aria-label="Cidades encontradas"
            className="absolute top-full right-0 left-0 z-10 mt-1 max-h-64 overflow-y-auto border border-[var(--onside-ink)] bg-[var(--onside-paper)] text-[var(--onside-ink)]"
          >
            {sugestoes.map((municipio, indice) => (
              <button
                key={municipio.join('/')}
                id={`${listaId}-${indice}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={indice === destacado}
                // Sem isto o clique tira o foco do campo antes de chegar aqui,
                // e a lista fecha sem escolher nada.
                onMouseDown={(evento) => evento.preventDefault()}
                onMouseEnter={() => setDestacado(indice)}
                onClick={() => escolher(municipio)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm ${
                  indice === destacado ? 'bg-[var(--onside-acid)]' : ''
                }`}
              >
                {municipio[0]}
                <span className="font-mono text-[11px] text-[var(--onside-muted)]">
                  {municipio[1]}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <p
        id={dicaId}
        role="status"
        className={`mt-2 text-xs ${
          ink ? 'onside-text-muted-on-ink' : 'text-[var(--onside-muted)]'
        }`}
      >
        {!pendente
          ? hint
          : municipios && sugestoes.length === 0
            ? 'Nenhuma cidade com esse nome.'
            : 'Escolha a cidade na lista.'}
      </p>
    </div>
  )
}
