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
 * O modo "melhor avaliados" tem três decisões que quebram em silêncio:
 *
 *   1. **Wilson, não média.** Um bar com uma avaliação positiva marca 100% e
 *      não pode passar na frente de um com muitas e alta aprovação. É o caso
 *      COMUM enquanto a base é pequena, e uma média crua o inverteria sem
 *      nenhum sintoma;
 *   2. **Bar sem nota pública não some.** Vai para o fim da lista, na ordem
 *      de sempre. Excluí-lo esconderia quase o catálogo inteiro hoje;
 *   3. **O plano sai da frente — só aqui.** Na ordem padrão o elite continua
 *      na frente. Se o modo por nota vazasse para o padrão, o bar pagante
 *      perderia o destaque que comprou.
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

const ORIGIN_LAT = -37.25
const ORIGIN_LNG = -35.75

integrationTest(
  'ordem por nota usa Wilson, mantém bar sem nota no fim e não vaza para o padrão',
  async () => {
    const [{ db, sql }, { appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('./index'),
        import('../lib/app-config')
      ])

    const now = new Date()
    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()

    // `umaSo` tem 100% de aprovação com uma avaliação. `muitas` tem 90% com
    // dez. A média crua colocaria `umaSo` na frente; o Wilson não.
    // `semNota` fica abaixo do piso. `elite` existe só para provar que o
    // plano continua mandando na ordem padrão e não manda nesta.
    const fixtures = [
      { rotulo: 'umaSo', positivas: 1, total: 1, plan: 'starter' as const },
      { rotulo: 'muitas', positivas: 9, total: 10, plan: 'starter' as const },
      { rotulo: 'semNota', positivas: 1, total: 1, plan: 'starter' as const },
      { rotulo: 'elite', positivas: 0, total: 0, plan: 'elite' as const }
    ].map((fixture, index) => ({
      ...fixture,
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID(),
      offset: 0.001 * (index + 1)
    }))

    const porRotulo = new Map(fixtures.map((f) => [f.rotulo, f.barId]))
    const ownerIds = fixtures.map((fixture) => fixture.ownerId)

    // Um usuário por avaliação: a chave única é (bar, torcedor, jogo).
    const raterIds = Array.from({ length: 10 }, () => crypto.randomUUID())

    await db.insert(user).values([
      {
        id: fanId,
        name: 'Torcedor',
        email: `${fanId}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      },
      ...raterIds.map((id) => ({
        id,
        name: `Avaliador ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      })),
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
        slug: `rating-sort-${sportId}`
      })

      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: `Bar ${fixture.rotulo}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (ORIGIN_LAT + fixture.offset).toFixed(8),
          longitude: ORIGIN_LNG.toFixed(8),
          isActive: true
        })
        await db.insert(subscription).values({
          barId: fixture.barId,
          plan: fixture.plan,
          status: 'active'
        })

        // Jogo futuro: sem ele o bar nem aparece na busca.
        await db.insert(event).values({
          barId: fixture.barId,
          sportId,
          championship: `Jogo ${fixture.rotulo}`,
          startsAt: new Date(now.getTime() + 60 * 60_000)
        })

        // Jogo passado, que é o que as avaliações referenciam.
        const [jogoPassado] = await db
          .insert(event)
          .values({
            barId: fixture.barId,
            sportId,
            championship: `Passado ${fixture.rotulo}`,
            startsAt: new Date(now.getTime() - 6 * 60 * 60_000)
          })
          .returning({ id: event.id })

        // Escrita direta na tabela: aqui o alvo é a ORDENAÇÃO, e passar pelo
        // portão de elegibilidade só acrescentaria montagem sem cobrir nada
        // que `ratings.integration.test.ts` já não cubra. A trigger dos
        // contadores continua sendo exercitada, que é o que importa para o
        // Wilson da coluna gerada.
        for (let i = 0; i < fixture.total; i++) {
          await db.execute(sql`
            INSERT INTO bar_rating
              (id, bar_id, actor_user_id, event_id, would_return)
            VALUES (
              ${crypto.randomUUID()}, ${fixture.barId}, ${raterIds[i]},
              ${jogoPassado?.id}, ${i < fixture.positivas}
            )
          `)
        }
      }

      // `semNota` tem 1 avaliação e o piso é 3 — abaixo dele.
      const contagens = await db.query.bar.findMany({
        where: inArray(
          bar.id,
          fixtures.map((f) => f.barId)
        ),
        columns: { id: true, ratingCount: true, ratingScore: true }
      })
      const porId = new Map(contagens.map((linha) => [linha.id, linha]))
      expect(porId.get(porRotulo.get('muitas') as string)?.ratingCount).toBe(10)

      // A premissa do teste, verificada e não assumida: o Wilson INVERTE a
      // média crua nestes dois bares.
      const scoreUmaSo = Number(
        porId.get(porRotulo.get('umaSo') as string)?.ratingScore
      )
      const scoreMuitas = Number(
        porId.get(porRotulo.get('muitas') as string)?.ratingScore
      )
      expect(scoreMuitas).toBeGreaterThan(scoreUmaSo)

      await setAppConfig('rating.public_display', true, null)

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
            name: 'Torcedor',
            email: `${fanId}@integration.invalid`,
            emailVerified: true,
            image: null,
            role: 'fan',
            banned: false,
            onboardingCompleted: true,
            searchRadiusKm: 3,
            twoFactorEnabled: false,
            createdAt: now,
            updatedAt: now
          }
        }
      })

      const buscar = async (
        sort: 'relevance' | 'rating',
        passo: number,
        limit = 20
      ) =>
        caller.pubs.search({
          lat: ORIGIN_LAT,
          lng: ORIGIN_LNG + passo * 0.002,
          radiusKm: 3,
          sort,
          limit
        })

      const porNota = await buscar('rating', 1)
      const idsPorNota = porNota.bars.map((achado) => achado.id)

      // `muitas` na frente de `umaSo`: Wilson, não média.
      expect(
        idsPorNota.indexOf(porRotulo.get('muitas') as string)
      ).toBeLessThan(idsPorNota.indexOf(porRotulo.get('umaSo') as string))

      // Bar abaixo do piso não some — fica depois dos avaliados.
      expect(idsPorNota).toContain(porRotulo.get('semNota') as string)
      expect(
        idsPorNota.indexOf(porRotulo.get('semNota') as string)
      ).toBeGreaterThan(idsPorNota.indexOf(porRotulo.get('muitas') as string))

      // O elite não tem nota, então neste modo ele vai para o fim junto dos
      // sem nota — o plano não compra posição aqui.
      expect(
        idsPorNota.indexOf(porRotulo.get('elite') as string)
      ).toBeGreaterThan(idsPorNota.indexOf(porRotulo.get('muitas') as string))

      // ...mas continua mandando na ordem padrão.
      const padrao = await buscar('relevance', 2)
      expect(padrao.bars[0]?.id).toBe(porRotulo.get('elite') as string)

      // A nota só chega ao cliente acima do piso.
      const notaDeMuitas = porNota.bars.find(
        (achado) => achado.id === porRotulo.get('muitas')
      )?.rating
      expect(notaDeMuitas).toEqual({ positive: 9, total: 10, percentage: 90 })
      expect(
        porNota.bars.find((achado) => achado.id === porRotulo.get('semNota'))
          ?.rating
      ).toBeNull()

      // Paginação de um em um percorre a mesma ordem, sem repetir nem pular.
      const visitados: string[] = []
      let cursor: string | undefined
      for (let passo = 0; passo < fixtures.length + 2; passo++) {
        const page: Awaited<ReturnType<typeof caller.pubs.search>> =
          await caller.pubs.search({
            lat: ORIGIN_LAT,
            lng: ORIGIN_LNG + 0.02,
            radiusKm: 3,
            sort: 'rating',
            limit: 1,
            cursor
          })
        visitados.push(...page.bars.map((achado) => achado.id))
        if (!page.nextCursor) break
        cursor = page.nextCursor
      }
      expect(visitados).toEqual(idsPorNota)
      expect(new Set(visitados).size).toBe(fixtures.length)

      // Com a exibição desligada, pedir `rating` cai na ordem padrão em vez
      // de dar erro — e a nota some da resposta.
      await setAppConfig('rating.public_display', false, null)
      const desligado = await buscar('rating', 3)
      expect(desligado.bars[0]?.id).toBe(porRotulo.get('elite') as string)
      expect(desligado.bars.every((achado) => achado.rating === null)).toBe(
        true
      )
    } finally {
      await resetAppConfig('rating.public_display')
      await db
        .delete(user)
        .where(inArray(user.id, [fanId, ...raterIds, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
