import { expect, test } from 'bun:test'
import { inArray, sql } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { recebeReservas } from '../lib/pub-search/shared'
import { receivesReservations } from '../lib/reservation-intake'
import { contextFor, load } from './integration-seed'

/**
 * O filtro de características é um `@>` — "contém todos" — e portanto tem
 * semântica de E: marcar telão e estacionamento devolve só quem tem os dois.
 *
 * Isso precisa de teste contra o banco, e não contra um mock, por dois
 * motivos que só aparecem no Postgres:
 *
 *   1. `@>` num `int[]` é fácil de confundir com `&&` (interseção, que seria
 *      OU). Os dois compilam, os dois passam em qualquer teste com um filtro
 *      só, e a diferença aparece apenas com dois ou mais marcados;
 *   2. o filtro tem de valer nos DOIS caminhos da busca, e o de emergência
 *      é o que ninguém exercita até o dia em que é ligado.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

/** Longe de qualquer bar de seed ou de outro teste. */
const ORIGIN_LAT = -33.25
const ORIGIN_LNG = -39.75

integrationTest(
  'filtro de características exige TODAS as marcadas, nos dois caminhos',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()

    // 1 = telão, 8 = estacionamento no local, 10 = aceita reserva.
    const fixtures = [
      { rotulo: 'ambos', amenities: [1, 8], offset: 0.001 },
      { rotulo: 'só telão', amenities: [1, 10], offset: 0.002 },
      { rotulo: 'só estacionamento', amenities: [8, 10], offset: 0.003 },
      { rotulo: 'nenhum', amenities: [], offset: 0.004 }
    ].map((fixture) => ({
      ...fixture,
      barId: crypto.randomUUID(),
      ownerId: crypto.randomUUID()
    }))

    const porRotulo = new Map(fixtures.map((f) => [f.rotulo, f.barId]))
    const ownerIds = fixtures.map((fixture) => fixture.ownerId)

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
        slug: `amenities-integration-${sportId}`
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
          amenities: fixture.amenities,
          isActive: true
        })
        await db.insert(subscription).values({
          barId: fixture.barId,
          plan: 'starter',
          status: 'active'
        })
        await db.insert(event).values({
          barId: fixture.barId,
          sportId,
          championship: `Jogo ${fixture.barId}`,
          startsAt: new Date(now.getTime() + 60 * 60_000)
        })
      }

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))

      // Cada busca precisa de coordenada própria: a chave do cache arredonda
      // a origem para ~110 m e o TTL é de 60 s, então repetir a coordenada
      // devolveria a página anterior. O passo é de 0,002° — o bastante para
      // mudar a terceira casa da chave, e pequeno o bastante para que a
      // origem deslocada continue com todos os bares dentro do raio.
      const buscar = async (amenities: number[] | undefined, passo: number) => {
        const page = await caller.pubs.search({
          lat: ORIGIN_LAT,
          lng: ORIGIN_LNG + passo * 0.002,
          radiusKm: 3,
          amenities,
          limit: 20
        })
        return page.bars.map((encontrado) => encontrado.id).sort()
      }

      // Uma só: os dois bares que a têm.
      expect(await buscar([1], 1)).toEqual(
        [porRotulo.get('ambos'), porRotulo.get('só telão')].sort() as string[]
      )

      // Duas: E, não OU. Se fosse `&&` no lugar de `@>`, viriam três.
      expect(await buscar([1, 8], 2)).toEqual([
        porRotulo.get('ambos') as string
      ])

      // Combinação que ninguém tem devolve vazio em vez de ignorar o filtro.
      expect(await buscar([1, 8, 10], 3)).toEqual([])

      // Sem filtro, todos continuam aparecendo — o `@>` não pode vazar para a
      // busca comum.
      expect((await buscar(undefined, 4)).length).toBe(fixtures.length)

      // Id desconhecido é descartado na normalização, não recusado: um
      // cliente desatualizado não pode zerar a busca de quem usa o app.
      expect(await buscar([1, 9999], 5)).toEqual(
        [porRotulo.get('ambos'), porRotulo.get('só telão')].sort() as string[]
      )

      // O caminho de emergência tem de filtrar igual. Ele é o que segura o
      // site quando a projeção de plano quebra, e um filtro que só existe no
      // caminho principal viraria "meu filtro parou de funcionar" no meio de
      // um incidente.
      await setAppConfig('search.tiered_plan_query', false, null)
      expect(await buscar([1, 8], 6)).toEqual([
        porRotulo.get('ambos') as string
      ])
      expect((await buscar(undefined, 7)).length).toBe(fixtures.length)
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)

/**
 * "Aceita reserva" (10) não é marcada: é a mesma coisa que receber reservas.
 * O filtro e o perfil a derivam da regra de `receivesReservations`, com o id
 * gravado em `bar.amenities` ou sem ele; a regra em SQL (`recebeReservas`) e
 * a em TypeScript têm de dizer a mesma coisa.
 */
integrationTest(
  'filtro e perfil dão "Aceita reserva" a todo bar que recebe reservas, e só a eles, nos três caminhos',
  async () => {
    const [{ db, appRouter }, { resetAppConfig, setAppConfig }] =
      await Promise.all([load(), import('../lib/app-config')])

    const lat = -36.5
    const lng = -43.5
    const fanId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    const now = new Date()
    const HOUR = 3_600_000

    // 1 = telão, 10 = aceita reserva. Quem não recebe tem o id 10 gravado, de
    // quando se marcava à mão; dos dois que recebem, um nunca o marcou.
    const casos: {
      rotulo: string
      accepts: boolean
      assinatura?: Omit<typeof subscription.$inferInsert, 'barId'>
      amenities: number[]
      recebe: boolean
    }[] = [
      {
        rotulo: 'Elite vigente, ligado, sem o id gravado',
        accepts: true,
        assinatura: { plan: 'elite', status: 'active' },
        amenities: [1],
        recebe: true
      },
      {
        rotulo: 'Elite vigente, ligado, com o id gravado',
        accepts: true,
        assinatura: { plan: 'elite', status: 'active' },
        amenities: [10],
        recebe: true
      },
      {
        rotulo: 'Elite vigente, desligado',
        accepts: false,
        assinatura: { plan: 'elite', status: 'active' },
        amenities: [1, 10],
        recebe: false
      },
      {
        rotulo: 'trial vencido',
        accepts: true,
        assinatura: {
          plan: 'elite',
          status: 'trialing',
          currentPeriodEnd: new Date(now.getTime() - HOUR)
        },
        amenities: [10],
        recebe: false
      },
      {
        rotulo: 'Pro vigente, ligado',
        accepts: true,
        assinatura: { plan: 'pro', status: 'active' },
        amenities: [10],
        recebe: false
      },
      {
        rotulo: 'sem assinatura',
        accepts: true,
        amenities: [10],
        recebe: false
      }
    ]
    const fixtures = casos.map((caso, index) => ({
      ...caso,
      offset: (index + 1) * 0.001,
      barId: crypto.randomUUID() as string,
      ownerId: crypto.randomUUID() as string
    }))

    const barIds = fixtures.map((fixture) => fixture.barId)
    const ownerIds = fixtures.map((fixture) => fixture.ownerId)
    const quemRecebe = fixtures
      .filter((fixture) => fixture.recebe)
      .map((fixture) => fixture.barId)
      .sort()
    const semIdGravado = barIds[0] as string

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
        slug: `reservas-integration-${sportId}`
      })

      for (const fixture of fixtures) {
        await db.insert(bar).values({
          id: fixture.barId,
          userId: fixture.ownerId,
          name: `Bar ${fixture.rotulo}`,
          address: 'Rua descartável, 1',
          neighborhood: 'Teste',
          city: 'Teste',
          latitude: (lat + fixture.offset).toFixed(8),
          longitude: lng.toFixed(8),
          amenities: fixture.amenities,
          acceptsReservations: fixture.accepts,
          isActive: true
        })
        if (fixture.assinatura) {
          await db
            .insert(subscription)
            .values({ barId: fixture.barId, ...fixture.assinatura })
        }
        await db.insert(event).values({
          barId: fixture.barId,
          sportId,
          championship: `Jogo ${fixture.barId}`,
          startsAt: new Date(now.getTime() + 60 * 60_000)
        })
      }

      // As duas regras, lado a lado, para os mesmos bares.
      const emSql = await db.execute(sql`
        SELECT b.id, ${recebeReservas(sql`b`)} AS recebe
        FROM bar b
        WHERE b.id IN (${sql.join(
          barIds.map((id) => sql`${id}`),
          sql`, `
        )})`)
      const emTypeScript = await db.query.bar.findMany({
        where: inArray(bar.id, barIds),
        columns: { id: true, acceptsReservations: true },
        with: { subscription: true }
      })
      const esperado = Object.fromEntries(
        fixtures.map((fixture) => [fixture.barId, fixture.recebe])
      )
      expect(
        Object.fromEntries(emSql.rows.map((row) => [row.id, row.recebe]))
      ).toEqual(esperado)
      expect(
        Object.fromEntries(
          emTypeScript.map((row) => [
            row.id,
            receivesReservations(
              row.acceptsReservations,
              row.subscription ?? null
            )
          ])
        )
      ).toEqual(esperado)

      const caller = appRouter.createCaller(contextFor(fanId, 'fan', now))

      // No perfil a característica segue o recebimento, não o que está gravado.
      const noPerfil: Record<string, boolean> = {}
      for (const barId of barIds) {
        const perfil = await caller.pubs.getById({ id: barId })
        noPerfil[barId] = perfil.amenities.includes(10)
      }
      expect(noPerfil).toEqual(esperado)

      // Coordenada própria por busca, pelo mesmo motivo do teste acima.
      let passo = 0
      const buscar = async (
        amenities: number[] | undefined,
        sort?: 'rating'
      ) => {
        passo += 1
        const page = await caller.pubs.search({
          lat,
          lng: lng + passo * 0.002,
          radiusKm: 3,
          amenities,
          sort,
          limit: 20
        })
        return page.bars.map((encontrado) => encontrado.id).sort()
      }

      // Em camadas, depois por avaliação, depois o de emergência.
      expect(await buscar([10])).toEqual(quemRecebe)
      expect(await buscar(undefined)).toEqual([...barIds].sort())
      expect(await buscar([10], 'rating')).toEqual(quemRecebe)
      expect(await buscar(undefined, 'rating')).toEqual([...barIds].sort())

      // Com outra característica continua sendo E: telão por `amenities`,
      // reserva pelo recebimento. O Elite desligado tem as duas gravadas.
      expect(await buscar([1, 10])).toEqual([semIdGravado])
      expect(await buscar([1, 10], 'rating')).toEqual([semIdGravado])

      await setAppConfig('search.tiered_plan_query', false, null)
      expect(await buscar([10])).toEqual(quemRecebe)
      expect(await buscar([1, 10])).toEqual([semIdGravado])
      expect(await buscar(undefined)).toEqual([...barIds].sort())
    } finally {
      await resetAppConfig('search.tiered_plan_query')
      await db.delete(user).where(inArray(user.id, [fanId, ...ownerIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
