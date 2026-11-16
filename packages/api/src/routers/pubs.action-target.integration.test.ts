import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { bar, event, sport } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { load } from './integration-seed'

/**
 * O cartão de confirmação da `?acao=` do web (`pubs.actionTarget`): aberto,
 * só título, bar e horário de jogo marcável; o resto é `null`, e a tela não
 * pergunta. Achado `web-acao-url-auto-executes-mutation`.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const HOUR = 3_600_000

integrationTest('diz o jogo e o bar só do que dá para marcar', async () => {
  const { db, appRouter } = await load()
  const mark = crypto.randomUUID().slice(0, 8)
  const sportId = crypto.randomUUID()
  const novo = (key: string) => ({
    key,
    userId: crypto.randomUUID(),
    barId: crypto.randomUUID()
  })
  const aberto = novo('aberto')
  const fora = novo('fora')
  const owners = [aberto, fora]
  await db.insert(user).values(
    owners.map((owner) => ({
      id: owner.userId,
      name: `Dono ${owner.key}`,
      email: `${owner.userId}@integration.invalid`,
      emailVerified: true,
      role: 'pub' as const,
      onboardingCompleted: true
    }))
  )
  try {
    await db.insert(sport).values({
      id: sportId,
      name: `Esporte ${mark}`,
      slug: `action-target-${sportId}`
    })
    await db.insert(bar).values(
      owners.map((owner, index) => ({
        id: owner.barId,
        userId: owner.userId,
        name: `Bar ${owner.key} ${mark}`,
        address: 'Rua descartável, 1',
        neighborhood: 'Pinheiros',
        city: 'Teste',
        latitude: (-27.5 + index * 0.001).toFixed(8),
        longitude: (-47.25).toFixed(8),
        isActive: owner.key === 'aberto'
      }))
    )
    const futuro = new Date(Date.now() + 26 * HOUR)
    const jogo = (
      barId: string,
      extra: Partial<typeof event.$inferInsert> = {}
    ) => ({
      id: crypto.randomUUID(),
      barId,
      sportId,
      championship: `Campeonato ${mark}`,
      participantFreeText: `Treino ${mark}`,
      startsAt: futuro,
      ...extra
    })
    const marcavel = jogo(aberto.barId)
    const comecou = jogo(aberto.barId, {
      startsAt: new Date(Date.now() - HOUR)
    })
    const rascunho = jogo(aberto.barId, { publishedAt: null })
    const listaFechada = jogo(aberto.barId, { attendanceEnabled: false })
    const barFora = jogo(fora.barId)
    await db
      .insert(event)
      .values([marcavel, comecou, rascunho, listaFechada, barFora])

    const caller = appRouter.createCaller({
      auth: null,
      session: null,
      clientIp: '127.0.0.1'
    })
    const alvo = (tipo: 'vou' | 'fav' | 'lembrar', id: string) =>
      caller.pubs.actionTarget({ tipo, id })

    expect(await alvo('vou', marcavel.id)).toEqual({
      title: `Treino ${mark}`,
      barName: `Bar aberto ${mark}`,
      neighborhood: 'Pinheiros',
      startsAt: futuro.toISOString()
    })
    expect(await alvo('vou', comecou.id)).toBeNull()
    expect(await alvo('vou', rascunho.id)).toBeNull()
    expect(await alvo('vou', listaFechada.id)).toBeNull()
    expect(await alvo('vou', barFora.id)).toBeNull()
    expect(await alvo('vou', crypto.randomUUID())).toBeNull()
    // Lembrete não depende da lista de quem vai.
    expect((await alvo('lembrar', listaFechada.id))?.barName).toBe(
      `Bar aberto ${mark}`
    )
    expect(await alvo('fav', aberto.barId)).toEqual({
      title: null,
      barName: `Bar aberto ${mark}`,
      neighborhood: 'Pinheiros',
      startsAt: null
    })
    expect(await alvo('fav', fora.barId)).toBeNull()
  } finally {
    await db.delete(user).where(
      inArray(
        user.id,
        owners.map((owner) => owner.userId)
      )
    )
    await db.delete(sport).where(inArray(sport.id, [sportId]))
  }
})
