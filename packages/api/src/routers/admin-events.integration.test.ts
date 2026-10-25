import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import {
  event,
  eventParticipants,
  sport,
  team
} from '@findsports_oficial/db/schema/platform'
import { reservation } from '@findsports_oficial/db/schema/reservation'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import {
  contextFor,
  inAMonth,
  load,
  refusal,
  seedBar
} from './integration-seed'

/**
 * Jogos no Houdini (WEB-388) contra o banco: os três avisos, os consertos de
 * um clique, a edição com as regras do painel do bar, a exclusão recusada com
 * reserva e o Grimório de cada ação.
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

async function seed(plan: 'elite' | 'starter' = 'elite') {
  const ctx = await seedBar(plan, 'active', inAMonth())
  const { appRouter } = await load()
  const admin = appRouter.createCaller(contextFor(crypto.randomUUID(), 'admin'))
  const token = `web388-${crypto.randomUUID().slice(0, 8)}`
  const sportId = crypto.randomUUID()
  await ctx.db.insert(sport).values({
    id: sportId,
    name: `Esporte ${sportId}`,
    slug: `integration-${sportId}`
  })
  const [fla, vasco] = await ctx.db
    .insert(team)
    .values([
      { sportId, name: 'Flamengo', slug: `fla-${sportId}` },
      { sportId, name: 'Vasco da Gama', slug: `vasco-${sportId}` }
    ])
    .returning({ id: team.id })
  if (!fla || !vasco) throw new Error('times não criados')

  const startsAt = new Date(Date.now() + 2 * 24 * 3_600_000)
  const addGame = async (
    fields: Partial<typeof event.$inferInsert> = {},
    teamIds: string[] = []
  ) => {
    const [game] = await ctx.db
      .insert(event)
      .values({
        barId: ctx.barId,
        sportId,
        championship: `Campeonato ${token}`,
        startsAt,
        ...fields
      })
      .returning({ id: event.id })
    if (!game) throw new Error('jogo não criado')
    if (teamIds.length) {
      await ctx.db.insert(eventParticipants).values(
        teamIds.map((teamId, position) => ({
          eventId: game.id,
          teamId,
          position
        }))
      )
    }
    return game.id
  }
  const grimorio = async (eventId: string) =>
    (await admin.grimorio.list({ targetType: 'event', targetId: eventId }))
      .entries
  const list = async () =>
    (await admin.adminEvents.list({ period: 'all', search: token })).games

  return {
    ...ctx,
    admin,
    token,
    startsAt,
    fla: fla.id,
    vasco: vasco.id,
    addGame,
    grimorio,
    list,
    cleanup: async () => {
      await ctx.cleanup()
      await ctx.db.delete(sport).where(eq(sport.id, sportId))
    }
  }
}

integrationTest('avisos: duplicado e texto livre', async () => {
  const ctx = await seed()
  try {
    const clean = await ctx.addGame({}, [ctx.fla, ctx.vasco])
    // O duplicado com campeonato escrito diferente fica fora da busca, e
    // mesmo assim o aviso aparece no que ficou dentro.
    await ctx.addGame({ championship: 'Brasileirão' }, [ctx.vasco, ctx.fla])
    const freeText = await ctx.addGame(
      {
        startsAt: new Date(ctx.startsAt.getTime() + 3_600_000),
        participantFreeText: 'flamengo x Vasco da Gama'
      },
      []
    )
    const vague = await ctx.addGame({
      startsAt: new Date(ctx.startsAt.getTime() + 2 * 3_600_000),
      participantFreeText: 'Fla × Vasco'
    })
    const plain = await ctx.addGame({
      startsAt: new Date(ctx.startsAt.getTime() + 4 * 3_600_000),
      participantFreeText: null
    })

    const games = await ctx.list()
    const byId = new Map(games.map((g) => [g.id, g]))
    expect(byId.get(clean)?.warnings).toEqual([
      { kind: 'duplicate', canDelete: true }
    ])
    expect(byId.get(freeText)?.warnings).toEqual([
      {
        kind: 'free_text',
        text: 'flamengo x Vasco da Gama',
        suggestion: [
          { id: ctx.fla, name: 'Flamengo' },
          { id: ctx.vasco, name: 'Vasco da Gama' }
        ]
      }
    ])
    expect(byId.get(vague)?.warnings).toMatchObject([
      { kind: 'free_text', suggestion: null }
    ])
    expect(byId.get(plain)?.warnings).toEqual([])

    const warned = await ctx.admin.adminEvents.list({
      period: 'all',
      search: ctx.token,
      onlyWarnings: true
    })
    expect(warned.games.map((g) => g.id)).not.toContain(plain)
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'rascunho fica fora de Jogos e não faz o publicado virar duplicado',
  async () => {
    const ctx = await seed()
    try {
      const live = await ctx.addGame({}, [ctx.fla, ctx.vasco])
      await ctx.addGame({ publishedAt: null }, [ctx.fla, ctx.vasco])
      await ctx.addGame({
        publishedAt: null,
        startsAt: new Date(ctx.startsAt.getTime() + 3_600_000),
        participantFreeText: 'Fla × Vasco'
      })

      const result = await ctx.admin.adminEvents.list({
        period: 'all',
        search: ctx.token
      })
      expect(result.games.map((g) => [g.id, g.warnings])).toEqual([[live, []]])
      expect(result).toMatchObject({ total: 1, warned: 0, matched: 1 })
    } finally {
      await ctx.cleanup()
    }
  }
)

/**
 * WEB-459: as ações recusam rascunho, como a lista. O jogo fica como estava
 * e o Grimório não ganha linha.
 */
async function expectDraftRefused(
  act: (
    ctx: Awaited<ReturnType<typeof seed>>,
    eventId: string
  ) => Promise<unknown>
) {
  const ctx = await seed()
  try {
    // Duplicado do publicado e com texto livre que casa: sem a recusa, o
    // conserto e a exclusão passariam.
    const text = 'Flamengo x Vasco da Gama'
    await ctx.addGame({ participantFreeText: text })
    const draft = await ctx.addGame({
      publishedAt: null,
      participantFreeText: text
    })
    const [before] = await ctx.db
      .select()
      .from(event)
      .where(eq(event.id, draft))

    expect(await refusal(act(ctx, draft))).toEqual({
      code: 'PRECONDITION_FAILED',
      message: 'Jogo em rascunho: só o bar publica ou apaga.'
    })
    expect(
      await ctx.db.select().from(event).where(eq(event.id, draft))
    ).toEqual([before])
    expect(
      await ctx.db
        .select()
        .from(eventParticipants)
        .where(eq(eventParticipants.eventId, draft))
    ).toEqual([])
    expect(await ctx.grimorio(draft)).toEqual([])
  } finally {
    await ctx.cleanup()
  }
}

integrationTest('editar recusa rascunho', () =>
  expectDraftRefused((ctx, eventId) =>
    ctx.admin.adminEvents.update({
      eventId,
      startsAt: new Date(ctx.startsAt.getTime() + 3_600_000).toISOString(),
      endsAt: null,
      championship: 'Outro campeonato'
    })
  )
)

integrationTest('apagar recusa rascunho', () =>
  expectDraftRefused((ctx, eventId) =>
    ctx.admin.adminEvents.delete({ eventId })
  )
)

integrationTest('apagar duplicado recusa rascunho', () =>
  expectDraftRefused((ctx, eventId) =>
    ctx.admin.adminEvents.fix({ eventId, warning: 'duplicate' })
  )
)

integrationTest('ligar times recusa rascunho', () =>
  expectDraftRefused((ctx, eventId) =>
    ctx.admin.adminEvents.fix({ eventId, warning: 'free_text' })
  )
)

integrationTest(
  'conserto: o duplicado sem reserva sai, o com reserva fica',
  async () => {
    const ctx = await seed()
    try {
      const empty = await ctx.addGame({}, [ctx.fla, ctx.vasco])
      const booked = await ctx.addGame({}, [ctx.fla, ctx.vasco])
      await ctx.db.insert(reservation).values({
        eventId: booked,
        userId: ctx.fanId,
        partySize: 2,
        status: 'confirmed'
      })

      const games = new Map((await ctx.list()).map((g) => [g.id, g]))
      expect(games.get(empty)?.warnings).toEqual([
        { kind: 'duplicate', canDelete: true }
      ])
      expect(games.get(booked)?.warnings).toEqual([
        { kind: 'duplicate', canDelete: false }
      ])
      expect(games.get(booked)?.codes).toBe(1)

      expect(
        await refusal(
          ctx.admin.adminEvents.fix({ eventId: booked, warning: 'duplicate' })
        )
      ).toMatchObject({ code: 'PRECONDITION_FAILED' })

      await ctx.admin.adminEvents.fix({ eventId: empty, warning: 'duplicate' })
      expect(
        await ctx.db.select().from(event).where(eq(event.id, empty))
      ).toHaveLength(0)
      expect((await ctx.list()).map((g) => [g.id, g.warnings])).toEqual([
        [booked, []]
      ])
      const [entry] = await ctx.grimorio(empty)
      expect(entry).toMatchObject({
        kind: 'event.fix',
        targetLabel: 'Flamengo × Vasco da Gama · Bar de integração',
        detail: { warning: 'duplicate' },
        after: null
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('conserto: texto livre vira os times do catálogo', async () => {
  const ctx = await seed()
  try {
    const eventId = await ctx.addGame({
      participantFreeText: 'Flamengo × vasco da gama'
    })
    expect(
      await ctx.admin.adminEvents.fix({ eventId, warning: 'free_text' })
    ).toEqual({ warning: 'free_text', teams: ['Flamengo', 'Vasco da Gama'] })

    const [game] = await ctx.list()
    expect(game?.participants).toEqual(['Flamengo', 'Vasco da Gama'])
    expect(game?.participantFreeText).toBeNull()
    expect(game?.warnings).toEqual([])
    expect((await ctx.grimorio(eventId))[0]).toMatchObject({
      kind: 'event.fix',
      before: { participantFreeText: 'Flamengo × vasco da gama' },
      after: { teams: ['Flamengo', 'Vasco da Gama'] }
    })

    // Repetir não liga duas vezes: o aviso já não existe.
    expect(
      await refusal(
        ctx.admin.adminEvents.fix({ eventId, warning: 'free_text' })
      )
    ).toMatchObject({ code: 'PRECONDITION_FAILED' })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest(
  'edição usa as regras do painel e vai ao Grimório',
  async () => {
    const ctx = await seed('starter')
    try {
      const eventId = await ctx.addGame({}, [ctx.fla, ctx.vasco])
      const base = {
        eventId,
        startsAt: ctx.startsAt.toISOString(),
        endsAt: null,
        championship: 'Brasileirão'
      }

      expect(
        await refusal(
          ctx.admin.adminEvents.update({
            ...base,
            endsAt: new Date(ctx.startsAt.getTime() - 60_000).toISOString()
          })
        )
      ).toEqual({
        code: 'BAD_REQUEST',
        message: 'O horário de término deve ser posterior ao horário de início.'
      })
      expect(
        await refusal(
          ctx.admin.adminEvents.update({
            ...base,
            startsAt: new Date(Date.now() - 86_400_000).toISOString()
          })
        )
      ).toEqual({
        code: 'BAD_REQUEST',
        message: 'Esse horário já passou. Confira o dia e o ano.'
      })

      const later = new Date(ctx.startsAt.getTime() + 30 * 60_000)
      const ends = new Date(later.getTime() + 2 * 3_600_000)
      expect(
        await ctx.admin.adminEvents.update({
          ...base,
          startsAt: later.toISOString(),
          endsAt: ends.toISOString()
        })
      ).toEqual({
        changed: ['startsAt', 'endsAt', 'championship']
      })
      const [row] = await ctx.db
        .select()
        .from(event)
        .where(eq(event.id, eventId))
      expect(row?.startsAt.getTime()).toBe(later.getTime())

      const [entry] = await ctx.grimorio(eventId)
      expect(entry).toMatchObject({
        kind: 'event.update',
        before: {
          startsAt: ctx.startsAt.toISOString(),
          endsAt: null,
          championship: `Campeonato ${ctx.token}`
        },
        after: {
          startsAt: later.toISOString(),
          endsAt: ends.toISOString(),
          championship: 'Brasileirão'
        }
      })
    } finally {
      await ctx.cleanup()
    }
  }
)

integrationTest('exclusão recusa jogo com reserva e diz quantas', async () => {
  const ctx = await seed()
  try {
    const booked = await ctx.addGame()
    await ctx.db.insert(reservation).values({
      eventId: booked,
      userId: ctx.fanId,
      partySize: 3,
      status: 'confirmed'
    })
    expect(
      await refusal(ctx.admin.adminEvents.delete({ eventId: booked }))
    ).toEqual({
      code: 'PRECONDITION_FAILED',
      message: 'Este jogo tem 1 código de quem vai e não pode ser excluído.'
    })
    expect(await ctx.grimorio(booked)).toHaveLength(0)

    const free = await ctx.addGame()
    await ctx.admin.adminEvents.delete({ eventId: free })
    expect(
      await ctx.db.select().from(event).where(eq(event.id, free))
    ).toHaveLength(0)
    expect((await ctx.grimorio(free))[0]).toMatchObject({
      kind: 'event.delete',
      before: { championship: `Campeonato ${ctx.token}` },
      after: null
    })
  } finally {
    await ctx.cleanup()
  }
})

integrationTest('adminEvents é só de admin', async () => {
  const ctx = await seed()
  try {
    expect(await refusal(ctx.owner.adminEvents.list({}))).toMatchObject({
      code: 'FORBIDDEN'
    })
  } finally {
    await ctx.cleanup()
  }
})
