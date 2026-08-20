import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'

import type { Context } from '../context'
import { appRouter } from './index'

function context(role: 'fan' | 'pub' | 'admin' | null): Context {
  if (role === null) return { auth: null, session: null, clientIp: '127.0.0.1' }
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: { id: 'session', userId: 'user', token: 'token' },
      user: {
        id: 'user',
        role,
        onboardingCompleted: true,
        searchRadiusKm: 3
      }
    }
  } as unknown as Context
}

async function expectCode(
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

describe('recommendations authorization', () => {
  test('requires a session', async () => {
    const caller = appRouter.createCaller(context(null))
    await expectCode(
      () =>
        caller.recommendations.get({ lat: -23.55, lng: -46.63, radiusKm: 3 }),
      'UNAUTHORIZED'
    )
  })

  test('keeps personalized reads and reset fan-only', async () => {
    for (const role of ['pub', 'admin'] as const) {
      const caller = appRouter.createCaller(context(role))
      await expectCode(
        () =>
          caller.recommendations.get({
            lat: -23.55,
            lng: -46.63,
            radiusKm: 3
          }),
        'FORBIDDEN'
      )
      await expectCode(() => caller.recommendations.reset(), 'FORBIDDEN')
    }
  })

  test('keeps bar quality status pub-only', async () => {
    for (const role of ['fan', 'admin'] as const) {
      const caller = appRouter.createCaller(context(role))
      await expectCode(
        () => caller.recommendations.getMyBarQualityStatus(),
        'FORBIDDEN'
      )
    }
  })
})
