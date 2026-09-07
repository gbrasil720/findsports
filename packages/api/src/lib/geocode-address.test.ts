import { beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'

import { geocodeAddress, limparCacheDeGeocoding } from './geocode-address'

function resposta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

/** Formato de sucesso da LocationIQ: lista de candidatos, `lat`/`lon` em texto. */
const OK = [{ lat: '-23.5505', lon: '-46.6333' }]

/** Devolve as respostas na ordem, e guarda as URLs consultadas. */
function fetchFalso(...respostas: Array<Response | Error>) {
  let chamadas = 0
  const urls: string[] = []
  const impl = (async (input: string) => {
    urls.push(String(input))
    const proxima = respostas[Math.min(chamadas, respostas.length - 1)]
    chamadas++
    if (proxima instanceof Error) throw proxima
    return proxima
  }) as unknown as typeof fetch
  return { impl, chamadas: () => chamadas, urls: () => urls }
}

async function capturar(promessa: Promise<unknown>): Promise<TRPCError> {
  try {
    await promessa
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError)
    return err as TRPCError
  }
  throw new Error('deveria ter lançado')
}

describe('geocoding de endereço (ESC-14, WEB-73)', () => {
  beforeEach(() => limparCacheDeGeocoding())

  it('devolve as coordenadas quando o provedor responde OK', async () => {
    const { impl } = fetchFalso(resposta(OK))
    expect(await geocodeAddress('Rua X, Centro, São Paulo', 'k', impl)).toEqual(
      {
        latitude: '-23.5505',
        longitude: '-46.6333'
      }
    )
  })

  it('restringe a busca ao Brasil', async () => {
    // Sem `countrycodes`, "Rua da Praia, Centro" casa com uma rua homônima em
    // Portugal e o bar nasce com a coordenada errada, sem erro nenhum.
    const f = fetchFalso(resposta(OK))
    await geocodeAddress('Rua da Praia, Centro', 'k', f.impl)
    const url = new URL(f.urls()[0] as string)
    expect(url.searchParams.get('countrycodes')).toBe('br')
    expect(url.searchParams.get('key')).toBe('k')
    expect(url.searchParams.get('q')).toBe('Rua da Praia, Centro')
  })

  it('repete a chamada quando o provedor devolve erro de servidor', async () => {
    const f = fetchFalso(resposta({}, 502), resposta(OK))
    const coords = await geocodeAddress('Rua Y', 'k', f.impl)
    expect(coords.latitude).toBe('-23.5505')
    expect(f.chamadas()).toBe(2)
  })

  it('repete quando a rede falha', async () => {
    const f = fetchFalso(new Error('ECONNRESET'), resposta(OK))
    await geocodeAddress('Rua Z', 'k', f.impl)
    expect(f.chamadas()).toBe(2)
  })

  it('repete quando bate no limite de consultas por segundo', async () => {
    // O tier grátis permite 2 req/s: a repetição precisa esperar mais de um
    // segundo, senão gasta a última tentativa no mesmo 429.
    const f = fetchFalso(
      resposta({ error: 'Rate Limited Second' }, 429),
      resposta(OK)
    )
    const inicio = Date.now()
    await geocodeAddress('Rua Limitada', 'k', f.impl)
    expect(f.chamadas()).toBe(2)
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(1_000)
  })

  it('NÃO repete quando o endereço simplesmente não existe (404)', async () => {
    const f = fetchFalso(resposta({ error: 'Unable to geocode' }, 404))
    const err = await capturar(
      geocodeAddress('Endereço inexistente', 'k', f.impl)
    )
    expect(err.code).toBe('BAD_REQUEST')
    // Repetir gastaria tempo do usuário e cota da API sem chance de mudar.
    expect(f.chamadas()).toBe(1)
  })

  it('lista vazia também é endereço não encontrado', async () => {
    const f = fetchFalso(resposta([]))
    const err = await capturar(geocodeAddress('Rua Vazia', 'k', f.impl))
    expect(err.code).toBe('BAD_REQUEST')
    expect(f.chamadas()).toBe(1)
  })

  it('serviço fora do ar não vira "endereço não encontrado"', async () => {
    const f = fetchFalso(new Error('timeout'))
    const err = await capturar(geocodeAddress('Rua Q', 'k', f.impl))
    // Culpar o endereço faria o usuário corrigir o que estava certo.
    expect(err.code).toBe('SERVICE_UNAVAILABLE')
    expect(err.message).not.toContain('não encontrado')
    expect(f.chamadas()).toBe(2)
  })

  it('chave inválida é problema nosso, e não se repete', async () => {
    const f = fetchFalso(resposta({ error: 'Invalid key' }, 401))
    const err = await capturar(geocodeAddress('Rua R', 'k', f.impl))
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
    expect(err.message).not.toContain('não encontrado')
    expect(f.chamadas()).toBe(1)
  })

  it('erro num corpo 200 não é confundido com endereço inexistente', async () => {
    const f = fetchFalso(resposta({ error: 'Account under review' }))
    const err = await capturar(geocodeAddress('Rua T', 'k', f.impl))
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
  })

  it('coordenada ilegível não vira NaN no banco', async () => {
    // Gravar NaN deixaria o bar invisível no mapa para sempre, sem erro.
    const f = fetchFalso(resposta([{ lat: 'norte', lon: 'oeste' }]))
    const err = await capturar(geocodeAddress('Rua U', 'k', f.impl))
    expect(err.code).toBe('INTERNAL_SERVER_ERROR')
  })

  it('endereço repetido não consulta o provedor de novo', async () => {
    const f = fetchFalso(resposta(OK))
    await geocodeAddress('Rua Repetida, 100', 'k', f.impl)
    await geocodeAddress('Rua Repetida, 100', 'k', f.impl)
    await geocodeAddress('  RUA   repetida,   100  ', 'k', f.impl)
    expect(f.chamadas()).toBe(1)
  })

  it('falha não é guardada em cache', async () => {
    const f = fetchFalso(
      resposta({ error: 'Unable to geocode' }, 404),
      resposta(OK)
    )
    await expect(geocodeAddress('Rua S', 'k', f.impl)).rejects.toThrow(
      TRPCError
    )
    // A segunda chamada precisa tentar de novo, não repetir a recusa.
    const coords = await geocodeAddress('Rua S', 'k', f.impl)
    expect(coords.latitude).toBe('-23.5505')
  })
})
