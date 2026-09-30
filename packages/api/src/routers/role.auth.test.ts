import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'

import type { Context } from '../context'
import { appRouter } from './index'
import { pubRouter } from './pub'
import { recommendationsRouter } from './recommendations'
import { reservationsRouter } from './reservations'

function context(role: 'fan' | 'pub' | 'admin'): Context {
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: { id: 'session', userId: 'user', token: 'token' },
      user: {
        id: 'user',
        emailVerified: true,
        role
      }
    }
  } as unknown as Context
}

function all(
  name: string,
  procedures: Record<string, unknown>
): [string, string][] {
  return Object.keys(procedures).map((procedure) => [name, procedure])
}

// A recusa vem do `pubProcedure`/`fanProcedure`, antes do input e do banco.
// Os routers listados com `all` entram sozinhos — um procedimento novo ali que
// não use o procedimento de papel quebra aqui.

// WEB-137
const pubOnly: [string, string][] = [
  ...all('pub', pubRouter._def.procedures),
  ['commercialAnalytics', 'getMyAnalyticsOverview'],
  ['commercialAnalytics', 'getMyEventAnalytics'],
  ['commercialAnalytics', 'getMyEntitlements'],
  ['commercialAnalytics', 'canViewEventType'],
  ['onboarding', 'completePub'],
  ['recommendations', 'getMyBarQualityStatus'],
  ['reservationValidation', 'lookup']
]

// `pubs.isFavorited` e `ratings.getPending` ficam de fora de propósito: para
// quem não é torcedor devolvem vazio, não FORBIDDEN.
const fanOnly: [string, string][] = [
  ...all('reservations', reservationsRouter._def.procedures),
  ...all('recommendations', recommendationsRouter._def.procedures).filter(
    ([, procedure]) => procedure !== 'getMyBarQualityStatus'
  ),
  ['pubs', 'favorite'],
  ['pubs', 'unfavorite'],
  ['pubs', 'getFavorites'],
  ['pubs', 'getMyPreferences'],
  ['pubs', 'updateMyPreferences'],
  ['pubs', 'getMyTeams'],
  ['pubs', 'updateMyTeams'],
  ['ratings', 'submit'],
  ['onboarding', 'completeFan'],
  ['commercialAnalytics', 'recordCommercialEvent']
]

const guards = [
  ['pubProcedure', pubOnly, ['fan', 'admin']],
  ['fanProcedure', fanOnly, ['pub', 'admin']]
] as const

for (const [guard, procedures, roles] of guards) {
  describe(guard, () => {
    for (const role of roles) {
      test.each(
        procedures
      )(`${role} recebe FORBIDDEN em %s.%s`, async (router, procedure) => {
        // biome-ignore lint/suspicious/noExplicitAny: caminho dinâmico
        const caller = appRouter.createCaller(context(role)) as any
        const error = await caller[router]
          [procedure]({})
          .catch((e: unknown) => e)
        expect(error).toBeInstanceOf(TRPCError)
        expect((error as TRPCError).code).toBe('FORBIDDEN')
      })
    }
  })
}
