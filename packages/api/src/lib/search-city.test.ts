import { describe, expect, test } from 'bun:test'
import { TRPCError } from '@trpc/server'

import type { Context } from '../context'
import { appRouter } from '../routers/index'
import { findSearchCity } from './search-city'

async function esperarRecusa(work: () => Promise<unknown>) {
  try {
    await work()
    throw new Error('esperava UNPROCESSABLE_CONTENT')
  } catch (error) {
    expect(error).toBeInstanceOf(TRPCError)
    expect((error as TRPCError).code).toBe('UNPROCESSABLE_CONTENT')
  }
}

describe('findSearchCity (WEB-319)', () => {
  test('acha pelo nome sem acento e devolve o nome oficial com a sede', async () => {
    const cidade = await findSearchCity({ name: 'sao paulo', uf: 'sp' })
    expect(cidade.name).toBe('São Paulo')
    expect(cidade.uf).toBe('SP')
    // A sede, perto da Sé — não o centroide do município, 13 km ao sul.
    expect(cidade.lat).toBeCloseTo(-23.53, 1)
    expect(cidade.lng).toBeCloseTo(-46.64, 1)
  })

  test('homônimos de estados diferentes têm centros diferentes', async () => {
    const pi = await findSearchCity({ name: 'Bom Jesus', uf: 'PI' })
    const rn = await findSearchCity({ name: 'Bom Jesus', uf: 'RN' })
    expect(pi.lat).not.toBe(rn.lat)
  })

  test('recusa cidade que não existe e cidade na UF errada', async () => {
    await esperarRecusa(() => findSearchCity({ name: 'Gotham', uf: 'SP' }))
    await esperarRecusa(() => findSearchCity({ name: 'Campinas', uf: 'RJ' }))
  })
})

/**
 * Pelo caller, sem banco: a recusa acontece antes de qualquer escrita.
 */
describe('cidade inexistente não é gravada (WEB-319)', () => {
  const contexto = (onboardingCompleted: boolean) =>
    ({
      auth: null,
      clientIp: '127.0.0.1',
      session: {
        session: { id: 's', userId: 'u', token: 't' },
        user: {
          id: 'u',
          emailVerified: true,
          role: 'fan',
          onboardingCompleted,
          searchRadiusKm: 3,
          twoFactorEnabled: false
        }
      }
    }) as unknown as Context

  test('pubs.updateMyCity', async () => {
    const caller = appRouter.createCaller(contexto(true))
    await esperarRecusa(() =>
      caller.pubs.updateMyCity({ name: 'Gotham', uf: 'SP' })
    )
  })

  test('onboarding.completeFan', async () => {
    const caller = appRouter.createCaller(contexto(false))
    await esperarRecusa(() =>
      caller.onboarding.completeFan({
        sportIds: ['00000000-0000-4000-8000-000000000000'],
        searchRadiusKm: 3,
        city: { name: 'Gotham', uf: 'SP' }
      })
    )
  })
})
