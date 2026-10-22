import { expect, test } from 'bun:test'
import { and, eq, inArray, or } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendCall, friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * Chamado de amigo (Rodada 24): só entre amigos, um por jogo, jogo acabado
 * recusa; "Vou também" marca presença e traz o código no bar Elite; "Agora
 * não" não avisa quem chamou.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest('chamado de amigo de ponta a ponta', async () => {
  const elite = await seedBar('elite', 'active', null)
  const starter = await seedBar('starter', 'active', null)
  const { db, appRouter } = await load()
  const { createFriendCall } = await import('../lib/friend-calls')
  const tag = crypto.randomUUID().slice(0, 8)
  const make = (name: string) => ({
    id: crypto.randomUUID(),
    name: `${name} ${tag}`,
    email: `${name.toLowerCase()}-${tag}@integration.invalid`,
    emailVerified: true,
    role: 'fan' as const,
    onboardingCompleted: true
  })
  const marina = make('Marina')
  const rafa = make('Rafa')
  const estranho = make('Estranho')
  const people = [marina, rafa, estranho]
  const gabriel = elite.fanId
  const as = (id: string) =>
    appRouter.createCaller(contextFor(id, 'fan')).friends
  try {
    await db.insert(user).values(people)
    await db.insert(friendship).values([
      {
        requesterId: gabriel,
        addresseeId: marina.id,
        via: 'search',
        acceptedAt: new Date()
      },
      {
        requesterId: rafa.id,
        addresseeId: gabriel,
        via: 'code',
        acceptedAt: new Date()
      },
      {
        requesterId: starter.fanId,
        addresseeId: marina.id,
        via: 'code',
        acceptedAt: new Date()
      },
      // Pedido não aceito não é amizade.
      { requesterId: gabriel, addresseeId: estranho.id, via: 'search' }
    ])
    const game = await elite.seedGame()
    const ended = await elite.seedGame({
      startsAt: new Date(Date.now() - 5 * 3_600_000)
    })
    const call = (toUserId: string, eventId = game, barId = elite.barId) =>
      createFriendCall({ fromUserId: gabriel, toUserId, eventId, barId })

    // Criar: amigo sim, repetido não duplica, não-amigo e jogo acabado não.
    const first = await call(marina.id)
    expect(first).toMatchObject({ ok: true, friendName: marina.name })
    expect(await call(marina.id)).toEqual({ ok: false, reason: 'duplicate' })
    expect(await call(estranho.id)).toEqual({
      ok: false,
      reason: 'not_friends'
    })
    expect(await call(marina.id, ended)).toEqual({
      ok: false,
      reason: 'past_game'
    })
    const rafaCall = await call(rafa.id)
    if (!first.ok || !rafaCall.ok) throw new Error('chamado não criado')

    // Marina vê o chamado pendente; Gabriel ainda não tem aviso.
    const received = (await as(marina.id).notices()).calls
    expect(received.map((c) => [c.id, c.status, c.person.id])).toEqual([
      [first.callId, 'pending', gabriel]
    ])
    expect(received[0]?.barName).toBe('Bar de integração')
    expect((await as(gabriel).notices()).callsAccepted).toEqual([])

    // Só quem recebeu responde.
    expect(
      (
        await refusal(
          as(gabriel).respondCall({ callId: first.callId, answer: 'going' })
        )
      ).code
    ).toBe('NOT_FOUND')

    // "Vou também": presença marcada e código do balcão (bar Elite).
    const going = await as(marina.id).respondCall({
      callId: first.callId,
      answer: 'going'
    })
    expect(going.status).toBe('going')
    expect(going.code).toMatch(/^[A-Z0-9]{6}$/)
    const marked = await db
      .select()
      .from(attendance)
      .where(
        and(eq(attendance.userId, marina.id), eq(attendance.eventId, game))
      )
    expect(marked).toHaveLength(1)
    expect((await as(marina.id).notices()).calls[0]?.status).toBe('going')
    // Responder de novo não muda nada.
    expect(
      (
        await refusal(
          as(marina.id).respondCall({ callId: first.callId, answer: 'not_now' })
        )
      ).code
    ).toBe('PRECONDITION_FAILED')

    // "Agora não": Rafa vê a resposta; Gabriel só tem o aviso da Marina.
    await as(rafa.id).respondCall({
      callId: rafaCall.callId,
      answer: 'not_now'
    })
    expect((await as(rafa.id).notices()).calls[0]?.status).toBe('not_now')
    const sent = (await as(gabriel).notices()).callsAccepted
    expect(sent.map((c) => [c.person.id, c.status])).toEqual([
      [marina.id, 'going']
    ])

    // Bar que não emite código: presença sem código.
    const plain = await starter.seedGame()
    const other = await createFriendCall({
      fromUserId: starter.fanId,
      toUserId: marina.id,
      eventId: plain,
      barId: starter.barId
    })
    if (!other.ok) throw new Error('chamado não criado')
    const noCode = await as(marina.id).respondCall({
      callId: other.callId,
      answer: 'going'
    })
    expect(noCode.code).toBeNull()
  } finally {
    await db.delete(user).where(
      inArray(
        user.id,
        people.map((p) => p.id)
      )
    )
    await elite.cleanup()
    await starter.cleanup()
  }
})

integrationTest('chamado de amigo: casos de borda', async () => {
  const elite = await seedBar('elite', 'active', null)
  const closed = await seedBar('elite', 'active', null, { isActive: false })
  const { db, appRouter } = await load()
  const { createFriendCall } = await import('../lib/friend-calls')
  const tag = crypto.randomUUID().slice(0, 8)
  const make = (name: string) => ({
    id: crypto.randomUUID(),
    name: `${name} ${tag}`,
    email: `${name.toLowerCase()}-${tag}@integration.invalid`,
    emailVerified: true,
    role: 'fan' as const,
    onboardingCompleted: true
  })
  const marina = make('Marina')
  const rafa = make('Rafa')
  const people = [marina, rafa]
  const gabriel = elite.fanId
  const caller = (id: string) => appRouter.createCaller(contextFor(id, 'fan'))
  const as = (id: string) => caller(id).friends
  const call = (
    eventId: string,
    toUserId: string = marina.id,
    barId = elite.barId,
    fromUserId: string = gabriel
  ) => createFriendCall({ fromUserId, toUserId, eventId, barId })
  const marked = (userId: string, eventId: string) =>
    db
      .select()
      .from(attendance)
      .where(
        and(eq(attendance.userId, userId), eq(attendance.eventId, eventId))
      )
  try {
    await db.insert(user).values(people)
    await db.insert(friendship).values(
      [marina, rafa].map((p) => ({
        requesterId: gabriel,
        addresseeId: p.id,
        via: 'search' as const,
        acceptedAt: new Date()
      }))
    )

    // Jogo começado e ainda rolando: a presença não seria marcada.
    const started = await elite.seedGame({
      startsAt: new Date(Date.now() - 30 * 60_000)
    })
    expect(await call(started)).toEqual({ ok: false, reason: 'past_game' })
    // Bar fora do ar e bar trocado: como jogo inexistente.
    const hidden = await closed.seedGame()
    expect((await refusal(call(hidden, marina.id, closed.barId))).code).toBe(
      'NOT_FOUND'
    )
    const game = await elite.seedGame()
    expect((await refusal(call(game, marina.id, closed.barId))).code).toBe(
      'NOT_FOUND'
    )

    // Corrida: dois toques juntos respondem uma vez só.
    const raced = await call(game)
    if (!raced.ok) throw new Error('chamado não criado')
    const answers = await Promise.allSettled([
      as(marina.id).respondCall({ callId: raced.callId, answer: 'not_now' }),
      as(marina.id).respondCall({ callId: raced.callId, answer: 'going' })
    ])
    const won = answers.filter((a) => a.status === 'fulfilled')
    expect(won).toHaveLength(1)
    const lost = answers.find((a) => a.status === 'rejected')
    expect((lost?.reason as { code?: string }).code).toBe('PRECONDITION_FAILED')
    const winner = (won[0] as PromiseFulfilledResult<{ status: string }>).value
    expect(await marked(marina.id, game)).toHaveLength(
      winner.status === 'going' ? 1 : 0
    )

    // Presença desmarcada: "vai também" e "Você vai" somem dos dois lados.
    const other = await elite.seedGame()
    const going = await call(other)
    if (!going.ok) throw new Error('chamado não criado')
    await as(marina.id).respondCall({ callId: going.callId, answer: 'going' })
    const sentIds = async () =>
      (await as(gabriel).notices()).callsAccepted.map((c) => c.id)
    const receivedIds = async () =>
      (await as(marina.id).notices()).calls.map((c) => c.id)
    expect(await sentIds()).toContain(going.callId)
    expect(await receivedIds()).toContain(going.callId)
    await caller(marina.id).attendance.set({
      eventId: other,
      attending: false
    })
    expect(await sentIds()).not.toContain(going.callId)
    expect(await receivedIds()).not.toContain(going.callId)

    // Amizade desfeita: os chamados da dupla saem nas duas direções.
    const toRafa = await call(game, rafa.id)
    const fromRafa = await call(other, gabriel, elite.barId, rafa.id)
    if (!toRafa.ok || !fromRafa.ok) throw new Error('chamado não criado')
    await as(gabriel).remove({ userId: rafa.id })
    expect((await as(rafa.id).notices()).calls).toEqual([])
    expect(
      (
        await refusal(
          as(rafa.id).respondCall({ callId: toRafa.callId, answer: 'going' })
        )
      ).code
    ).toBe('NOT_FOUND')
    const left = await db
      .select({ id: friendCall.id })
      .from(friendCall)
      .where(
        or(
          and(
            eq(friendCall.fromUserId, gabriel),
            eq(friendCall.toUserId, rafa.id)
          ),
          and(
            eq(friendCall.fromUserId, rafa.id),
            eq(friendCall.toUserId, gabriel)
          )
        )
      )
    expect(left).toEqual([])
    expect(await marked(rafa.id, game)).toEqual([])
  } finally {
    await db.delete(user).where(
      inArray(
        user.id,
        people.map((p) => p.id)
      )
    )
    await elite.cleanup()
    await closed.cleanup()
  }
})
