import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  eventParticipants,
  sport,
  subscription,
  team
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

/**
 * WEB-481: com texto, a camada pro também parte de `texto_jogos` na primeira
 * página (a starter já partia); com cursor, segue bar a bar. Os dois jeitos
 * têm de devolver o mesmo que o caminho linear, que não tem pré-filtro: a
 * mesma lista, na mesma ordem, com o mesmo próximo jogo, em cada camada e
 * na paginação que cruza de uma para outra.
 *
 * WEB-539: o pré-filtro tem três ramos, e cada um passa pela mesma conferência:
 * poucos candidatos (raio de 3 km, teto de 90: a camada parte de cada
 * candidato), muitos candidatos com `texto_jogos` completo (raio de 1 km, teto
 * de 10 para 12 candidatos) e `texto_jogos` no teto de 2.000 (campeonato
 * comum: todo bar do raio passa).
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Longe de qualquer bar de seed ou de outro teste. */
const ORIGIN_LAT = -36.25
const ORIGIN_LNG = -41.25

integrationTest(
  'busca com texto: camadas e linear concordam em cada plano e na paginação',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    // Termo único: `texto_jogos` olha o banco inteiro, não só o raio.
    const termo = `zq${crypto.randomUUID().slice(0, 8)}`
    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const teamId = crypto.randomUUID()
    const now = new Date()
    const minutos = (m: number) => new Date(now.getTime() + m * 60_000)

    // Cada jeito de casar o texto, em cada plano, e um bar que não casa.
    const jeitos = ['time', 'livre', 'campeonato', 'nome', 'nenhum'] as const
    const fixtures = (['elite', 'pro', 'starter'] as const).flatMap((plan, p) =>
      jeitos.map((jeito, j) => ({
        plan,
        jeito,
        // Até ~830 m da origem: cabe no raio de 1 km.
        offset: 0.0005 * (p * jeitos.length + j + 1),
        barId: crypto.randomUUID(),
        ownerId: crypto.randomUUID(),
        eventId: crypto.randomUUID()
      }))
    )
    const longeId = crypto.randomUUID()
    const longeOwnerId = crypto.randomUUID()
    const ownerIds = [
      ...fixtures.map((fixture) => fixture.ownerId),
      longeOwnerId
    ]

    await db.insert(user).values(
      [
        { id: fanId, role: 'fan' as const },
        ...ownerIds.map((ownerId) => ({ id: ownerId, role: 'pub' as const }))
      ].map((row) => ({
        ...row,
        name: `Usuário ${row.id}`,
        email: `${row.id}@integration.invalid`,
        emailVerified: true,
        onboardingCompleted: true
      }))
    )

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `text-tiers-integration-${sportId}`
      })
      await db.insert(team).values({
        id: teamId,
        sportId,
        name: `Time ${termo}`,
        slug: `team-${teamId}`
      })

      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: fixture.jeito === 'nome' ? `Bar ${termo}` : 'Bar comum',
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
        // Um jogo antes que não casa: o próximo jogo mostrado tem de ser o
        // que casa (menos no bar casado pelo nome, em que todo jogo vale).
        await db.insert(event).values([
          {
            barId: fixture.barId,
            sportId,
            championship: 'Amistoso',
            startsAt: minutos(30)
          },
          {
            id: fixture.eventId,
            barId: fixture.barId,
            sportId,
            championship:
              fixture.jeito === 'campeonato' ? `Copa ${termo}` : 'Amistoso',
            participantFreeText:
              fixture.jeito === 'livre' ? `${termo} x Santos` : null,
            startsAt: minutos(60 + fixture.offset * 2000)
          }
        ])
        if (fixture.jeito === 'time') {
          await db
            .insert(eventParticipants)
            .values({ eventId: fixture.eventId, teamId })
        }
      }

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))

      // Coordenada nova a cada busca: o cache de 60 s usa a origem exata.
      let passo = 0
      const paginar = async (limit: number, radiusKm: number) => {
        passo += 1
        const linhas: { id: string; jogo?: string; plano: string }[] = []
        let cursor: string | undefined
        for (let i = 0; i < fixtures.length + 2; i++) {
          const page = await caller.pubs.search({
            lat: ORIGIN_LAT,
            lng: ORIGIN_LNG + passo * 0.0001,
            radiusKm,
            championship: termo.toUpperCase(),
            limit,
            cursor
          })
          linhas.push(
            ...page.bars.map((achado) => ({
              id: achado.id,
              jogo: achado.nextEvent?.id,
              plano: achado.plan
            }))
          )
          if (!page.nextCursor) break
          cursor = page.nextCursor
        }
        return linhas
      }

      const esperado = fixtures
        .filter((fixture) => fixture.jeito !== 'nenhum')
        .map((fixture) => fixture.barId)

      // Limite 20 cabe tudo numa página (pré-filtro na pro e na starter); 1 e
      // 3 passam pelo cursor e cruzam as camadas no meio da página.
      const conferir = async (radiusKm: number) => {
        for (const limit of [20, 3, 1]) {
          await setAppConfig('search.tiered_plan_query', true, null)
          const emCamadas = await paginar(limit, radiusKm)
          await setAppConfig('search.tiered_plan_query', false, null)
          const linear = await paginar(limit, radiusKm)

          expect({ radiusKm, limit, linhas: emCamadas }).toEqual({
            radiusKm,
            limit,
            linhas: linear
          })
          expect(emCamadas.map((linha) => linha.id).sort()).toEqual(
            [...esperado].sort()
          )
          expect(emCamadas.map((linha) => linha.plano)).toEqual(
            fixtures
              .filter((fixture) => fixture.jeito !== 'nenhum')
              .map((fixture) => fixture.plan)
          )
          for (const fixture of fixtures) {
            if (fixture.jeito === 'nenhum' || fixture.jeito === 'nome') continue
            expect(
              emCamadas.find((linha) => linha.id === fixture.barId)?.jogo
            ).toBe(fixture.eventId)
          }
        }
      }

      await conferir(3)
      await conferir(1)

      // Campeonato comum: 2.000 jogos que casam, num bar fora do raio, põem
      // `texto_jogos` no teto, e a lista do raio tem de continuar a mesma.
      await db.insert(bar).values({
        id: longeId,
        userId: longeOwnerId,
        name: 'Bar longe',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: (ORIGIN_LAT + 1).toFixed(8),
        longitude: ORIGIN_LNG.toFixed(8),
        isActive: true
      })
      await db.insert(event).values(
        Array.from({ length: 2000 }, (_, i) => ({
          barId: longeId,
          sportId,
          championship: `Copa ${termo} ${i}`,
          startsAt: minutos(120 + i)
        }))
      )
      await conferir(3)
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
