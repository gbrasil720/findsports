import { expect, test } from 'bun:test'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { eq, inArray, sql } from 'drizzle-orm'

/**
 * ESC-19: a busca tem dois caminhos e um interruptor entre eles.
 *
 * Um interruptor só vale alguma coisa se o outro lado funcionar — e o outro
 * lado é justamente o que ninguém exercita no dia a dia. Caminho de
 * emergência não testado é caminho quebrado esperando o dia do incidente para
 * avisar.
 *
 * Este teste trava duas coisas:
 *
 *   1. com a projeção `bar.plan` saudável, os dois caminhos devolvem
 *      exatamente o mesmo resultado — mesma ordem, mesmos ids, mesma
 *      paginação. É o que permite trocar de caminho com gente no meio da
 *      navegação;
 *
 *   2. com a projeção CORROMPIDA, os dois discordam — e o linear é quem
 *      acerta. Essa discordância é a razão de o interruptor existir, e
 *      afirmá-la aqui é o que impede alguém de "simplificar" o caminho
 *      linear no futuro sem perceber o que está jogando fora.
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

/** Origem isolada, diferente da usada pelo teste de camadas. */
const ORIGIN_LAT = -32.5
const ORIGIN_LNG = -42.5

integrationTest(
  'os dois caminhos da busca concordam, e só o linear resiste a projeção corrompida',
  async () => {
    const [{ db }, { appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([
        import('@findsports_oficial/db'),
        import('./index'),
        import('../lib/app-config')
      ])

    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()

    // O bar mais perto é o de pior plano: se a ordem por plano estiver certa,
    // ele sai por último apesar da distância.
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

    const planRank = { elite: 1, pro: 2, starter: 3 } as const
    const ordemEsperada = [...fixtures]
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
        slug: `fallback-integration-${sportId}`
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

      const buscar = (lng: number, cursor?: string, limit = 20) =>
        caller.pubs.search({
          lat: ORIGIN_LAT,
          lng,
          radiusKm: 3,
          limit,
          cursor
        })

      async function paginar(lng: number) {
        const visitados: string[] = []
        let cursor: string | undefined
        for (let passo = 0; passo < fixtures.length + 2; passo++) {
          const pagina: Awaited<ReturnType<typeof buscar>> = await buscar(
            lng,
            cursor,
            1
          )
          visitados.push(...pagina.bars.map((achado) => achado.id))
          if (!pagina.nextCursor) break
          cursor = pagina.nextCursor
        }
        return visitados
      }

      // --- projeção saudável: os dois caminhos precisam concordar ----------
      //
      // A chave do cache da busca inclui o modo, então a segunda chamada não
      // reaproveita a página da primeira. Se um dia alguém tirar o modo da
      // chave, este teste passa a comparar uma resposta com ela mesma — daí
      // a asserção explícita de que as páginas são objetos distintos.
      await setAppConfig('search.tiered_plan_query', true, null)
      const emCamadas = await buscar(ORIGIN_LNG)

      await setAppConfig('search.tiered_plan_query', false, null)
      const linear = await buscar(ORIGIN_LNG)

      expect(emCamadas.bars.map((achado) => achado.id)).toEqual(ordemEsperada)
      expect(linear.bars.map((achado) => achado.id)).toEqual(ordemEsperada)
      expect(linear.bars).not.toBe(emCamadas.bars)
      expect(linear.bars.map((achado) => achado.plan)).toEqual(
        emCamadas.bars.map((achado) => achado.plan)
      )
      expect(linear.bars.map((achado) => achado.event_count)).toEqual(
        emCamadas.bars.map((achado) => achado.event_count)
      )
      expect(linear.bars.map((achado) => achado.nextEvent?.startsAt)).toEqual(
        emCamadas.bars.map((achado) => achado.nextEvent?.startsAt)
      )

      // Paginação de um em um também tem de bater, inclusive na fronteira
      // entre camadas — é onde um cursor incompatível apareceria.
      const lngPaginado = ORIGIN_LNG + 0.02
      await db
        .update(bar)
        .set({ longitude: lngPaginado.toFixed(8) })
        .where(inArray(bar.id, barIds))

      await setAppConfig('search.tiered_plan_query', true, null)
      expect(await paginar(lngPaginado)).toEqual(ordemEsperada)

      await setAppConfig('search.tiered_plan_query', false, null)
      expect(await paginar(lngPaginado)).toEqual(ordemEsperada)

      // --- projeção corrompida: é aqui que o interruptor se paga -----------
      //
      // O UPDATE mexe em `bar` direto. A trigger da 0018 só dispara sobre
      // `subscription`, então ela não corrige nada — que é exatamente a forma
      // como uma projeção sai de sincronia na vida real.
      const eliteRebaixado = fixtures.find(
        (fixture) => fixture.plan === 'elite'
      )
      if (!eliteRebaixado) throw new Error('fixture elite ausente')

      await db.execute(
        sql`UPDATE bar SET plan = 'starter' WHERE id = ${eliteRebaixado.barId}`
      )

      const lngCorrompido = ORIGIN_LNG + 0.04
      await db
        .update(bar)
        .set({ longitude: lngCorrompido.toFixed(8) })
        .where(inArray(bar.id, barIds))

      await setAppConfig('search.tiered_plan_query', true, null)
      const corrompidoEmCamadas = await buscar(lngCorrompido)

      await setAppConfig('search.tiered_plan_query', false, null)
      const corrompidoLinear = await buscar(lngCorrompido)

      // O caminho em camadas acredita na projeção e rebaixa o bar pago.
      expect(corrompidoEmCamadas.bars[0]?.id).not.toBe(eliteRebaixado.barId)
      expect(
        corrompidoEmCamadas.bars.find(
          (achado) => achado.id === eliteRebaixado.barId
        )?.plan
      ).toBe('starter')

      // O linear lê o plano da assinatura e devolve a ordem correta.
      expect(corrompidoLinear.bars.map((achado) => achado.id)).toEqual(
        ordemEsperada
      )
      expect(
        corrompidoLinear.bars.find(
          (achado) => achado.id === eliteRebaixado.barId
        )?.plan
      ).toBe('elite')

      // E a trigger reconcilia assim que a assinatura é tocada de novo.
      await db
        .update(subscription)
        .set({ plan: 'elite' })
        .where(eq(subscription.barId, eliteRebaixado.barId))
      const reconciliado = await db.query.bar.findFirst({
        where: eq(bar.id, eliteRebaixado.barId),
        columns: { plan: true }
      })
      expect(reconciliado?.plan).toBe('elite')
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
