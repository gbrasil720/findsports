import { expect, test } from 'bun:test'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { inArray } from 'drizzle-orm'

/**
 * `pubs.search` passou a avaliar os planos em camadas (migration 0018): cada
 * plano é uma subquery com o seu próprio LIMIT, e o `Append` só desce para a
 * camada seguinte se a anterior não encheu a página.
 *
 * Isso é uma decomposição de um `ORDER BY` único em três varreduras. Duas
 * coisas podem quebrar em silêncio, sem erro e sem teste de tipo pegar:
 *
 *   1. a ordem global entre camadas (um bar `starter` colado no usuário não
 *      pode passar na frente de um `elite` distante);
 *   2. o cursor na fronteira entre camadas — página que repete ou pula bar.
 *
 * Este teste trava as duas, e também trava a trigger que mantém `bar.plan`
 * colado em `subscription.plan`.
 */
function isClearlyDisposableDatabase(url: string | undefined): boolean {
  if (!url || process.env.RUN_DISPOSABLE_DB_TESTS !== '1') return false
  try {
    const parsed = new URL(url)
    const database = parsed.pathname.replace(/^\//, '')
    return (
      ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) &&
      /(test|testing|tmp|temp|disposable|ci)/i.test(database)
    )
  } catch {
    return false
  }
}

const integrationTest = isClearlyDisposableDatabase(process.env.DATABASE_URL)
  ? test
  : test.skip

/**
 * Origem no meio do Atlântico: nenhum bar de outro teste ou de seed cai neste
 * raio, então a busca devolve exatamente o que este teste inseriu.
 */
const ORIGIN_LAT = -31.5
const ORIGIN_LNG = -41.5

integrationTest(
  'ordena por plano acima de distância e pagina sem pular entre camadas',
  async () => {
    const [{ db }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])

    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()

    // O bar mais perto é o de pior plano e o de jogo mais cedo. Se a ordem
    // por plano estiver certa, ele sai por último mesmo assim.
    const fixtures = [
      { plan: 'starter' as const, offset: 0.001, minutes: 10 },
      { plan: 'starter' as const, offset: 0.002, minutes: 20 },
      { plan: 'pro' as const, offset: 0.004, minutes: 30 },
      { plan: 'pro' as const, offset: 0.005, minutes: 40 },
      { plan: 'elite' as const, offset: 0.007, minutes: 50 },
      { plan: 'elite' as const, offset: 0.008, minutes: 60 }
    ].map((fixture) => ({
      ...fixture,
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID()
    }))

    // Ordem correta, derivada da regra e não da query: plano primeiro,
    // horário do próximo jogo depois. A distância nunca entra, porque aqui
    // ela é justamente o contrário do plano.
    const planRank = { elite: 1, pro: 2, starter: 3 } as const
    const expectedOrder = [...fixtures]
      .sort(
        (esquerda, direita) =>
          planRank[esquerda.plan] - planRank[direita.plan] ||
          esquerda.minutes - direita.minutes
      )
      .map((fixture) => fixture.barId)

    const ownerIds = fixtures.map((fixture) => fixture.ownerId)
    const barIds = fixtures.map((fixture) => fixture.barId)

    await db.insert(user).values([
      {
        id: fanId,
        name: 'Torcedor de integração',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan',
        onboardingCompleted: true
      },
      ...fixtures.map((fixture) => ({
        id: fixture.ownerId,
        name: `Dono ${fixture.ownerId}`,
        email: `${fixture.ownerId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      }))
    ])

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `search-integration-${sportId}`
      })

      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: `Bar ${fixture.plan} ${fixture.barId}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN_LAT + fixture.offset).toFixed(8),
          longitude: ORIGIN_LNG.toFixed(8),
          isActive: true
        })
        // `bar.plan` não é escrito aqui de propósito: quem tem de preenchê-lo
        // é a trigger, a partir da assinatura.
        await db.insert(subscription).values({
          barId: fixture.barId,
          plan: fixture.plan,
          status: 'active',
          currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000)
        })
        await db.insert(event).values({
          barId: fixture.barId,
          sportId,
          championship: `Jogo ${fixture.barId}`,
          startsAt: new Date(now.getTime() + fixture.minutes * 60_000)
        })
      }

      // A trigger da migration 0018 tem de ter espelhado o plano no bar.
      const projetados = await db.query.bar.findMany({
        where: inArray(bar.id, barIds),
        columns: { id: true, plan: true }
      })
      const planoPorBar = new Map(
        projetados.map((linha) => [linha.id, linha.plan])
      )
      for (const fixture of fixtures) {
        expect(planoPorBar.get(fixture.barId)).toBe(fixture.plan)
      }

      const caller = appRouter.createCaller({
        auth: null,
        clientIp: '127.0.0.1',
        session: {
          session: {
            id: crypto.randomUUID(),
            token: crypto.randomUUID(),
            userId: fanId,
            createdAt: now,
            updatedAt: now,
            expiresAt: new Date(now.getTime() + 3_600_000),
            ipAddress: null,
            userAgent: null
          },
          user: {
            id: fanId,
            name: 'Torcedor de integração',
            email: `${fanId}@integration.invalid`,
            emailVerified: true,
            image: null,
            role: 'fan',
            banned: false,
            onboardingCompleted: true,
            searchRadiusKm: 3,
            createdAt: now,
            updatedAt: now
          }
        }
      })

      // Página cheia: plano manda, distância só desempata dentro do plano.
      const pagina = await caller.pubs.search({
        lat: ORIGIN_LAT,
        lng: ORIGIN_LNG,
        radiusKm: 3,
        limit: 20
      })
      expect(pagina.bars.map((encontrado) => encontrado.id)).toEqual(
        expectedOrder
      )

      // Paginando de um em um, o cursor atravessa as três camadas sem repetir
      // e sem pular. Coordenada deslocada para não colidir com o cache de 60 s
      // da chamada acima, que arredonda a chave para ~110 m.
      const lngPaginado = ORIGIN_LNG + 0.02
      await db
        .update(bar)
        .set({ longitude: lngPaginado.toFixed(8) })
        .where(inArray(bar.id, barIds))

      const visitados: string[] = []
      let cursor: string | undefined
      for (let passo = 0; passo < fixtures.length + 2; passo++) {
        const page: Awaited<ReturnType<typeof caller.pubs.search>> =
          await caller.pubs.search({
            lat: ORIGIN_LAT,
            lng: lngPaginado,
            radiusKm: 3,
            limit: 1,
            cursor
          })
        visitados.push(...page.bars.map((encontrado) => encontrado.id))
        if (!page.nextCursor) break
        cursor = page.nextCursor
      }

      expect(visitados).toEqual(expectedOrder)
      expect(new Set(visitados).size).toBe(fixtures.length)
    } finally {
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
