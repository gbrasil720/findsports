import { expect, spyOn, test } from 'bun:test'
import { setBackgroundTaskHandler } from '@findsports_oficial/auth/background'
import { and, eq, inArray } from '@findsports_oficial/db'
import { aiAction, aiProposal, aiRun } from '@findsports_oficial/db/schema/ai'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { gameReminder } from '@findsports_oficial/db/schema/recommendation'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { setAiBinding } from '../lib/ai/binding'
import type { ChatEvent } from '../lib/ai/events'
import { CHAT_MODELS } from '../lib/ai/models'
import * as friendCalls from '../lib/friend-calls'
import {
  contextFor,
  inAMonth,
  load,
  refusal,
  seedBar
} from './integration-seed'

/**
 * `ai.converse` e `ai.confirm` (R24) de ponta a ponta, com o modelo dublado:
 * os eventos saem na ordem do trabalho, a proposta só vale para o dono e uma
 * vez, e confirmar marca presença com código no bar Elite.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

// Um ponto no mar, longe dos bares de outros testes.
const ORIGIN = { lat: -29.4, lng: -46.9 }

type Body = { messages: { role: string; content: string | null }[] }
const call = (id: string, name: string, args: unknown) => ({
  choices: [
    {
      message: {
        content: null,
        tool_calls: [
          {
            id,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) }
          }
        ]
      }
    }
  ],
  usage: { prompt_tokens: 800, completion_tokens: 40 }
})

/** Primeira volta chama `first`; a segunda responde com o que voltou. */
function fakeModel(first: (id: string) => unknown) {
  return {
    run: async (_model: string, input: Record<string, unknown>) => {
      const last = (input as Body).messages.at(-1)
      if (last?.role === 'user') return first('c1')
      const found = JSON.parse(last?.content ?? '{}').dados?.bares ?? []
      return call('c2', 'responder', {
        texto: found.length
          ? 'O **Bar R24** [[1]] passa o jogo.'
          : 'É só confirmar.',
        bares: found.map((b: { id: string }) => b.id),
        sugestoes: ['E amanhã?', 'Só com oferta da casa']
      })
    }
  }
}

async function collect(stream: AsyncIterable<ChatEvent>) {
  const events: ChatEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

const brief = (events: ChatEvent[]) =>
  events.map((e) =>
    e.type === 'step'
      ? `step:${e.id}:${e.state}`
      : e.type === 'tool'
        ? `tool:${e.state}`
        : e.type
  )

integrationTest(
  'busca: eventos na ordem, cards antes do texto e done com chips',
  async () => {
    const { db, appRouter } = await load()
    const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
    const seeded = await seedBar('pro', 'active', inAMonth(), {
      name: 'Bar R24 Busca',
      latitude: String(ORIGIN.lat + 0.005),
      longitude: String(ORIGIN.lng),
      amenities: [1]
    })
    await seeded.seedGame({ startsAt: new Date(Date.now() + 3_600_000) })
    const fan = appRouter.createCaller(contextFor(seeded.fanId, 'fan'))
    setAiBinding(
      fakeModel((id) =>
        call(id, 'buscar_bares', { caracteristicas: ['telao'] })
      )
    )
    await setAppConfig('ai.enabled', true, null)

    try {
      const events = await collect(
        await fan.ai.converse({
          message: 'quero ver jogo com telão',
          origin: ORIGIN,
          placeLabel: 'Alto-mar'
        })
      )
      expect(brief(events)).toEqual([
        'step:understood:done',
        'step:rank:todo',
        'tool:run',
        'step:search:run',
        'tool:run',
        'bars',
        'step:search:done',
        'tool:done',
        'step:rank:run',
        'step:rank:done',
        'text',
        'done'
      ])
      const bars = events.find((e) => e.type === 'bars')
      expect(bars).toMatchObject({
        bars: [{ id: seeded.barId, name: 'Bar R24 Busca' }]
      })
      expect(events.find((e) => e.type === 'text')).toEqual({
        type: 'text',
        text: 'O **Bar R24** [[1]] passa o jogo.'
      })
      const done = events.at(-1)
      if (done?.type !== 'done') throw new Error('sem done')
      expect(done).toMatchObject({
        status: 'ok',
        searches: 1,
        chips: [
          { key: 'amenities:1', label: 'Telão', icon: 'tv' },
          { key: 'radiusKm:3', label: 'até 3 km', icon: 'pin' }
        ],
        sources: [{ barId: seeded.barId, why: 'Agenda do bar' }],
        suggestions: ['E amanhã?', 'Só com oferta da casa'],
        remainingToday: 9
      })
      expect(done.thoughtMs).toBeGreaterThanOrEqual(0)
      const [row] = await db
        .select()
        .from(aiRun)
        .where(eq(aiRun.runId, done.runId))
      expect(row).toMatchObject({ feature: 'chat', useful: true })
    } finally {
      await resetAppConfig('ai.enabled')
      await db.delete(aiRun).where(eq(aiRun.userId, seeded.fanId))
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'proposta: marcar e chamar só com Confirmar, uma vez e só para o dono',
  async () => {
    const { db, appRouter } = await load()
    const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
    const seeded = await seedBar('elite', 'active', inAMonth(), {
      name: 'Bar R24 Elite',
      neighborhood: 'Mar Aberto',
      latitude: String(ORIGIN.lat + 0.003),
      longitude: String(ORIGIN.lng)
    })
    const gameId = await seeded.seedGame({
      startsAt: new Date(Date.now() + 2 * 3_600_000)
    })
    // Uma amiga aceita e alguém de mesmo nome que não é amigo (vem antes na
    // ordem alfabética: se o filtro de amizade falhasse, seria escolhido).
    const friendId = crypto.randomUUID()
    const strangerId = crypto.randomUUID()
    await db.insert(user).values(
      [
        [friendId, 'Marina Costa'],
        [strangerId, 'Marina Aaa']
      ].map(([id, name]) => ({
        id: id as string,
        name: name as string,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      }))
    )
    await db.insert(friendship).values({
      requesterId: seeded.fanId,
      addresseeId: friendId,
      via: 'search',
      acceptedAt: new Date()
    })
    const fan = appRouter.createCaller(contextFor(seeded.fanId, 'fan'))
    setAiBinding(
      fakeModel((id) =>
        call(id, 'marcar_vou_assistir', {
          bar: 'bar r24 elite',
          chamar: 'Marina'
        })
      )
    )
    await setAppConfig('ai.enabled', true, null)
    const calls: unknown[] = []
    const spy = spyOn(friendCalls, 'createFriendCall').mockImplementation(
      async (input) => {
        calls.push(input)
        return { ok: true, callId: 'chamado', friendName: 'Marina Costa' }
      }
    )

    try {
      const events = await collect(
        await fan.ai.converse({
          message: 'Marca que vou no Bar R24 Elite e chama a Marina',
          origin: ORIGIN
        })
      )
      expect(brief(events)).toEqual([
        'step:understood:done',
        'tool:run',
        'step:game:done',
        'tool:wait',
        'text',
        'proposal',
        'done'
      ])
      expect(events[0]).toMatchObject({ tags: ['bar r24 elite', 'Marina'] })
      expect(events[3]).toMatchObject({
        name: 'marcar_vou_assistir',
        label: 'Marcar presença',
        params: [
          ['bar', 'Bar R24 Elite'],
          ['jogo', expect.stringContaining('Campeonato de integração · ')],
          ['chamar', 'Marina Costa']
        ]
      })
      const proposalEvent = events.find((e) => e.type === 'proposal')
      if (proposalEvent?.type !== 'proposal') throw new Error('sem proposta')
      const { proposal } = proposalEvent
      expect(proposal).toMatchObject({
        bar: { id: seeded.barId, name: 'Bar R24 Elite' },
        game: { id: gameId, title: 'Campeonato de integração' },
        actions: [
          {
            kind: 'going',
            label: 'Marcar “Vou assistir aqui” e gerar seu código',
            on: true
          },
          { kind: 'call', friendId, label: 'Chamar Marina Costa', on: true },
          { kind: 'remind', on: false }
        ]
      })
      const done = events.at(-1)
      if (done?.type !== 'done') throw new Error('sem done')
      expect(done.searches).toBe(0)

      // Nada foi marcado antes do Confirmar.
      const marked = () =>
        db
          .select()
          .from(attendance)
          .where(
            and(
              eq(attendance.userId, seeded.fanId),
              eq(attendance.eventId, gameId)
            )
          )
      expect(await marked()).toHaveLength(0)

      const actions = { going: true, call: true, remind: true }
      const other = appRouter.createCaller(
        contextFor(crypto.randomUUID(), 'fan')
      )
      expect(
        (
          await refusal(
            other.ai.confirm({
              runId: done.runId,
              proposalId: proposal.id,
              actions
            })
          )
        ).code
      ).toBe('NOT_FOUND')

      const confirmed = await fan.ai.confirm({
        runId: done.runId,
        proposalId: proposal.id,
        actions
      })
      expect(confirmed.going).toMatchObject({
        ok: true,
        eventTitle: 'Campeonato de integração',
        barName: 'Bar R24 Elite',
        neighborhood: 'Mar Aberto'
      })
      if (!confirmed.going?.ok) throw new Error('sem presença')
      expect(confirmed.going.code).toMatch(/^[A-Z2-9-]{4,}$/)
      expect(confirmed.call).toEqual({ ok: true, friendName: 'Marina Costa' })
      expect(confirmed.remind).toEqual({ ok: true })
      expect(confirmed.at).toMatch(/^\d{2}:\d{2}$/)
      expect(calls).toEqual([
        {
          fromUserId: seeded.fanId,
          toUserId: friendId,
          eventId: gameId,
          barId: seeded.barId
        }
      ])
      expect(await marked()).toHaveLength(1)
      expect(
        await db
          .select()
          .from(gameReminder)
          .where(eq(gameReminder.userId, seeded.fanId))
      ).toHaveLength(1)
      const kinds = await db
        .select({ kind: aiAction.kind, barId: aiAction.barId })
        .from(aiAction)
        .where(eq(aiAction.runId, done.runId))
      expect(kinds.map((k) => k.kind).sort()).toEqual([
        'call',
        'going',
        'remind'
      ])
      expect(kinds.every((k) => k.barId === seeded.barId)).toBe(true)

      // Uma vez só.
      expect(
        (
          await refusal(
            fan.ai.confirm({
              runId: done.runId,
              proposalId: proposal.id,
              actions
            })
          )
        ).code
      ).toBe('NOT_FOUND')
    } finally {
      spy.mockRestore()
      await resetAppConfig('ai.enabled')
      await db.delete(aiRun).where(eq(aiRun.userId, seeded.fanId))
      await db.delete(user).where(inArray(user.id, [friendId, strangerId]))
      await seeded.cleanup()
    }
  }
)

integrationTest('confirmações em paralelo: só uma executa', async () => {
  const { db, appRouter } = await load()
  const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
  const seeded = await seedBar('elite', 'active', inAMonth(), {
    name: 'Bar R24 Paralelo',
    latitude: String(ORIGIN.lat + 0.004),
    longitude: String(ORIGIN.lng)
  })
  const gameId = await seeded.seedGame({
    startsAt: new Date(Date.now() + 2 * 3_600_000)
  })
  const fan = appRouter.createCaller(contextFor(seeded.fanId, 'fan'))
  setAiBinding(
    fakeModel((id) =>
      call(id, 'marcar_vou_assistir', { bar: 'bar r24 paralelo' })
    )
  )
  await setAppConfig('ai.enabled', true, null)

  try {
    const events = await collect(
      await fan.ai.converse({
        message: 'Marca que vou no Bar R24 Paralelo',
        origin: ORIGIN
      })
    )
    const proposal = events.find((e) => e.type === 'proposal')
    const done = events.at(-1)
    if (proposal?.type !== 'proposal' || done?.type !== 'done')
      throw new Error('sem proposta')
    const confirm = () =>
      fan.ai.confirm({
        runId: done.runId,
        proposalId: proposal.proposal.id,
        actions: { going: true, call: false, remind: false }
      })
    const results = await Promise.allSettled([confirm(), confirm()])
    expect(results.map((r) => r.status).sort()).toEqual([
      'fulfilled',
      'rejected'
    ])
    expect(
      await db
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.userId, seeded.fanId),
            eq(attendance.eventId, gameId)
          )
        )
    ).toHaveLength(1)
    expect(
      await db.select().from(aiAction).where(eq(aiAction.runId, done.runId))
    ).toHaveLength(1)
  } finally {
    await resetAppConfig('ai.enabled')
    await db.delete(aiRun).where(eq(aiRun.userId, seeded.fanId))
    await seeded.cleanup()
  }
})

integrationTest(
  'app desconecta no meio: o trabalho segue no waitUntil e grava o ai_run',
  async () => {
    const { db, appRouter } = await load()
    const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
    const seeded = await seedBar('pro', 'active', inAMonth(), {
      name: 'Bar R24 Parou',
      latitude: String(ORIGIN.lat + 0.006),
      longitude: String(ORIGIN.lng)
    })
    await seeded.seedGame({ startsAt: new Date(Date.now() + 3_600_000) })
    const fan = appRouter.createCaller(contextFor(seeded.fanId, 'fan'))
    setAiBinding(fakeModel((id) => call(id, 'buscar_bares', {})))
    await setAppConfig('ai.enabled', true, null)
    // O Worker registra o waitUntil aqui; o teste guarda as promessas.
    const background: Promise<unknown>[] = []
    setBackgroundTaskHandler((promise) => background.push(promise))

    try {
      const seen: ChatEvent[] = []
      for await (const event of await fan.ai.converse({
        message: 'tem jogo hoje?',
        origin: ORIGIN
      })) {
        seen.push(event)
        break
      }
      expect(seen).toHaveLength(1)
      expect(background).toHaveLength(1)
      await Promise.all(background)
      const rows = await db
        .select()
        .from(aiRun)
        .where(eq(aiRun.userId, seeded.fanId))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ feature: 'chat', useful: true })
    } finally {
      setBackgroundTaskHandler(() => {})
      await resetAppConfig('ai.enabled')
      await db.delete(aiRun).where(eq(aiRun.userId, seeded.fanId))
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'limite e indisponível saem como blocked, sem chamar modelo',
  async () => {
    const { db, appRouter } = await load()
    const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
    const seeded = await seedBar('pro', 'active', null)
    const fan = appRouter.createCaller(contextFor(seeded.fanId, 'fan'))
    let ran = 0
    setAiBinding({
      run: async () => {
        ran++
        return {}
      }
    })

    try {
      expect(await collect(await fan.ai.converse({ message: 'oi' }))).toEqual([
        { type: 'blocked', reason: 'unavailable' }
      ])
      await setAppConfig('ai.enabled', true, null)
      await db.insert(aiRun).values(
        Array.from({ length: 10 }, () => ({
          userId: seeded.fanId,
          feature: 'chat' as const,
          variant: 'a',
          assignedModel: CHAT_MODELS.a,
          status: 'ok' as const,
          useful: true
        }))
      )
      const [blocked] = await collect(await fan.ai.converse({ message: 'oi' }))
      expect(blocked).toMatchObject({
        type: 'blocked',
        reason: 'limit',
        scope: 'day'
      })
      expect(ran).toBe(0)
      expect(
        await db
          .select()
          .from(aiProposal)
          .where(eq(aiProposal.userId, seeded.fanId))
      ).toHaveLength(0)
    } finally {
      await resetAppConfig('ai.enabled')
      await db.delete(aiRun).where(eq(aiRun.userId, seeded.fanId))
      await seeded.cleanup()
    }
  }
)
