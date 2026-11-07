import { afterEach, expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { appWaitlist } from '@findsports_oficial/db/schema/app-waitlist'
import { user } from '@findsports_oficial/db/schema/auth'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { fanData } from './account'
import { contextFor, load } from './integration-seed'

/**
 * "Me avise quando o app chegar": entrar e sair são idempotentes, o e-mail é
 * o da sessão em minúsculas, a saída fica marcada, o arquivo de "Baixar meus
 * dados" a traz e excluir a conta leva a linha junto.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function seedFan() {
  const { db, appRouter } = await load()
  const id = crypto.randomUUID()
  await db.insert(user).values({
    id,
    name: 'Torcedora',
    email: `${id}@integration.invalid`,
    emailVerified: true,
    role: 'fan',
    onboardingCompleted: true
  })
  cleanups.push(() => db.delete(user).where(eq(user.id, id)))
  const ctx = contextFor(id, 'fan')
  // E-mail da sessão com maiúsculas: a lista guarda em minúsculas.
  ctx.session.user.email = `Torcedora.${id}@Integration.invalid`
  return {
    db,
    id,
    email: ctx.session.user.email.toLowerCase(),
    caller: appRouter.createCaller(ctx)
  }
}

integrationTest(
  'entrar duas vezes dá uma linha só, com o e-mail da sessão',
  async () => {
    const { db, id, email, caller } = await seedFan()
    expect(await caller.appWaitlist.status()).toEqual({ email, joined: false })

    expect(await caller.appWaitlist.join()).toEqual({ email, joined: true })
    await caller.appWaitlist.join()

    const rows = await db
      .select()
      .from(appWaitlist)
      .where(eq(appWaitlist.userId, id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      email,
      source: 'web',
      unsubscribedAt: null
    })
    expect(await caller.appWaitlist.status()).toEqual({ email, joined: true })
  }
)

integrationTest('"Não quero mais" marca a saída, e voltar limpa', async () => {
  const { db, email, caller } = await seedFan()
  await caller.appWaitlist.join()

  expect(await caller.appWaitlist.leave()).toEqual({ email, joined: false })
  await caller.appWaitlist.leave()
  const [saiu] = await db
    .select()
    .from(appWaitlist)
    .where(eq(appWaitlist.email, email))
  expect(saiu?.unsubscribedAt).toBeInstanceOf(Date)
  expect(await caller.appWaitlist.status()).toEqual({ email, joined: false })

  await caller.appWaitlist.join()
  const [voltou] = await db
    .select()
    .from(appWaitlist)
    .where(eq(appWaitlist.email, email))
  expect(voltou?.unsubscribedAt).toBeNull()
  expect(voltou?.id).toBe(saiu?.id)
})

integrationTest(
  'linha da landing com o mesmo e-mail passa a ser da conta',
  async () => {
    const { db, id, email, caller } = await seedFan()
    await db.insert(appWaitlist).values({ email, source: 'landing' })
    cleanups.push(() =>
      db.delete(appWaitlist).where(eq(appWaitlist.email, email))
    )

    await caller.appWaitlist.join()
    const rows = await db
      .select()
      .from(appWaitlist)
      .where(eq(appWaitlist.email, email))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ userId: id, source: 'landing' })
  }
)

integrationTest('o banco recusa e-mail com maiúscula', async () => {
  const { db } = await load()
  await expect(
    db
      .insert(appWaitlist)
      .values({ email: 'Alguem@integration.invalid', source: 'web' })
      .execute()
  ).rejects.toThrow()
})

integrationTest('sai no "Baixar meus dados" e some com a conta', async () => {
  const { db, id, email, caller } = await seedFan()
  await caller.appWaitlist.join()

  const data = await fanData(id)
  expect(data.appWaitlist).toEqual([
    expect.objectContaining({
      email,
      source: 'web',
      notifiedAt: null,
      unsubscribedAt: null
    })
  ])

  await db.delete(user).where(eq(user.id, id))
  expect(
    await db.select().from(appWaitlist).where(eq(appWaitlist.email, email))
  ).toEqual([])
})
