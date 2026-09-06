import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'

import type { Context } from '../context'
import { appRouter } from './index'

/**
 * WEB-49: os endpoints de busca aceitavam lat/lng fora da faixa geográfica.
 * O PostGIS não rejeita esses valores — ele coage silenciosamente e consulta
 * outro ponto (POINT(999 999) virou POINT(-81 -81) no PostGIS local).
 * Esperado: a API rejeita latitude fora de -90..90 e longitude fora de
 * -180..180 como BAD_REQUEST, antes de chegar a qualquer query.
 *
 * Os testes exercitam o schema real dos routers (via caller e via parser
 * interno), sem banco: a validação corta antes do resolver.
 */
function contextoCom(role: 'fan' | 'pub' | 'admin' | null): Context {
  if (role === null) return { auth: null, session: null, clientIp: '127.0.0.1' }
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: { id: 's', userId: 'u', token: 't' },
      user: {
        id: 'u',
        emailVerified: true,
        role,
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false
      }
    }
  } as unknown as Context
}

async function esperarCodigo(
  work: () => Promise<unknown>,
  code: TRPCError['code']
) {
  try {
    await work()
    throw new Error(`esperava ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe(code)
  }
}

function inputParser(procedure: unknown): {
  parse: (value: unknown) => unknown
} {
  const parser = (
    procedure as {
      _def: { inputs: Array<{ parse: (value: unknown) => unknown }> }
    }
  )._def.inputs[0]
  if (!parser) throw new Error('procedimento sem schema de entrada')
  return parser
}

const FORA_DA_FAIXA: Array<[number, number]> = [
  [999, 999],
  [90.0001, 0],
  [-90.0001, 0],
  [0, 180.0001],
  [0, -180.0001]
]

const EXTREMOS_VALIDOS: Array<[number, number]> = [
  [90, 180],
  [90, -180],
  [-90, 180],
  [-90, -180],
  [0, 0]
]

describe('pubs.search — validação de coordenadas (WEB-49)', () => {
  for (const [lat, lng] of FORA_DA_FAIXA) {
    test(`rejeita lat=${lat} lng=${lng} como BAD_REQUEST`, async () => {
      const caller = appRouter.createCaller(contextoCom('fan'))
      await esperarCodigo(() => caller.pubs.search({ lat, lng }), 'BAD_REQUEST')
    })
  }

  test('aceita os extremos válidos lat=±90 lng=±180', () => {
    const parser = inputParser(appRouter.pubs.search)
    for (const [lat, lng] of EXTREMOS_VALIDOS) {
      expect(() => parser.parse({ lat, lng })).not.toThrow()
    }
  })
})

describe('pubs.searchByLocation — validação de coordenadas (WEB-49)', () => {
  for (const [lat, lng] of FORA_DA_FAIXA) {
    test(`rejeita lat=${lat} lng=${lng} como BAD_REQUEST`, async () => {
      const caller = appRouter.createCaller(contextoCom('fan'))
      await esperarCodigo(
        () => caller.pubs.searchByLocation({ lat, lng }),
        'BAD_REQUEST'
      )
    })
  }

  test('aceita os extremos válidos lat=±90 lng=±180', () => {
    const parser = inputParser(appRouter.pubs.searchByLocation)
    for (const [lat, lng] of EXTREMOS_VALIDOS) {
      expect(() => parser.parse({ lat, lng })).not.toThrow()
    }
  })
})
