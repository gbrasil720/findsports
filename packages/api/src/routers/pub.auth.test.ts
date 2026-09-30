import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'

import type { Context } from '../context'
import { appRouter } from './index'
import { pubRouter } from './pub'

function context(role: 'fan' | 'admin'): Context {
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: { id: 'session', userId: 'user', token: 'token' },
      user: {
        id: 'user',
        emailVerified: true,
        role,
        admittedAt: new Date(),
        onboardingCompleted: false
      }
    }
  } as unknown as Context
}

// WEB-137: a recusa vem do `pubProcedure`, antes do input e do banco. Todo
// procedimento de `pub` entra sozinho — um novo que não use `pubProcedure`
// quebra aqui.
const pubOnly: [string, string][] = [
  ...Object.keys(pubRouter._def.procedures).map((name): [string, string] => [
    'pub',
    name
  ]),
  ['commercialAnalytics', 'getMyAnalyticsOverview'],
  ['commercialAnalytics', 'getMyEventAnalytics'],
  ['commercialAnalytics', 'getMyEntitlements'],
  ['commercialAnalytics', 'canViewEventType'],
  ['onboarding', 'completePub'],
  ['reservationValidation', 'lookup']
]

describe('pubProcedure', () => {
  for (const role of ['fan', 'admin'] as const) {
    test.each(
      pubOnly
    )(`${role} recebe FORBIDDEN em %s.%s`, async (router, procedure) => {
      // biome-ignore lint/suspicious/noExplicitAny: caminho dinâmico
      const caller = appRouter.createCaller(context(role)) as any
      const error = await caller[router][procedure]({}).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(TRPCError)
      expect((error as TRPCError).code).toBe('FORBIDDEN')
    })
  }
})
