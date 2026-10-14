import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * WEB-390: na pele em "Só olhar" a mutação não chega ao banco; com o cookie
 * de "Pode agir" desta sessão, chega. Cookie de outra sessão não libera.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('na pele, só grava em "Pode agir" desta sessão', async () => {
  const { appRouter } = await load()
  const seeded = await seedBar('pro', 'active', null)
  try {
    const base = contextFor(seeded.fanId, 'fan')
    const sessionId = base.session.session.id
    const asSkin = (cookie?: string) =>
      appRouter.createCaller({
        ...base,
        session: {
          ...base.session,
          session: { ...base.session.session, impersonatedBy: 'admin-1' }
        },
        headers: new Headers(cookie ? { cookie } : {})
      })

    for (const caller of [
      asSkin(),
      asSkin(`onside_impersonation_mode=${sessionId}:look`),
      asSkin('onside_impersonation_mode=outra-sessao:act')
    ]) {
      expect(
        await refusal(caller.pubs.favorite({ barId: seeded.barId }))
      ).toEqual({
        code: 'FORBIDDEN',
        message: 'Só olhando: troque para Pode agir na faixa'
      })
      // Ler continua livre.
      expect(await caller.pubs.isFavorited({ barId: seeded.barId })).toEqual({
        isFavorited: false
      })
    }

    const acting = asSkin(`a=1; onside_impersonation_mode=${sessionId}:act`)
    await acting.pubs.favorite({ barId: seeded.barId })
    expect(await acting.pubs.isFavorited({ barId: seeded.barId })).toEqual({
      isFavorited: true
    })
  } finally {
    await seeded.cleanup()
  }
})
