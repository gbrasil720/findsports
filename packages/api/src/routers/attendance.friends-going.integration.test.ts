import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { attendance } from '@findsports_oficial/db/schema/attendance'
import { user } from '@findsports_oficial/db/schema/auth'
import { friendship } from '@findsports_oficial/db/schema/social'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { ATTENDANCE_DISPLAY_FLOOR, readGoing } from '../lib/attendance'
import { seedBar } from './integration-seed'

/**
 * "34 pessoas vão, entre elas Marina e Rafael" (WEB-404): quem vai só é
 * nomeado para um amigo, e só se deixa amigos verem. "Ninguém" nunca aparece,
 * e quem não é amigo nunca é nomeado, nem com "todos".
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'amigos que vão respeitam a privacidade de cada um',
  async () => {
    const ctx = await seedBar('elite', 'active', null)
    const tag = crypto.randomUUID().slice(0, 8)
    const make = (
      name: string,
      activityVisibility: 'everyone' | 'friends' | 'nobody'
    ) => ({
      id: crypto.randomUUID(),
      name: `${name} ${tag}`,
      email: `${name.toLowerCase()}-${tag}@integration.invalid`,
      emailVerified: true,
      role: 'fan' as const,
      onboardingCompleted: true,
      activityVisibility
    })
    const todos = make('Marina', 'everyone')
    const amigos = make('Rafael', 'friends')
    const ninguem = make('Nina', 'nobody')
    const estranho = make('Estranho', 'everyone')
    const pendente = make('Pedro', 'everyone')
    const people = [todos, amigos, ninguem, estranho, pendente]
    const { db } = ctx
    const extras: string[] = []
    try {
      await db.insert(user).values(people)
      const me = ctx.fanId
      await db.insert(friendship).values([
        {
          requesterId: me,
          addresseeId: todos.id,
          via: 'search',
          acceptedAt: new Date()
        },
        {
          requesterId: amigos.id,
          addresseeId: me,
          via: 'code',
          acceptedAt: new Date()
        },
        {
          requesterId: ninguem.id,
          addresseeId: me,
          via: 'link',
          acceptedAt: new Date()
        },
        // Pedido não aceito não é amizade.
        { requesterId: pendente.id, addresseeId: me, via: 'search' }
      ])
      const game = await ctx.seedGame()
      // Marina marca por último: vem primeiro.
      for (const person of [amigos, ninguem, estranho, pendente, todos])
        await db.insert(attendance).values({ userId: person.id, eventId: game })

      // Abaixo do piso: sem contagem, mas os amigos aparecem.
      const below = (await readGoing([game], me)).get(game)
      expect(below?.count).toBeNull()
      expect(below?.initials).toEqual([])
      expect(below?.friends.map((f) => f.id)).toEqual([todos.id, amigos.id])

      // Sem quem vê, ou para quem não tem amigo indo: nada abaixo do piso.
      expect((await readGoing([game])).get(game)).toBeUndefined()
      expect((await readGoing([game], estranho.id)).get(game)).toBeUndefined()

      // Pela API: a folha 3d recebe os mesmos nomes.
      const sheet = (await ctx.fan.pubs.getById({ id: ctx.barId })).events.find(
        (e) => e.id === game
      )
      expect(sheet?.going?.friends.map((f) => f.name)).toEqual([
        todos.name,
        amigos.name
      ])
      // Nenhum nome de quem não pode aparecer sai pela rede.
      const wire = JSON.stringify(sheet)
      for (const hidden of [ninguem, estranho, pendente])
        expect(wire).not.toContain(hidden.name)

      // Acima do piso: contagem e iniciais de todo mundo, nomes só dos amigos.
      const crowd = Array.from({ length: ATTENDANCE_DISPLAY_FLOOR }, () =>
        crypto.randomUUID()
      )
      extras.push(...crowd)
      await db.insert(user).values(
        crowd.map((id) => ({
          id,
          name: `Gente ${tag}`,
          email: `${id}@integration.invalid`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true
        }))
      )
      await db
        .insert(attendance)
        .values(crowd.map((userId) => ({ userId, eventId: game })))
      const above = (await readGoing([game], me)).get(game)
      expect(above?.count).toBe(people.length + crowd.length)
      expect(above?.initials).toHaveLength(3)
      expect(above?.friends.map((f) => f.id)).toEqual([todos.id, amigos.id])

      // Quem troca para "ninguém" some na hora.
      await db
        .update(user)
        .set({ activityVisibility: 'nobody' })
        .where(inArray(user.id, [todos.id]))
      expect(
        (await readGoing([game], me)).get(game)?.friends.map((f) => f.id)
      ).toEqual([amigos.id])
    } finally {
      await db
        .delete(user)
        .where(inArray(user.id, [...people.map((p) => p.id), ...extras]))
      await ctx.cleanup()
    }
  }
)
