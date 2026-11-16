import { expect, test } from 'bun:test'
import { and, eq } from '@findsports_oficial/db'
import { bar, barProfileAlert } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { refusal, seedBar } from './integration-seed'

// Alerta de perfil incompleto do painel: um assunto por vez, o próximo só no
// dia seguinte, "Agora não" por 3 dias.

const integrationTest = isDisposableTestDatabase() ? test : test.skip
const inAMonth = () => new Date(Date.now() + 30 * 86_400_000)

integrationTest(
  'mostra o primeiro da fila, segura o próximo até amanhã e guarda a dispensa',
  async () => {
    const meu = await seedBar('elite', 'active', inAMonth(), {
      phone: '11987654321',
      phoneAcceptsWhatsapp: false
    })
    try {
      expect(await meu.owner.pub.getProfileAlert()).toEqual({
        alert: 'horario'
      })
      // Mesmo dia, mesmo assunto.
      expect(await meu.owner.pub.getProfileAlert()).toEqual({
        alert: 'horario'
      })

      // Resolvido sem passar por mutation nenhuma: nada até amanhã.
      await meu.db
        .update(bar)
        .set({ openingHours: [] })
        .where(eq(bar.id, meu.barId))
      expect(await meu.owner.pub.getProfileAlert()).toEqual({ alert: null })

      // Amanhã, o próximo; "Agora não" duas vezes dá no mesmo.
      await meu.db
        .update(barProfileAlert)
        .set({ shownOn: '2000-01-01' })
        .where(eq(barProfileAlert.barId, meu.barId))
      expect(await meu.owner.pub.getProfileAlert()).toEqual({
        alert: 'whatsapp'
      })
      await meu.owner.pub.dismissProfileAlert({ alert: 'whatsapp' })
      await meu.owner.pub.dismissProfileAlert({ alert: 'whatsapp' })
      expect(await meu.owner.pub.getProfileAlert()).toEqual({ alert: null })
      const [row] = await meu.db
        .select({ dismissedUntil: barProfileAlert.dismissedUntil })
        .from(barProfileAlert)
        .where(
          and(
            eq(barProfileAlert.barId, meu.barId),
            eq(barProfileAlert.alert, 'whatsapp')
          )
        )
      const days =
        ((row?.dismissedUntil?.getTime() ?? 0) - Date.now()) / 86_400_000
      expect(days).toBeGreaterThan(2.99)
      expect(days).toBeLessThanOrEqual(3)

      // Bar fora do ar não recebe alerta.
      await meu.db
        .update(bar)
        .set({ isActive: false })
        .where(eq(bar.id, meu.barId))
      await meu.db
        .update(barProfileAlert)
        .set({ shownOn: '2000-01-01' })
        .where(eq(barProfileAlert.barId, meu.barId))
      expect(await meu.owner.pub.getProfileAlert()).toEqual({ alert: null })

      expect(
        (
          await refusal(
            meu.owner.pub.dismissProfileAlert({ alert: 'nada' as 'times' })
          )
        ).code
      ).toBe('BAD_REQUEST')
      expect((await refusal(meu.fan.pub.getProfileAlert())).code).toBe(
        'FORBIDDEN'
      )
    } finally {
      await meu.cleanup()
    }
  }
)
