import { normalizarCidade } from '@findsports_oficial/api/lib/city-match'
import { useEffect, useId, useRef, useState } from 'react'
import Xmark from 'reicon-react/icons/Xmark'

/**
 * Controle da lista de cidades liberadas (`launch.pub_cities`).
 *
 * Abrir uma cidade é a alavanca operacional do lançamento, e quem a opera toca
 * o comercial, não o código. Antes deste controle a única forma de acioná-la
 * era digitar um array JSON à mão no textarea genérico da tela — com colchete,
 * aspas retas e vírgula entre itens. Uma aspa curva colada do WhatsApp já
 * bastava para o salvamento ser recusado.
 *
 * Pior que a sintaxe: substituir o array inteiro era a única operação. Abrir
 * Campinas significava redigitar São Paulo junto, e quem esquecesse fechava
 * São Paulo sem perceber. Aqui cada cidade entra e sai sozinha.
 *
 * O autocomplete grava **só o nome**, sem UF, mesmo mostrando a UF na lista.
 * `launch.pub_cities` guarda nome puro e `bar.city` chega puro do formulário
 * de onboarding; `cidadeLiberada` compara os dois só pelo nome. Gravar
 * "São Paulo/SP" faria nenhum bar casar mais.
 */

/** Nome e UF, na forma em que `municipios.json` é gerado. */
export type Municipio = [nome: string, uf: string]

const MAXIMO_SUGESTOES = 8

/**
 * A lista tem 5.571 municípios e ~123 KB. Ela é carregada na primeira
 * interação com o campo, não no carregamento da tela: é um autocomplete de
 * painel interno, e ninguém abre `/internal/flags` para ver a lista do IBGE.
 */
let municipiosEmCache: Municipio[] | null = null
let carregamentoEmCurso: Promise<Municipio[]> | null = null

function carregarMunicipios(): Promise<Municipio[]> {
  if (municipiosEmCache) return Promise.resolve(municipiosEmCache)
  if (!carregamentoEmCurso) {
    carregamentoEmCurso = import('@/data/municipios.json').then((modulo) => {
      municipiosEmCache = modulo.default as Municipio[]
      return municipiosEmCache
    })
  }
  return carregamentoEmCurso
}

/**
 * Prefixo antes de "contém": quem digita "sao p" quer São Paulo no topo, não
 * "Cristais Paulista". Dentro de cada grupo a ordem do arquivo (alfabética)
 * se mantém.
 */
export function filtrarMunicipios(
  municipios: Municipio[],
  busca: string,
  jaAdicionadas: Set<string>
): Municipio[] {
  const alvo = normalizarCidade(busca)
  if (alvo.length === 0) return []

  const prefixo: Municipio[] = []
  const contem: Municipio[] = []

  for (const municipio of municipios) {
    const normalizado = normalizarCidade(municipio[0])
    if (jaAdicionadas.has(normalizado)) continue

    if (normalizado.startsWith(alvo)) {
      prefixo.push(municipio)
    } else if (normalizado.includes(alvo)) {
      contem.push(municipio)
    }

    if (prefixo.length >= MAXIMO_SUGESTOES) break
  }

  return [...prefixo, ...contem].slice(0, MAXIMO_SUGESTOES)
}

export function ControleCidades({
  cidades,
  desabilitado,
  onAlterar
}: {
  cidades: string[]
  desabilitado: boolean
  onAlterar: (proximo: string[]) => void
}) {
  const campoId = useId()
  const listaId = useId()
  const dicaId = useId()

  const [busca, setBusca] = useState('')
  const [municipios, setMunicipios] = useState<Municipio[] | null>(null)
  const [destacado, setDestacado] = useState(0)
  const [aberto, setAberto] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const normalizadas = new Set(cidades.map(normalizarCidade))

  // Derivado do render em vez de guardado em estado: sugestão é função pura de
  // (lista carregada, busca, cidades já escolhidas). Mantê-la em estado exigiria
  // um efeito para ressincronizar a cada remoção de ficha, e é assim que uma
  // cidade recém-removida some da lista de sugestões até a próxima tecla.
  const sugestoes = municipios
    ? filtrarMunicipios(municipios, busca, normalizadas)
    : []

  // Clicar fora fecha a lista. Sem isso ela fica pendurada por cima do resto
  // da tela depois que a pessoa desiste de escolher.
  useEffect(() => {
    if (!aberto) return

    function aoClicarFora(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) {
        setAberto(false)
      }
    }

    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  function adicionar(nome: string) {
    if (normalizadas.has(normalizarCidade(nome))) return
    onAlterar([...cidades, nome])
    setBusca('')
    setDestacado(0)
    setAberto(false)
  }

  function remover(nome: string) {
    onAlterar(cidades.filter((cidade) => cidade !== nome))
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') {
      setAberto(false)
      return
    }
    if (sugestoes.length === 0) return

    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      setAberto(true)
      setDestacado((atual) => (atual + 1) % sugestoes.length)
      return
    }
    if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      setAberto(true)
      setDestacado((atual) => (atual - 1 + sugestoes.length) % sugestoes.length)
      return
    }
    if (evento.key === 'Enter') {
      evento.preventDefault()
      const escolhido = sugestoes[destacado]
      if (escolhido) adicionar(escolhido[0])
    }
  }

  const mostrandoLista = aberto && sugestoes.length > 0

  return (
    <div className="flex flex-col gap-3">
      {cidades.length === 0 ? (
        <p className="border border-[var(--onside-ink)] border-dashed px-3 py-2 text-sm text-[var(--onside-muted)]">
          Nenhuma cidade restrita: <strong>todas liberadas</strong>. Adicionar a
          primeira cidade passa a recusar o cadastro de bar em todas as outras.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {cidades.map((cidade) => (
            <li key={cidade}>
              <span className="flex min-h-9 items-center gap-2 border border-[var(--onside-ink)] bg-[var(--onside-paper)] py-1 pr-1 pl-3 text-sm">
                {cidade}
                <button
                  type="button"
                  disabled={desabilitado}
                  onClick={() => remover(cidade)}
                  aria-label={`Remover ${cidade}`}
                  className="grid size-7 place-items-center border border-transparent transition-colors hover:border-[var(--onside-ink)] disabled:opacity-40"
                >
                  <Xmark size={12} color="currentColor" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div ref={containerRef} className="relative max-w-md">
        <label htmlFor={campoId} className="onside-kicker mb-2 block">
          Adicionar cidade
        </label>
        <input
          id={campoId}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={desabilitado}
          value={busca}
          placeholder="Buscar município…"
          aria-expanded={mostrandoLista}
          aria-controls={listaId}
          aria-describedby={dicaId}
          aria-autocomplete="list"
          aria-activedescendant={
            mostrandoLista ? `${listaId}-${destacado}` : undefined
          }
          onChange={(evento) => {
            setBusca(evento.target.value)
            setDestacado(0)
            setAberto(true)
          }}
          onFocus={() => {
            if (!municipios) void carregarMunicipios().then(setMunicipios)
            setAberto(true)
          }}
          onKeyDown={aoTeclar}
          className="min-h-11 w-full border border-[var(--onside-ink)] bg-[var(--onside-paper)] px-3 text-sm disabled:opacity-40"
        />
        <p id={dicaId} className="mt-2 text-[11px] text-[var(--onside-muted)]">
          Escolha da lista: a UF aparece só para desambiguar homônimo, e o valor
          gravado é sempre o nome puro.
        </p>

        {mostrandoLista ? (
          <div
            id={listaId}
            role="listbox"
            aria-label="Municípios encontrados"
            className="absolute top-full right-0 left-0 z-10 mt-1 max-h-64 overflow-y-auto border border-[var(--onside-ink)] bg-[var(--onside-paper)]"
          >
            {sugestoes.map(([nome, uf], indice) => (
              <button
                key={`${nome}/${uf}`}
                id={`${listaId}-${indice}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={indice === destacado}
                onMouseEnter={() => setDestacado(indice)}
                onClick={() => adicionar(nome)}
                className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 text-left text-sm ${
                  indice === destacado
                    ? 'bg-[var(--onside-acid)] text-[var(--onside-ink)]'
                    : ''
                }`}
              >
                {nome}
                <span className="font-mono text-[11px] text-[var(--onside-muted)]">
                  {uf}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
