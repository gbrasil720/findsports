import { expect, test } from 'bun:test'
import { and, eq } from '@findsports_oficial/db'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import { bar, subscription } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * Truques de Bares (WEB-385) contra o banco de verdade: cada um muda o bar e
 * deixa a linha no Grimório, e o que não cabe é recusado sem escrever nada.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const DAY = 24 * 3_600_000

async function admin() {
  const { appRouter } = await load()
  return appRouter.createCaller(contextFor(crypto.randomUUID(), 'admin'))
}

async function grimorio(barId: string) {
  const { db } = await load()
  return db
    .select()
    .from(adminAction)
    .where(
      and(eq(adminAction.targetType, 'bar'), eq(adminAction.targetId, barId))
    )
}

async function stored(barId: string) {
  const { db } = await load()
  const [row] = await db
    .select({
      plan: bar.plan,
      isActive: bar.isActive,
      currentPeriodEnd: subscription.currentPeriodEnd
    })
    .from(bar)
    .leftJoin(subscription, eq(subscription.barId, bar.id))
    .where(eq(bar.id, barId))
  return row
}

integrationTest(
  'syncSearchPlan: teste vencido sai do Elite na busca, e só uma vez',
  async () => {
    const seeded = await seedBar(
      'elite',
      'trialing',
      new Date(Date.now() - DAY)
    )
    try {
      // O teste venceu sem ninguém escrever na assinatura, então a trigger
      // não viu: a busca segue no Elite até a reconciliação.
      await seeded.db
        .update(bar)
        .set({ plan: 'elite' })
        .where(eq(bar.id, seeded.barId))
      const caller = await admin()

      expect(
        await caller.adminBars.syncSearchPlan({ barId: seeded.barId })
      ).toEqual({ before: 'elite', after: 'starter', changed: true })
      expect((await stored(seeded.barId))?.plan).toBe('starter')

      // Em dia: nada muda e o Grimório não ganha linha repetida.
      expect(
        await caller.adminBars.syncSearchPlan({ barId: seeded.barId })
      ).toMatchObject({ changed: false })

      const entries = await grimorio(seeded.barId)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({
        kind: 'bar.sync_search',
        actorName: 'Conta admin',
        targetLabel: 'Bar de integração',
        before: { plan: 'elite' },
        after: { plan: 'starter' }
      })
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'extendTrial: teste vencido conta de agora e o bar volta ao ar no plano do teste',
  async () => {
    const seeded = await seedBar(
      'pro',
      'trialing',
      new Date(Date.now() - 3 * DAY),
      { isActive: false }
    )
    try {
      expect((await stored(seeded.barId))?.plan).toBe('starter')
      const before = Date.now()
      const result = await (await admin()).adminBars.extendTrial({
        barId: seeded.barId,
        days: 7
      })
      const end = result.currentPeriodEnd?.getTime() ?? 0
      // De agora, não do fim vencido: sete dias à frente, com folga de relógio.
      expect(end).toBeGreaterThan(before + 7 * DAY - 60_000)
      expect(end).toBeLessThan(Date.now() + 7 * DAY + 60_000)
      expect(result.isActive).toBe(true)
      expect(await stored(seeded.barId)).toMatchObject({
        plan: 'pro',
        isActive: true
      })

      const [entry] = await grimorio(seeded.barId)
      expect(entry).toMatchObject({
        kind: 'bar.extend_trial',
        before: { isActive: false },
        after: { isActive: true },
        detail: { days: 7 }
      })
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'extendTrial: teste valendo soma ao fim atual e não religa bar tirado do ar',
  async () => {
    const end = new Date(Date.now() + 10 * DAY)
    end.setMilliseconds(0)
    const seeded = await seedBar('elite', 'trialing', end, { isActive: false })
    try {
      const result = await (await admin()).adminBars.extendTrial({
        barId: seeded.barId,
        days: 14
      })
      expect(result.currentPeriodEnd).toEqual(
        new Date(end.getTime() + 14 * DAY)
      )
      expect(result.isActive).toBe(false)
      expect((await stored(seeded.barId))?.isActive).toBe(false)
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'extendTrial recusa assinatura do Stripe e não escreve nada',
  async () => {
    const end = new Date(Date.now() + 5 * DAY)
    end.setMilliseconds(0)
    const seeded = await seedBar('pro', 'trialing', end)
    try {
      await seeded.db
        .update(subscription)
        .set({
          provider: 'stripe',
          externalSubscriptionId: `sub_${crypto.randomUUID()}`
        })
        .where(eq(subscription.barId, seeded.barId))
      const caller = await admin()

      expect(
        await refusal(
          caller.adminBars.extendTrial({ barId: seeded.barId, days: 30 })
        )
      ).toEqual({
        code: 'PRECONDITION_FAILED',
        message:
          'Este bar assina pelo Stripe: o fim do período é do Stripe, não dá para estender por aqui.'
      })
      expect((await stored(seeded.barId))?.currentPeriodEnd).toEqual(end)
      expect(await grimorio(seeded.barId)).toHaveLength(0)

      // Plano pago sem Stripe também não é teste do cadastro.
      await seeded.db
        .update(subscription)
        .set({ status: 'active', provider: null, externalSubscriptionId: null })
        .where(eq(subscription.barId, seeded.barId))
      expect(
        (
          await refusal(
            caller.adminBars.extendTrial({ barId: seeded.barId, days: 7 })
          )
        ).message
      ).toBe('Só o teste grátis do cadastro pode ser estendido.')
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'setActive: tira do ar e religa, cada vez no Grimório',
  async () => {
    const seeded = await seedBar('pro', 'active', new Date(Date.now() + DAY))
    try {
      const caller = await admin()
      expect(
        await caller.adminBars.setActive({ barId: seeded.barId, active: false })
      ).toEqual({ isActive: false, changed: true })
      expect((await stored(seeded.barId))?.isActive).toBe(false)
      // Repetir não muda nada nem escreve.
      expect(
        await caller.adminBars.setActive({ barId: seeded.barId, active: false })
      ).toEqual({ isActive: false, changed: false })
      await caller.adminBars.setActive({ barId: seeded.barId, active: true })
      expect((await stored(seeded.barId))?.isActive).toBe(true)

      const kinds = (await grimorio(seeded.barId))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((e) => [e.kind, e.before, e.after])
      expect(kinds).toEqual([
        ['bar.take_off_air', { isActive: true }, { isActive: false }],
        ['bar.put_on_air', { isActive: false }, { isActive: true }]
      ])
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'setActive recusa religar com o teste do cadastro vencido',
  async () => {
    const seeded = await seedBar(
      'elite',
      'trialing',
      new Date(Date.now() - DAY),
      { isActive: false }
    )
    try {
      expect(
        (
          await refusal(
            (
              await admin()
            ).adminBars.setActive({
              barId: seeded.barId,
              active: true
            })
          )
        ).code
      ).toBe('PRECONDITION_FAILED')
      expect((await stored(seeded.barId))?.isActive).toBe(false)
      expect(await grimorio(seeded.barId)).toHaveLength(0)
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest('os truques recusam dono de bar e torcedor', async () => {
  const seeded = await seedBar('pro', 'active', new Date(Date.now() + DAY))
  try {
    for (const caller of [seeded.owner, seeded.fan]) {
      for (const call of [
        caller.adminBars.syncSearchPlan({ barId: seeded.barId }),
        caller.adminBars.extendTrial({ barId: seeded.barId, days: 7 }),
        caller.adminBars.setActive({ barId: seeded.barId, active: false }),
        caller.adminBars.ficha({ barId: seeded.barId })
      ]) {
        expect((await refusal(call)).code).toBe('FORBIDDEN')
      }
    }
    expect((await stored(seeded.barId))?.isActive).toBe(true)
  } finally {
    await seeded.cleanup()
  }
})

integrationTest(
  'ficha: jogos com reservas, avaliações e o Grimório do bar',
  async () => {
    const seeded = await seedBar(
      'elite',
      'trialing',
      new Date(Date.now() + DAY)
    )
    try {
      const gameId = await seeded.seedGame()
      const { reservation } = await import(
        '@findsports_oficial/db/schema/reservation'
      )
      await seeded.db.insert(reservation).values({
        eventId: gameId,
        userId: seeded.fanId,
        partySize: 4,
        status: 'confirmed'
      })
      const caller = await admin()
      await caller.adminBars.setActive({ barId: seeded.barId, active: false })

      const ficha = await caller.adminBars.ficha({ barId: seeded.barId })
      expect(ficha).toMatchObject({
        id: seeded.barId,
        isActive: false,
        barPlan: 'elite',
        expectedSearchPlan: 'elite',
        currentPlan: 'elite',
        standing: 'current',
        stripeUrl: null,
        owner: { name: 'Dono de integração' },
        reservations30d: { n: 1, people: 4 },
        ratingCount: 0
      })
      expect(ficha.games).toEqual([
        expect.objectContaining({
          id: gameId,
          title: 'Campeonato de integração',
          reservations: 1,
          people: 4
        })
      ])
      expect(ficha.reservations).toEqual([
        expect.objectContaining({
          guestName: 'Torcedor de integração',
          partySize: 4,
          status: 'confirmed'
        })
      ])
      expect(ficha.grimorio.map((e) => e.kind)).toEqual(['bar.take_off_air'])

      expect(
        (await refusal(caller.adminBars.ficha({ barId: crypto.randomUUID() })))
          .code
      ).toBe('NOT_FOUND')
    } finally {
      await seeded.cleanup()
    }
  }
)
