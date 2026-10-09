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

/** As quatro colunas de `user` andam juntas: ou todas, ou nenhuma. */
export function searchCityColumns(city: SearchCity) {
  return {
    searchCityName: city.name,
    searchCityUf: city.uf,
    searchCityLat: city.lat,
    searchCityLng: city.lng
  }
}
