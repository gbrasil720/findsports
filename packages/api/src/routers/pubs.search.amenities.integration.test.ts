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

/** Longe de qualquer bar de seed ou de outro teste. */
const ORIGIN_LAT = -33.25
const ORIGIN_LNG = -39.75

integrationTest(
  'filtro de características exige TODAS as marcadas, nos dois caminhos',
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
            twoFactorEnabled: false,
            createdAt: now,
            updatedAt: now
          }
        }
      })

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
