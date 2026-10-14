import { TRPCError } from '@trpc/server'
import { z } from 'zod'

import { normalizarCidade } from './city-match'

/**
 * Cidade do torcedor (WEB-319): centro da busca quando o navegador não dá a
 * localização.
 *
 * O cliente manda só nome e UF, escolhidos da lista de municípios; o centro
 * sai daqui, de `municipios-centros.json` (a sede de cada município, gerada
 * por `apps/web/scripts/gerar-municipios.ts`). Sem geocoding: nenhuma chamada
 * paga e nenhum terceiro no caminho do onboarding. Cidade fora da lista é
 * recusada, e coordenada vinda do cliente nunca chega ao banco.
 */
export const searchCitySchema = z.object({
  name: z.string().trim().min(1).max(100),
  uf: z.string().trim().length(2)
})

export type SearchCity = { name: string; uf: string; lat: number; lng: number }

type Linha = [nome: string, uf: string, lat: number, lng: number]

export async function findSearchCity(
  input: z.infer<typeof searchCitySchema>
): Promise<SearchCity> {
  // Carregado na primeira consulta, não na subida do servidor: são ~220 KB
  // que só interessam a quem está salvando a cidade.
  const { default: centros } = await import('../data/municipios-centros.json')
  const nome = normalizarCidade(input.name)
  const uf = input.uf.toUpperCase()
  const linha = (centros as Linha[]).find(
    (candidata) =>
      candidata[1] === uf && normalizarCidade(candidata[0]) === nome
  )
  if (!linha) {
    throw new TRPCError({
      code: 'UNPROCESSABLE_CONTENT',
      message: 'Cidade não encontrada. Escolha uma da lista.'
    })
  }
  return { name: linha[0], uf: linha[1], lat: linha[2], lng: linha[3] }
}

/** Teto de sugestões do campo de cidade, como no web (`lib/municipios`). */
const MAX_SUGGESTIONS = 8

/**
 * Sugestões para o campo de cidade do app (`apps/mobile`), que não carrega a
 * lista de ~5.500 municípios como o web: pede ao servidor só o que bate com
 * o que foi digitado. Prefixo antes de "contém" (quem digita "sao p" quer
 * São Paulo no topo, não "Cristais Paulista"); dentro de cada grupo, a ordem
 * do arquivo, que é alfabética.
 */
export async function suggestSearchCities(
  query: string
): Promise<SearchCity[]> {
  const alvo = normalizarCidade(query)
  if (alvo.length === 0) return []
  const { default: centros } = await import('../data/municipios-centros.json')
  const prefixo: Linha[] = []
  const contem: Linha[] = []
  for (const linha of centros as Linha[]) {
    const nome = normalizarCidade(linha[0])
    if (nome.startsWith(alvo)) prefixo.push(linha)
    else if (nome.includes(alvo)) contem.push(linha)
    if (prefixo.length >= MAX_SUGGESTIONS) break
  }
  return [...prefixo, ...contem]
    .slice(0, MAX_SUGGESTIONS)
    .map(([name, uf, lat, lng]) => ({ name, uf, lat, lng }))
}

/** As quatro colunas de `user` andam juntas: ou todas, ou nenhuma. */
export function searchCityColumns(city: SearchCity) {
  return {
    searchCityName: city.name,
    searchCityUf: city.uf,
    searchCityLat: city.lat,
    searchCityLng: city.lng
  }
}
