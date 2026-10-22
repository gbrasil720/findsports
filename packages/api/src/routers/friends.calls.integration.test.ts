import { expect, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendship } from '@findsports_oficial/db/schema/social'
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
