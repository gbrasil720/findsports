import { expect, spyOn, test } from 'bun:test'
import { setBackgroundTaskHandler } from '@findsports_oficial/auth/background'
import { and, eq } from '@findsports_oficial/db'
import { session, user } from '@findsports_oficial/db/schema/auth'
import { pushToken } from '@findsports_oficial/db/schema/push'
import { gameReminder } from '@findsports_oficial/db/schema/recommendation'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * Push do app (WEB-416, WEB-429): token preso à sessão, chamado de amigo e
 * "vai também", lembrete "3 h antes" uma vez só e token morto apagado. O
 * serviço da Expo é dublado: nada sai daqui.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

type Sent = {
  to: string
  title: string
  body: string
  data: Record<string, string>
  categoryId?: string
}

integrationTest('push de ponta a ponta', async () => {
  const elite = await seedBar('elite', 'active', null)
  const { db, appRouter } = await load()
  const { createFriendCall } = await import('../lib/friend-calls')
  const { EXPO_PUSH_URL, pushDueReminders, sendPush } = await import(
    '../lib/push'
  )
  const tag = crypto.randomUUID().slice(0, 8)
  const marina = {
    id: crypto.randomUUID(),
    name: `Marina ${tag}`,
    email: `marina-${tag}@integration.invalid`,
    emailVerified: true,
    role: 'fan' as const,
    onboardingCompleted: true
  }
  const gabriel = elite.fanId
  const tokenOf = (who: string) => `ExponentPushToken[${who}-${tag}]`
  const dead = tokenOf('morto')

  // A Expo como dublê: guarda as mensagens e diz que o token morto não existe.
  const sent: Sent[] = []
  const real = globalThis.fetch
  const spy = spyOn(globalThis, 'fetch').mockImplementation(((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    if (String(input) !== EXPO_PUSH_URL) return real(input, init)
    const batch = JSON.parse(String(init?.body)) as Sent[]
    sent.push(...batch)
    const data = batch.map((m) =>
      m.to === dead
        ? { status: 'error', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: crypto.randomUUID() }
    )
    return Promise.resolve(Response.json({ data }))
  }) as typeof fetch)
  const background: Promise<unknown>[] = []
  setBackgroundTaskHandler((promise) => background.push(promise))
  const settle = () => Promise.all(background.splice(0))

  // Sessões de verdade: o token fica preso a elas.
  const sessionOf = async (userId: string) => {
    const base = contextFor(userId, 'fan')
    await db.insert(session).values(base.session.session)
    return base
  }
  try {
    await db.insert(user).values(marina)
    await db.insert(friendship).values({
      requesterId: gabriel,
      addresseeId: marina.id,
      via: 'search',
      acceptedAt: new Date()
    })
    const marinaCtx = await sessionOf(marina.id)
    const gabrielCtx = await sessionOf(gabriel)
    const pushAs = (ctx: typeof marinaCtx) => appRouter.createCaller(ctx).push

    // Registrar: token da Expo só; registrar de novo não duplica.
    expect(
      (
        await refusal(
          pushAs(marinaCtx).register({ token: 'qualquer', platform: 'ios' })
        )
      ).code
    ).toBe('BAD_REQUEST')
    await pushAs(marinaCtx).register({
      token: tokenOf('marina'),
      platform: 'ios'
    })
    await pushAs(marinaCtx).register({
      token: tokenOf('marina'),
      platform: 'ios'
    })
    await pushAs(gabrielCtx).register({
      token: tokenOf('gabriel'),
      platform: 'android'
    })

    // Chamado: a Marina recebe a 24g, com os botões da categoria.
    const game = await elite.seedGame({
      startsAt: new Date(Date.now() + 2 * 3_600_000)
    })
    const call = await createFriendCall({
      fromUserId: gabriel,
      toUserId: marina.id,
      eventId: game,
      barId: elite.barId
    })
    if (!call.ok) throw new Error('chamado não criado')
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: tokenOf('marina'),
      title: 'Torcedor de integração te chamou pro jogo',
      categoryId: 'friend_call',
      data: { url: '/avisos', type: 'friend_call', callId: call.callId }
    })
    expect(sent[0]?.body).toMatch(
      / no Bar de integração, (hoje|amanhã), \d{2}:\d{2}$/
    )

    // "Vou também": quem chamou recebe "Marina vai também".
    await appRouter
      .createCaller(marinaCtx)
      .friends.respondCall({ callId: call.callId, answer: 'going' })
    await settle()
    expect(sent.slice(1)).toMatchObject([
      { to: tokenOf('gabriel'), title: `${marina.name} vai também` }
    ])

    // Lembrete "3 h antes" pedido antes da janela: sai uma vez. O pedido
    // já dentro dela não sai.
    const other = await elite.seedGame({
      startsAt: new Date(Date.now() + 2 * 3_600_000)
    })
    await db.insert(gameReminder).values([
      {
        userId: gabriel,
        eventId: game,
        remindBeforeMinutes: 180,
        createdAt: new Date(Date.now() - 86_400_000)
      },
      { userId: gabriel, eventId: other, remindBeforeMinutes: 180 }
    ])
    sent.length = 0
    expect(await pushDueReminders()).toEqual({ due: 1, sent: 1 })
    expect(sent).toMatchObject([
      {
        to: tokenOf('gabriel'),
        title: 'Seu jogo está chegando',
        data: { url: `/bar/${elite.barId}`, type: 'reminder' }
      }
    ])
    expect(await pushDueReminders()).toEqual({ due: 0, sent: 0 })

    // Token morto sai da tabela no envio.
    await pushAs(gabrielCtx).register({ token: dead, platform: 'android' })
    sent.length = 0
    expect(
      await sendPush([gabriel], {
        title: 't',
        body: 'b',
        data: { url: '/avisos' }
      })
    ).toBe(1)
    expect(sent).toHaveLength(2)
    const left = await db
      .select({ token: pushToken.token })
      .from(pushToken)
      .where(eq(pushToken.userId, gabriel))
    expect(left.map((r) => r.token)).toEqual([tokenOf('gabriel')])

    // Preview: só o log, nada vai à Expo.
    process.env.PUSH_DELIVERY = 'console'
    sent.length = 0
    try {
      await sendPush([gabriel], { title: 't', body: 'b', data: { url: '/' } })
    } finally {
      delete process.env.PUSH_DELIVERY
    }
    expect(sent).toEqual([])

    // `unregister` só apaga o da própria conta.
    await pushAs(gabrielCtx).unregister({ token: tokenOf('marina') })
    expect(
      await db
        .select()
        .from(pushToken)
        .where(
          and(
            eq(pushToken.userId, marina.id),
            eq(pushToken.token, tokenOf('marina'))
          )
        )
    ).toHaveLength(1)

    // Sair da conta apaga a sessão, e o token vai junto.
    await db.delete(session).where(eq(session.id, marinaCtx.session.session.id))
    expect(
      await db.select().from(pushToken).where(eq(pushToken.userId, marina.id))
    ).toEqual([])
  } finally {
    spy.mockRestore()
    setBackgroundTaskHandler(() => {})
    await db.delete(user).where(eq(user.id, marina.id))
    await elite.cleanup()
  }
})
