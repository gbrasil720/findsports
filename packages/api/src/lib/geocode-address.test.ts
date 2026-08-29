import { beforeEach, describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'

import { geocodeAddress, limparCacheDeGeocoding } from './geocode-address'

function resposta(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const OK = {
  status: 'OK',
  results: [{ geometry: { location: { lat: -23.5505, lng: -46.6333 } } }]
}

/** Devolve as respostas na ordem, e conta quantas vezes foi chamado. */
function fetchFalso(...respostas: Array<Response | Error>) {
  let chamadas = 0
  const impl = (async () => {
    const proxima = respostas[Math.min(chamadas, respostas.length - 1)]
    chamadas++
    if (proxima instanceof Error) throw proxima
    return proxima
  }) as unknown as typeof fetch
  return { impl, chamadas: () => chamadas }
}

describe('geocoding de endereço (ESC-14)', () => {
  beforeEach(() => limparCacheDeGeocoding())

  it('devolve as coordenadas quando o Google responde OK', async () => {
    const { impl } = fetchFalso(resposta(OK))
    expect(await geocodeAddress('Rua X, Centro, São Paulo', 'k', impl)).toEqual(
      {
        latitude: '-23.5505',
        longitude: '-46.6333'
      }
    )
  })

  it('repete a chamada quando a falha é transitória, e tem sucesso', async () => {
    const f = fetchFalso(
      resposta({ status: 'UNKNOWN_ERROR', results: [] }),
      resposta(OK)
    )
    const coords = await geocodeAddress('Rua Y', 'k', f.impl)
    expect(coords.latitude).toBe('-23.5505')
    expect(f.chamadas()).toBe(2)
  })

  it('repete quando a rede falha', async () => {
    const f = fetchFalso(new Error('ECONNRESET'), resposta(OK))
    await geocodeAddress('Rua Z', 'k', f.impl)
    expect(f.chamadas()).toBe(2)
  })

  it('repete quando o Google devolve erro HTTP', async () => {
    const f = fetchFalso(resposta({}, 502), resposta(OK))
    await geocodeAddress('Rua W', 'k', f.impl)
    expect(f.chamadas()).toBe(2)
  })

  it('NÃO repete quando o endereço simplesmente não existe', async () => {
    const f = fetchFalso(resposta({ status: 'ZERO_RESULTS', results: [] }))
    try {
      await geocodeAddress('Endereço inexistente', 'k', f.impl)
      throw new Error('deveria ter lançado')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('BAD_REQUEST')
    }
    // Repetir gastaria tempo do usuário e cota da API sem chance de mudar.
    expect(f.chamadas()).toBe(1)
  })

  it('serviço fora do ar não vira "endereço não encontrado"', async () => {
    const f = fetchFalso(new Error('timeout'))
    try {
      await geocodeAddress('Rua Q', 'k', f.impl)
      throw new Error('deveria ter lançado')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      // Culpar o endereço faria o usuário corrigir o que estava certo.
      expect((err as TRPCError).code).toBe('SERVICE_UNAVAILABLE')
      expect((err as TRPCError).message).not.toContain('não encontrado')
    }
    expect(f.chamadas()).toBe(2)
  })

  it('chave inválida é problema nosso, e não se repete', async () => {
    const f = fetchFalso(resposta({ status: 'REQUEST_DENIED', results: [] }))
    try {
      await geocodeAddress('Rua R', 'k', f.impl)
      throw new Error('deveria ter lançado')
    } catch (err) {
      expect((err as TRPCError).code).toBe('INTERNAL_SERVER_ERROR')
    }
    expect(f.chamadas()).toBe(1)
  })

  it('endereço repetido não consulta o Google de novo', async () => {
    const f = fetchFalso(resposta(OK))
    await geocodeAddress('Rua Repetida, 100', 'k', f.impl)
    await geocodeAddress('Rua Repetida, 100', 'k', f.impl)
    await geocodeAddress('  RUA   repetida,   100  ', 'k', f.impl)
    expect(f.chamadas()).toBe(1)
  })

  it('falha não é guardada em cache', async () => {
    const f = fetchFalso(
      resposta({ status: 'ZERO_RESULTS', results: [] }),
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
