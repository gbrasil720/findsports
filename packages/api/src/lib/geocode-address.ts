import { TRPCError } from '@trpc/server'

import { createTtlCache } from './ttl-cache'

/**
 * Geocoding de endereço (ESC-14, WEB-73).
 *
 * Antes: um `fetch` cru, sem timeout, sem repetição e sem cache. Se o
 * provedor demorasse, a mutation demorava junto e o usuário ficava esperando
 * sem limite; se falhasse por instabilidade momentânea, o cadastro do bar
 * falhava; e endereços repetidos eram cobrados e consultados de novo.
 *
 * Além disso, qualquer problema virava a mesma mensagem — "endereço não
 * encontrado" —, o que manda o usuário corrigir um endereço que estava certo
 * quando o defeito era do serviço.
 *
 * WEB-73 trocou o provedor: era a Geocoding API do Google (SKU faturado, que
 * parou de responder quando o trial do Google Cloud acabou), agora é a
 * LocationIQ (5.000 consultas/dia no tier grátis, uso comercial permitido com
 * atribuição). O que mudou foi só `consultarProvedor` e o mapeamento de
 * falhas; cache, repetição, timeout e a distinção entre falha transitória e
 * erro do usuário continuam iguais.
 */

const TIMEOUT_MS = 4_000
const TENTATIVAS = 2
const ESPERA_ENTRE_TENTATIVAS_MS = 300
/**
 * O tier grátis da LocationIQ limita a 2 consultas por segundo. Repetir um
 * `429` depois de 300 ms cairia no mesmo limite e queimaria a única tentativa
 * que sobrou — daí a espera mínima acima de um segundo só nesse caso.
 */
const ESPERA_APOS_LIMITE_MS = 1_100
/** Endereço não muda de lugar; o que muda é a base do provedor, devagar. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Endpoint regional da LocationIQ. `us1` é o padrão da conta grátis; `eu1`
 * existe e responde igual. Não é configurável de propósito: um endpoint
 * errado falha como chave inválida, e essa é uma pista péssima.
 */
const ENDPOINT = 'https://us1.locationiq.com/v1/search'

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

class FalhaTransitoria extends Error {
  /**
   * Piso de espera antes da próxima tentativa. Existe por causa do `429`: as
   * outras falhas transitórias (rede, timeout, 5xx) não ganham nada esperando
   * mais.
   */
  readonly esperaMinimaMs: number

  constructor(message: string, esperaMinimaMs = 0) {
    super(message)
    this.esperaMinimaMs = esperaMinimaMs
  }
}

/** Endereço realmente não encontrado: é o usuário que precisa agir. */
function enderecoNaoEncontrado(): TRPCError {
  return new TRPCError({
    code: 'BAD_REQUEST',
    message: 'Endereço não encontrado. Verifique e tente novamente.'
  })
}

/**
 * Problema de configuração nossa (chave ausente, inválida ou suspensa).
 *
 * Vale a mesma regra do provedor anterior: isto NÃO pode virar "endereço não
 * encontrado", senão o dono do bar passa a tarde corrigindo um endereço que
 * estava certo desde o começo.
 */
function falhaDeConfiguracao(detalhe: string): TRPCError {
  console.error('Geocoding recusado pelo provedor:', detalhe)
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Não foi possível validar o endereço agora. Tente mais tarde.'
  })
}

/**
 * A resposta de sucesso da LocationIQ é uma lista de candidatos, ordenada por
 * relevância, com `lat`/`lon` em texto. Só o primeiro interessa: o formulário
 * pede um endereço, não uma busca.
 */
type LocationIqResultado = { lat?: string; lon?: string }

async function consultarProvedor(
  address: string,
  apiKey: string,
  fetchImpl: typeof fetch
): Promise<Coordenadas> {
  const params = new URLSearchParams({
    key: apiKey,
    q: address,
    format: 'json',
    limit: '1',
    // Bar da Onside é bar no Brasil. Sem isto, "Rua da Praia, Centro" casa
    // com uma rua homônima em Portugal e o pino nasce no lugar errado —
    // falha muda, que é a pior.
    countrycodes: 'br',
    // Devolve o nome oficial da cidade em vez do distrito administrativo,
    // que é como o formulário pergunta.
    normalizecity: '1'
  })

  let res: Response
  try {
    res = await fetchImpl(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  } catch (err) {
    // Timeout e erro de rede são indistinguíveis aqui, e ambos valem repetir.
    throw new FalhaTransitoria(
      err instanceof Error ? err.message : 'falha de rede'
    )
  }

  // A LocationIQ sinaliza pelo código HTTP, não por um campo `status` no
  // corpo como o Google fazia. A ordem abaixo é a mesma de antes: primeiro o
  // que é problema nosso, depois o que é problema do endereço.
  if (res.status === 429) {
    throw new FalhaTransitoria('429 rate limit', ESPERA_APOS_LIMITE_MS)
  }
  if (res.status >= 500) {
    throw new FalhaTransitoria(`HTTP ${res.status}`)
  }
  if (res.status === 401 || res.status === 403) {
    throw falhaDeConfiguracao(`HTTP ${res.status} (chave)`)
  }
  // 404 é como a LocationIQ diz "não achei" — é o `ZERO_RESULTS` do Google, e
  // é o único 4xx que fala do endereço, não da nossa configuração.
  if (res.status === 404) {
    throw enderecoNaoEncontrado()
  }
  if (!res.ok) {
    throw falhaDeConfiguracao(`HTTP ${res.status}`)
  }

  // Sem isto, uma página de erro em HTML faria `res.json()` estourar com uma
  // mensagem que não diz nada a quem for ler o log.
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new FalhaTransitoria('resposta não é JSON')
  }

  // Um corpo `{ error: ... }` com 200 já foi visto no tier grátis quando a
  // conta está sob revisão. Cair no ramo de "endereço não encontrado" aqui
  // repetiria o defeito que este arquivo existe para evitar.
  if (!Array.isArray(data)) {
    throw falhaDeConfiguracao(`corpo inesperado: ${JSON.stringify(data)}`)
  }

  const primeiro = data[0] as LocationIqResultado | undefined
  if (!primeiro) throw enderecoNaoEncontrado()

  const latitude = Number.parseFloat(primeiro.lat ?? '')
  const longitude = Number.parseFloat(primeiro.lon ?? '')
  // Coordenada ilegível não é endereço errado: é resposta quebrada. Guardar
  // `NaN` no banco deixaria o bar invisível no mapa para sempre, sem erro.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw falhaDeConfiguracao(
      `coordenada ilegível: ${JSON.stringify(primeiro)}`
    )
  }

  return { latitude: latitude.toString(), longitude: longitude.toString() }
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
        return await consultarProvedor(address, apiKey, fetchImpl)
      } catch (err) {
        // Recusa definitiva não se repete: sobe na hora.
        if (err instanceof TRPCError) throw err
        if (!(err instanceof FalhaTransitoria)) throw err

        ultimaFalha = err
        if (tentativa < TENTATIVAS) {
          await new Promise((r) =>
            setTimeout(
              r,
              Math.max(
                ESPERA_ENTRE_TENTATIVAS_MS * tentativa,
                err.esperaMinimaMs
              )
            )
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
