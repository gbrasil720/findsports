import { expect, test } from 'bun:test'
import { and, eq } from '@findsports_oficial/db'
import { adminAction } from '@findsports_oficial/db/schema/houdini'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  contextFor,
  inAMonth,
  load,
  refusal,
  seedBar
} from './integration-seed'

/**
 * Descrição do bar (WEB-478) contra o banco de verdade: o dono escreve, o
 * torcedor segue com a última aprovada até o Houdini decidir, a recusa leva o
 * motivo ao dono e cada decisão fica no Grimório.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

async function admin() {
  const { appRouter } = await load()
  return appRouter.createCaller(contextFor(crypto.randomUUID(), 'admin'))
}

integrationTest(
  'descrição nova espera a revisão; aprovada, o torcedor vê',
  async () => {
    const ctx = await seedBar('pro', 'active', inAMonth(), {
      description: 'Telão e chope.'
    })
    const houdini = await admin()
    try {
      await ctx.owner.pub.updateMe({ description: 'Telão, chope e petisco.' })
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).description).toBe(
        'Telão e chope.'
      )
      const me = await ctx.owner.pub.getMe()
      expect(me.descriptionPending).toBe('Telão, chope e petisco.')
      expect(me.descriptionReview).toBe('pending')

      const fila = await houdini.adminReview.queue()
      expect(
        fila.descriptions.find((d) => d.barId === ctx.barId)
      ).toMatchObject({
        published: 'Telão e chope.',
        pending: 'Telão, chope e petisco.'
      })

      // O dono mudou o texto depois que o admin leu: a decisão não vale.
      await ctx.owner.pub.updateMe({ description: 'Telão e petisco.' })
      expect(
        (
          await refusal(
            houdini.adminReview.decideDescription({
              barId: ctx.barId,
              text: 'Telão, chope e petisco.',
              approve: true
            })
          )
        ).code
      ).toBe('CONFLICT')

      await houdini.adminReview.decideDescription({
        barId: ctx.barId,
        text: 'Telão e petisco.',
        approve: true
      })
      expect((await ctx.fan.pubs.getById({ id: ctx.barId })).description).toBe(
        'Telão e petisco.'
      )
      expect((await ctx.owner.pub.getMe()).descriptionReview).toBeNull()
      const [entry] = await ctx.db
        .select({ kind: adminAction.kind })
        .from(adminAction)
        .where(
          and(
            eq(adminAction.targetType, 'bar'),
            eq(adminAction.targetId, ctx.barId)
          )
        )
      expect(entry?.kind).toBe('bar.description_approve')
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest(
  'recusa leva o motivo ao dono; bar sem aprovada não mostra descrição',
  async () => {
    const ctx = await seedBar('starter', 'active', inAMonth())
    const houdini = await admin()
    try {
      await ctx.owner.pub.updateMe({ description: 'Ligue 11 99999-9999!' })
      await houdini.adminReview.decideDescription({
        barId: ctx.barId,
        text: 'Ligue 11 99999-9999!',
        approve: false,
        reason: 'Telefone vai no campo de telefone.'
      })
      const me = await ctx.owner.pub.getMe()
      expect(me.descriptionReview).toBe('rejected')
      expect(me.descriptionRejectionReason).toBe(
        'Telefone vai no campo de telefone.'
      )
      expect(
        (await ctx.fan.pubs.getById({ id: ctx.barId })).description
      ).toBeNull()

      // Mandar de novo volta à fila, sem o motivo antigo.
      await ctx.owner.pub.updateMe({ description: 'Bar de bairro.' })
      const again = await ctx.owner.pub.getMe()
      expect(again.descriptionReview).toBe('pending')
      expect(again.descriptionRejectionReason).toBeNull()

      // Apagar tira tudo, sem revisão.
      await ctx.owner.pub.updateMe({ description: '' })
      const [row] = await ctx.db
        .select({
          description: bar.description,
          pending: bar.descriptionPending
        })
        .from(bar)
        .where(eq(bar.id, ctx.barId))
      expect(row).toEqual({ description: null, pending: null })

      for (const caller of [ctx.owner, ctx.fan]) {
        expect(
          (
            await refusal(
              caller.adminReview.decideDescription({
                barId: ctx.barId,
                text: 'x',
                approve: true
              })
            )
          ).code
        ).toBe('FORBIDDEN')
      }
    } finally {
      await ctx.cleanup()
    }
  }
)
