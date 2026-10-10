import { describe, expect, it } from 'bun:test'
import { TRPCError } from '@trpc/server'

import type { Context } from '../context'
import { appRouter } from './index'

/**
 * ESC-09/ESC-10: procedimento de bastidor exige admin no endpoint, e não só
 * no guard da página `/internal`.
 *
 * Estes testes exercitam a autorização pelo router de verdade. Os casos de
 * recusa não chegam ao banco — o middleware corta antes —, então rodam sem
 * depender de infraestrutura.
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

describe('commercialAnalytics.cleanupRetention — autorização (ESC-10)', () => {
  it('recusa quem não tem sessão', async () => {
    const caller = appRouter.createCaller(contextoCom(null))
    try {
      await caller.commercialAnalytics.cleanupRetention({ days: 90 })
      throw new Error('deveria ter recusado')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError)
      expect((err as TRPCError).code).toBe('UNAUTHORIZED')
    }
  })

  it('a retenção de analytics também exige admin (ESC-10)', async () => {
    for (const role of ['fan', 'pub'] as const) {
      const caller = appRouter.createCaller(contextoCom(role))
      try {
        await caller.commercialAnalytics.cleanupRetention({ days: 90 })
        throw new Error(`${role} deveria ter sido recusado`)
      } catch (err) {
        expect(err).toBeInstanceOf(TRPCError)
        expect((err as TRPCError).code).toBe('FORBIDDEN')
      }
    }
  })

  it('a retenção não apaga nada sem pedido explícito (ESC-10)', () => {
    // O padrão do input é o contrato: consolidar sempre, podar só se pedido.
    const schema = (
      appRouter.commercialAnalytics.cleanupRetention as unknown as {
        _def: { inputs: Array<{ parse: (v: unknown) => unknown }> }
      }
    )._def.inputs[0]
    if (!schema) throw new Error('procedimento sem schema de entrada')
    const parsed = schema.parse({}) as { apagarEventosBrutos: boolean }
    expect(parsed.apagarEventosBrutos).toBe(false)
  })
})
