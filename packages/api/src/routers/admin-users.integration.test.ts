import { afterEach, expect, spyOn, test } from 'bun:test'
import { eq, inArray } from '@findsports_oficial/db'
import { session, user } from '@findsports_oficial/db/schema/auth'
import { bar } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, inAMonth, load, seedBar } from './integration-seed'

/**
 * WEB-392: ficha da pessoa e os e-mails que o admin manda por ela. O envio é
 * conferido no `sendVerificationEmail`/`sendResetPassword` da config do
 * better-auth, que é por onde todo e-mail dele sai (outbox, console ou Resend
 * depois disso é escolha do ambiente).
 */

const integrationTest = isDisposableTestDatabase() ? test : test.skip

const created: string[] = []
afterEach(async () => {
  if (!created.length) return
  const { db } = await load()
  await db.delete(user).where(inArray(user.id, created.splice(0)))
})

async function seedPerson(emailVerified: boolean) {
  const { db } = await load()
  const id = crypto.randomUUID()
  created.push(id)
  await db.insert(user).values({
    id,
    name: 'Pessoa da ficha',
    email: `${id}@integration.invalid`,
    emailVerified,
    role: 'fan'
  })
  return { id, email: `${id}@integration.invalid` }
}

async function setup() {
  const { appRouter } = await load()
  const { auth } = await import('@findsports_oficial/auth')
  const adminId = crypto.randomUUID()
  return {
    admin: appRouter.createCaller(contextFor(adminId, 'admin')),
    adminId,
    pub: appRouter.createCaller(contextFor(crypto.randomUUID(), 'pub')),
    auth
  }
}

async function grimorioOf(
  caller: Awaited<ReturnType<typeof setup>>['admin'],
  id: string
) {
  const { entries } = await caller.grimorio.list({
    targetType: 'user',
    targetId: id
  })
  return entries
}

integrationTest(
  'reenvia a verificação para quem não verificou e escreve no Grimório',
  async () => {
    const { admin, adminId, auth } = await setup()
    const person = await seedPerson(false)
    const send = spyOn(
      auth.options.emailVerification,
      'sendVerificationEmail'
    ).mockResolvedValue()
    try {
      expect(
        await admin.adminUsers.resendVerification({ userId: person.id })
      ).toEqual({ email: person.email })
      expect(send).toHaveBeenCalledTimes(1)
      const [{ user: to, url }] = send.mock.calls[0] as unknown as [
        { user: { email: string }; url: string }
      ]
      expect(to.email).toBe(person.email)
      expect(url).toContain(
        `callbackURL=${encodeURIComponent('/verify-email?confirmed=1')}`
      )
      expect(await grimorioOf(admin, person.id)).toMatchObject([
        {
          kind: 'user.resend_verification',
          actorId: adminId,
          targetLabel: person.email
        }
      ])
    } finally {
      send.mockRestore()
    }
  }
)

integrationTest(
  'recusa reenviar para quem já verificou, sem e-mail nem registro',
  async () => {
    const { admin, auth } = await setup()
    const person = await seedPerson(true)
    const send = spyOn(
      auth.options.emailVerification,
      'sendVerificationEmail'
    ).mockResolvedValue()
    try {
      await expect(
        admin.adminUsers.resendVerification({ userId: person.id })
      ).rejects.toThrow('já está verificado')
      expect(send).not.toHaveBeenCalled()
      expect(await grimorioOf(admin, person.id)).toEqual([])
    } finally {
      send.mockRestore()
    }
  }
)

integrationTest(
  'e-mail que falha não fica no Grimório como enviado',
  async () => {
    const { admin, auth } = await setup()
    const person = await seedPerson(false)
    const send = spyOn(
      auth.options.emailVerification,
      'sendVerificationEmail'
    ).mockRejectedValue(new Error('Resend fora do ar'))
    try {
      await expect(
        admin.adminUsers.resendVerification({ userId: person.id })
      ).rejects.toThrow()
      expect(await grimorioOf(admin, person.id)).toEqual([])
    } finally {
      send.mockRestore()
    }
  }
)

integrationTest(
  'manda o link de troca de senha e escreve no Grimório',
  async () => {
    const { admin, adminId, auth } = await setup()
    const person = await seedPerson(true)
    const send = spyOn(
      auth.options.emailAndPassword,
      'sendResetPassword'
    ).mockResolvedValue()
    try {
      expect(
        await admin.adminUsers.sendPasswordReset({ userId: person.id })
      ).toEqual({ email: person.email })
      expect(send).toHaveBeenCalledTimes(1)
      const [{ user: to, url }] = send.mock.calls[0] as unknown as [
        { user: { email: string }; url: string }
      ]
      expect(to.email).toBe(person.email)
      expect(url).toContain('/reset-password/')
      expect(url).toContain(
        `callbackURL=${encodeURIComponent('/reset-password')}`
      )
      expect(await grimorioOf(admin, person.id)).toMatchObject([
        { kind: 'user.send_password_reset', actorId: adminId }
      ])
    } finally {
      send.mockRestore()
    }
  }
)

integrationTest(
  'ficha traz conta, bar com plano vigente e só as sessões da pessoa',
  async () => {
    const { admin } = await setup()
    const seeded = await seedBar('pro', 'active', inAMonth())
    try {
      const { db } = seeded
      const [owner] = await db
        .select({ id: bar.userId })
        .from(bar)
        .where(eq(bar.id, seeded.barId))
      const ownerId = owner?.id ?? ''
      const lastUse = new Date(Date.now() - 3_600_000)
      await db.insert(session).values([
        {
          id: crypto.randomUUID(),
          token: crypto.randomUUID(),
          userId: ownerId,
          expiresAt: inAMonth(),
          updatedAt: lastUse
        },
        // Vencida e aberta na pele: nenhuma das duas conta.
        {
          id: crypto.randomUUID(),
          token: crypto.randomUUID(),
          userId: ownerId,
          expiresAt: new Date(Date.now() - 1000),
          updatedAt: new Date()
        },
        {
          id: crypto.randomUUID(),
          token: crypto.randomUUID(),
          userId: ownerId,
          expiresAt: inAMonth(),
          updatedAt: new Date(),
          impersonatedBy: crypto.randomUUID()
        }
      ])

      const ficha = await admin.adminUsers.ficha({ userId: ownerId })
      expect(ficha.account).toMatchObject({
        id: ownerId,
        role: 'pub',
        emailVerified: true,
        twoFactorEnabled: false,
        onboardingCompleted: true
      })
      expect(ficha.bar).toMatchObject({
        id: seeded.barId,
        currentPlan: 'pro',
        isActive: true
      })
      expect(ficha.sessions.active).toBe(1)
      expect(ficha.sessions.lastUsedAt?.getTime()).toBe(lastUse.getTime())
    } finally {
      await seeded.cleanup()
    }
  }
)

integrationTest('ficha de quem não existe é NOT_FOUND', async () => {
  const { admin } = await setup()
  await expect(
    admin.adminUsers.ficha({ userId: crypto.randomUUID() })
  ).rejects.toThrow('não existe')
})

integrationTest('ficha e e-mails são só de admin', async () => {
  const { pub } = await setup()
  const person = await seedPerson(false)
  await expect(pub.adminUsers.ficha({ userId: person.id })).rejects.toThrow(
    'administradores'
  )
  await expect(
    pub.adminUsers.resendVerification({ userId: person.id })
  ).rejects.toThrow('administradores')
  await expect(
    pub.adminUsers.sendPasswordReset({ userId: person.id })
  ).rejects.toThrow('administradores')
})
