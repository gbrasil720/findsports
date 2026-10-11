import { normalizarCidade } from '@findsports_oficial/api/lib/city-match'

/** Nome e UF, na forma em que `municipios.json` é gerado. */
export type Municipio = [nome: string, uf: string]

const MAXIMO_SUGESTOES = 8

/**
 * A lista tem 5.571 municípios e ~123 KB. Ela é carregada na primeira
 * interação com o campo de cidade, não no carregamento da tela.
 */
let municipiosEmCache: Municipio[] | null = null
let carregamentoEmCurso: Promise<Municipio[]> | null = null

export function carregarMunicipios(): Promise<Municipio[]> {
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
  busca: string
): Municipio[] {
  const alvo = normalizarCidade(busca)
  if (alvo.length === 0) return []

  const prefixo: Municipio[] = []
  const contem: Municipio[] = []

  for (const municipio of municipios) {
    const normalizado = normalizarCidade(municipio[0])

    if (normalizado.startsWith(alvo)) {
      prefixo.push(municipio)
    } else if (normalizado.includes(alvo)) {
      contem.push(municipio)
    }

    if (prefixo.length >= MAXIMO_SUGESTOES) break
  }

  return [...prefixo, ...contem].slice(0, MAXIMO_SUGESTOES)
}
