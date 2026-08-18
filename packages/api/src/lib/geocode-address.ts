import { TRPCError } from '@trpc/server'

import { createTtlCache } from './ttl-cache'

/**
 * Geocoding de endereço (ESC-14).
 *
 * Antes: um `fetch` cru, sem timeout, sem repetição e sem cache. Se o Google
 * demorasse, a mutation demorava junto e o usuário ficava esperando sem
 * limite; se falhasse por instabilidade momentânea, o cadastro do bar
 * falhava; e endereços repetidos eram cobrados e consultados de novo.
 *
 * Além disso, qualquer problema virava a mesma mensagem — "endereço não
 * encontrado" —, o que manda o usuário corrigir um endereço que estava certo
 * quando o defeito era do serviço.
 */

const TIMEOUT_MS = 4_000
const TENTATIVAS = 2
const ESPERA_ENTRE_TENTATIVAS_MS = 300
/** Endereço não muda de lugar; o que muda é a base do Google, devagar. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export type Coordenadas = { latitude: string; longitude: string }

const cache = createTtlCache<Coordenadas>({
  ttlMs: CACHE_TTL_MS,
  maxEntries: 500
})

/** Só para os testes: evita vazar estado entre casos. */
export function limparCacheDeGeocoding() {
  cache.clear()
}

function normalizar(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Status do Google que valem nova tentativa. `ZERO_RESULTS` e
 * `INVALID_REQUEST` são definitivos — repetir só gastaria tempo do usuário e
 * cota da API.
 */
const STATUS_TRANSITORIOS = new Set([
  'UNKNOWN_ERROR',
  'OVER_QUERY_LIMIT',
  'OVER_DAILY_LIMIT'
])

/** Endereço realmente não encontrado: é o usuário que precisa agir. */
const STATUS_DO_USUARIO = new Set(['ZERO_RESULTS', 'INVALID_REQUEST'])

class FalhaTransitoria extends Error {}

type GeocodeResponse = {
  status: string
  results: Array<{ geometry: { location: { lat: number; lng: number } } }>
}

async function consultarGoogle(
  address: string,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<Coordenadas> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`

  let res: Response
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    // Timeout e erro de rede são indistinguíveis aqui, e ambos valem repetir.
    throw new FalhaTransitoria(
      err instanceof Error ? err.message : 'falha de rede'
    )
  }

  // Sem isto, uma página de erro em HTML faria `res.json()` estourar com uma
  // mensagem que não diz nada a quem for ler o log.
  if (!res.ok) {
    throw new FalhaTransitoria(`HTTP ${res.status}`)
  }

  const data = (await res.json()) as GeocodeResponse

  if (STATUS_TRANSITORIOS.has(data.status)) {
    throw new FalhaTransitoria(data.status)
  }

  if (STATUS_DO_USUARIO.has(data.status)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Endereço não encontrado. Verifique e tente novamente.'
    })
  }

  // Esta checagem vem ANTES da de resultados vazios de propósito: um
  // REQUEST_DENIED (chave inválida) também chega sem resultados, e classificá-lo
  // como "endereço não encontrado" mandaria o usuário corrigir um endereço
  // correto por causa de um erro de configuração nosso.
  if (data.status !== 'OK') {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Não foi possível validar o endereço agora. Tente mais tarde.'
    })
  }

  if (!data.results?.[0]) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Endereço não encontrado. Verifique e tente novamente.'
    })
  }

  const { lat, lng } = data.results[0].geometry.location
  return { latitude: lat.toString(), longitude: lng.toString() }
}

export async function geocodeAddress(
  address: string,
  apiKey: string,
  // Injetável para teste; em produção é sempre o `fetch` global.
  fetchImpl: typeof fetch = fetch
): Promise<Coordenadas> {
  const chave = normalizar(address)

  return cache.get(chave, async () => {
    let ultimaFalha: FalhaTransitoria | null = null

    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      try {
        return await consultarGoogle(address, apiKey, fetchImpl)
      } catch (err) {
        // Recusa definitiva não se repete: sobe na hora.
        if (err instanceof TRPCError) throw err
        if (!(err instanceof FalhaTransitoria)) throw err

        ultimaFalha = err
        if (tentativa < TENTATIVAS) {
          await new Promise((r) =>
            setTimeout(r, ESPERA_ENTRE_TENTATIVAS_MS * tentativa)
          )
        }
      }
    }

    // Serviço fora do ar não é endereço errado. Dizer "endereço não
    // encontrado" aqui faria o usuário corrigir o que já estava certo.
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message:
        'Não foi possível validar o endereço agora. Tente novamente em instantes.',
      cause: ultimaFalha ?? undefined
    })
  })
}
