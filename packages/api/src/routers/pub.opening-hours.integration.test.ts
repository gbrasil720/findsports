import { expect, test } from 'bun:test'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { refusal, seedBar } from './integration-seed'

/**
 * Horário do bar (WEB-397): o dono grava a semana no painel, a página do bar
 * devolve as faixas e o "aberto agora" já resolvido, e bar sem horário (ou
 * com a semana toda fechada) não tem seção.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const allDay = { opens: '00:00', closes: '23:59' }

integrationTest(
  'dono grava o horário e a página diz se está aberto',
  async () => {
    const seeded = await seedBar('starter', 'active', null)
    try {
      const before = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(before.openingHours).toBeNull()
      expect(before.openNow).toBeNull()

      const week = Array.from({ length: 7 }, () => allDay)
      await seeded.owner.pub.updateOpeningHours({ openingHours: week })
      const open = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(open.openingHours).toEqual(week)
      // ponytail: falha só no minuto 23:59 de Brasília, quando a faixa fecha.
      expect(open.openNow).toBe(true)

      await seeded.owner.pub.updateOpeningHours({
        openingHours: Array(7).fill(null)
      })
      const closed = await seeded.fan.pubs.getById({ id: seeded.barId })
      expect(closed.openingHours).toBeNull()
      expect(closed.openNow).toBeNull()

      const wrong = await refusal(
        seeded.owner.pub.updateOpeningHours({
          openingHours: [{ opens: '18:00', closes: '18:00' }, ...week.slice(1)]
        })
      )
      expect(wrong.code).toBe('BAD_REQUEST')
    } finally {
      await seeded.cleanup()
    }
  }
)
