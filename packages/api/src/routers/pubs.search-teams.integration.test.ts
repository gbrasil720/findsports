import { expect, test } from 'bun:test'
import { inArray } from '@findsports_oficial/db'
import { user } from '@findsports_oficial/db/schema/auth'
import { sport, team } from '@findsports_oficial/db/schema/platform'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { contextFor, load } from './integration-seed'

const integrationTest = isDisposableTestDatabase() ? test : test.skip

integrationTest(
  'busca no catálogo de times: sem acento, por apelido, só nos esportes pedidos (WEB-381)',
  async () => {
    const { db, appRouter } = await load()
    const suffix = crypto.randomUUID()
    const footballId = crypto.randomUUID()
    const mmaId = crypto.randomUUID()
    const fanId = crypto.randomUUID()
    const row = (
      sportId: string,
      name: string,
      searchText: string,
      relevance: number,
      featured = false
    ) => ({
      sportId,
      name,
      slug: `${name}-${suffix}`,
      searchText,
      relevance,
      featured
    })

    await db.insert(sport).values([
      { id: footballId, name: 'Futebol', slug: `futebol-${suffix}` },
      { id: mmaId, name: 'MMA', slug: `mma-${suffix}` }
    ])
    await db.insert(team).values([
      row(footballId, 'Corinthians', 'corinthians | timao', 104, true),
      row(footballId, 'Ponte Preta', 'ponte preta | macaca', 36),
      row(
        footballId,
        'Grêmio',
        'gremio | gremio foot-ball porto alegrense',
        60
      ),
      row(
        footballId,
        'Brasil de Pelotas',
        'brasil de pelotas | gremio esportivo brasil',
        21
      ),
      row(footballId, '100% Futebol', 'clube 100% futebol', 1),
      {
        ...row(mmaId, 'Charles Oliveira', 'charles oliveira | do bronx', 30),
        kind: 'athlete' as const
      }
    ])
    await db.insert(user).values({
      id: fanId,
      name: 'Torcedor',
      email: `${fanId}@integration.invalid`,
      emailVerified: true,
      role: 'fan'
    })
    const fan = appRouter.createCaller(contextFor(fanId, 'fan', new Date()))
    const search = async (query: string, sportIds = [footballId, mmaId]) =>
      (await fan.pubs.searchTeams({ sportIds, query })).map((t) => t.name)

    try {
      // Fora do destaque, mas a busca acha; acento e caixa não importam.
      expect(await search('PONTE')).toEqual(['Ponte Preta'])
      expect(await search('grêmio')).toEqual(['Grêmio', 'Brasil de Pelotas'])
      // Apelido conta.
      expect(await search('timão')).toEqual(['Corinthians'])
      // Quem começa com o termo vem antes do mais conhecido.
      expect(await search('bras')).toEqual(['Brasil de Pelotas'])
      // Começo de palavra, não meio: "eta" não acha "Ponte Preta".
      expect(await search('eta')).toEqual([])
      expect(await search('preta')).toEqual(['Ponte Preta'])
      // `%`, `_` e símbolo de expressão regular são texto.
      expect(await search('100%')).toEqual(['100% Futebol'])
      expect(await search('o_')).toEqual([])
      expect(await search('(.*')).toEqual([])
      // Só nos esportes pedidos, e o atleta vem marcado.
      expect(await search('oliveira', [footballId])).toEqual([])
      expect(
        await fan.pubs.searchTeams({ sportIds: [mmaId], query: 'bronx' })
      ).toMatchObject([{ name: 'Charles Oliveira', kind: 'athlete' }])
      // Sem busca, só o destaque.
      expect(
        (await fan.pubs.getTeamsBySport({ sportId: footballId })).map(
          (t) => t.name
        )
      ).toEqual(['Corinthians'])
    } finally {
      await db.delete(user).where(inArray(user.id, [fanId]))
      await db.delete(sport).where(inArray(sport.id, [footballId, mmaId]))
    }
  }
)
