import { expect, spyOn, test } from 'bun:test'
import { and, eq, inArray } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  eventParticipants,
  sport,
  team,
  userFavoriteTeams,
  userPreferenceSports
} from '@findsports_oficial/db/schema/platform'
import {
  barGameDismissal,
  weeklyGame
} from '@findsports_oficial/db/schema/weekly-games'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { env } from '@findsports_oficial/env/server'
import { seedBar } from '../../routers/integration-seed'
import { setAiBinding } from '../ai/binding'
import { runWeeklyGames } from './catalog'

/**
 * Jogos da semana (WEB-433) contra o banco de verdade: os números de cada
 * sugestão (torcedores na cidade, bares do bairro), a ordem, o "Não passo
 * esse", e a rotina inteira com a rede e o modelo dublados.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

// Hora cheia: o mesmo jogo gravado duas vezes tem o mesmo início.
const base = Math.ceil(Date.now() / 3_600_000) * 3_600_000
const hours = (h: number) => new Date(base + h * 3_600_000)

integrationTest(
  'sugestões do catálogo: números agregados, ordem, jogo já publicado e "Não passo esse"',
  async () => {
    const tag = crypto.randomUUID().slice(0, 8)
    const city = `Cidade ${tag}`
    const place = { city, neighborhood: 'Pinheiros' }
    const mine = await seedBar('pro', 'active', null, place)
    const other = await seedBar('pro', 'active', null, {
      ...place,
      neighborhood: 'pinheiros'
    })
    const { db } = mine
    const sportId = crypto.randomUUID()
    const [home, away, third] = ['Mandante', 'Visitante', 'Terceiro'].map(
      (name) => ({
        id: crypto.randomUUID(),
        sportId,
        name: `${name} ${tag}`,
        slug: `${name}-${tag}`.toLowerCase()
      })
    ) as [
      typeof team.$inferInsert,
      typeof team.$inferInsert,
      typeof team.$inferInsert
    ]
    const fans = Array.from({ length: 11 }, () => crypto.randomUUID())
    const gameIds: string[] = []
    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${tag}`,
        slug: `wg-${tag}`
      })
      await db.insert(team).values([home, away, third])
      await db.insert(user).values(
        fans.map((id, i) => ({
          id,
          name: `Torcedor ${i}`,
          email: `${id}@integration.invalid`,
          emailVerified: true,
          role: 'fan' as const,
          onboardingCompleted: true,
          // Um deles em outra cidade: não conta.
          searchCityName: i === 0 ? 'Outra' : city.toUpperCase()
        }))
      )
      await db
        .insert(userPreferenceSports)
        .values(fans.map((userId) => ({ userId, sportId })))
      await db.insert(userFavoriteTeams).values(
        fans.map((userId, i) => ({
          userId,
          sportId,
          teamId: (i % 2 ? home.id : away.id) as string
        }))
      )

      const games = await db
        .insert(weeklyGame)
        .values([
          {
            weekStart: '2026-11-09',
            key: `a-${tag}`,
            sportId,
            championship: `Liga ${tag}`,
            title: `${home.name} × ${away.name}`,
            homeTeamId: home.id,
            awayTeamId: away.id,
            startsAt: hours(48),
            channels: ['Premiere'],
            channelConfirmed: true
          },
          {
            weekStart: '2026-11-09',
            key: `b-${tag}`,
            sportId,
            championship: `Outra liga ${tag}`,
            title: `Jogo sem time ${tag}`,
            startsAt: hours(50)
          },
          {
            weekStart: '2026-11-09',
            key: `c-${tag}`,
            sportId,
            championship: `Liga ${tag}`,
            title: `${third.name} × ${home.name}`,
            homeTeamId: third.id,
            awayTeamId: home.id,
            startsAt: hours(52)
          }
        ])
        .returning({ id: weeklyGame.id })
      gameIds.push(...games.map((g) => g.id))
      const [first, second, third_] = gameIds as [string, string, string]

      // O outro bar do bairro já publicou o primeiro jogo (pelos times).
      const [published] = await db
        .insert(event)
        .values({
          barId: other.barId,
          sportId,
          championship: `Liga ${tag}`,
          startsAt: hours(48)
        })
        .returning({ id: event.id })
      await db.insert(eventParticipants).values([
        {
          eventId: published?.id as string,
          teamId: home.id as string,
          position: 0
        },
        {
          eventId: published?.id as string,
          teamId: away.id as string,
          position: 1
        }
      ])
      // Histórico do meu bar: a mesma liga, há uma semana.
      await db.insert(event).values({
        barId: mine.barId,
        sportId,
        championship: `Liga ${tag}`,
        startsAt: hours(-24 * 7)
      })
      // E o terceiro jogo eu já tenho (mesmo início e título): não volta.
      await db.insert(event).values({
        barId: mine.barId,
        sportId,
        championship: `Liga ${tag}`,
        participantFreeText: `${third.name} × ${home.name}`,
        startsAt: hours(52)
      })

      const got = await mine.owner.pub.gameSuggestions({ limit: 10 })
      const fromCatalog = got.filter((s) => s.catalogId)
      expect(fromCatalog.map((s) => s.catalogId)).toEqual([first, second])
      expect(fromCatalog[0]).toMatchObject({
        title: `${home.name} × ${away.name}`,
        participantIds: [home.id, away.id],
        participantFreeText: null,
        channels: ['Premiere'],
        channelConfirmed: true,
        // 10 da cidade (um está em outra): passa do piso.
        fansInCity: 10,
        barsInNeighborhood: 1,
        // O histórico conta o jogo de semana passada e o que ele já marcou.
        reason: `Você costuma passar Liga ${tag}`,
        featured: true
      })
      expect(fromCatalog[1]).toMatchObject({
        participantIds: [],
        participantFreeText: `Jogo sem time ${tag}`,
        channels: null,
        fansInCity: null,
        barsInNeighborhood: 0,
        featured: false
      })
      expect(got.some((s) => s.catalogId === third_)).toBe(false)

      // Sem entrada continua respondendo (cliente antigo).
      expect(Array.isArray(await mine.owner.pub.gameSuggestions())).toBe(true)

      await mine.owner.pub.dismissGameSuggestion({ catalogId: first })
      await mine.owner.pub.dismissGameSuggestion({ catalogId: first })
      const after = await mine.owner.pub.gameSuggestions({ limit: 10 })
      expect(after.map((s) => s.catalogId)).not.toContain(first)
      await expect(
        mine.owner.pub.dismissGameSuggestion({ catalogId: 'nao-existe' })
      ).rejects.toThrow('Esse jogo não está mais na lista.')
    } finally {
      await db.delete(weeklyGame).where(inArray(weeklyGame.id, gameIds))
      await db.delete(user).where(inArray(user.id, fans))
      await mine.cleanup()
      await other.cleanup()
      await db.delete(sport).where(eq(sport.id, sportId))
    }
  }
)

integrationTest(
  'a rotina monta o catálogo da semana com busca, página e modelo dublados',
  async () => {
    const tag = crypto.randomUUID().slice(0, 8)
    const championship = `Liga dublada ${tag}`
    // Uma segunda de 2027: nenhum outro teste grava nessa semana.
    const now = new Date('2027-03-01T12:00:00Z')
    const seeded = await seedBar('pro', 'active', null)
    const { db } = seeded
    await seeded.seedGame({
      championship,
      startsAt: new Date('2027-02-25T22:00:00Z')
    })
    const keys = env as { CF_ACCOUNT_ID?: string }
    const previousAccount = keys.CF_ACCOUNT_ID
    keys.CF_ACCOUNT_ID = 'contadublada'
    process.env.CLOUDFLARE_API_TOKEN = 'token-dublado'
    const page = `# ${championship}\nQuarta, 03/03, 20:30 — Time A x Time B (Premiere)`
    const real = globalThis.fetch
    const calls: string[] = []
    const spy = spyOn(globalThis, 'fetch').mockImplementation(((
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const url = String(input instanceof Request ? input.url : input)
      const json = (body: unknown) =>
        Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
      if (url.endsWith('/robots.txt'))
        return Promise.resolve(new Response('', { status: 404 }))
      if (url.includes('/ai/websearch/')) {
        const { query } = JSON.parse(String(init?.body))
        calls.push(`busca: ${query}`)
        return json({
          success: true,
          result: {
            items: String(query).startsWith(championship)
              ? [{ url: 'https://jogos.example/semana' }]
              : []
          }
        })
      }
      if (url.includes('/browser-rendering/markdown')) {
        calls.push('página')
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, result: page }), {
            status: 200,
            headers: { 'x-browser-ms-used': '8000' }
          })
        )
      }
      if (url.includes('api.cloudflare.com') || url.includes('football-data'))
        throw new Error(`rede de verdade no teste: ${url}`)
      return real(input, init)
    }) as typeof fetch)
    setAiBinding({
      run: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                jogos: [
                  {
                    jogo: 'Time A x Time B',
                    data: '2027-03-03',
                    hora: '20:30',
                    canais: ['Premiere']
                  },
                  // Hora que a página não escreve: sai.
                  {
                    jogo: 'Time C x Time D',
                    data: '2027-03-03',
                    hora: '18:00',
                    canais: []
                  }
                ]
              })
            }
          }
        ],
        usage: { prompt_tokens: 9000, total_tokens: 9100 }
      })
    })
    try {
      const result = await runWeeklyGames('houdini', now)
      expect(result).toMatchObject({
        mode: 'catalog',
        weekStart: '2027-03-01',
        games: 1,
        withChannel: 1,
        stoppedByBudget: false
      })
      expect(calls).toContain('página')
      const rows = await db
        .select()
        .from(weeklyGame)
        .where(eq(weeklyGame.weekStart, '2027-03-01'))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        title: 'Time A × Time B',
        championship,
        channels: ['Premiere'],
        channelConfirmed: true
      })
      // 20:30 de Brasília é 23:30 UTC.
      expect(rows[0]?.startsAt.toISOString()).toBe('2027-03-03T23:30:00.000Z')
      const [run] = await db
        .select()
        .from(aiRun)
        .where(
          and(eq(aiRun.feature, 'weekly_games'), eq(aiRun.variant, 'catalog'))
        )
        .orderBy(aiRun.createdAt)
      // Busca (US$ 0,007 cada) + página + modelo entram no custo da linha.
      expect(run?.costUsd ?? 0).toBeGreaterThan(0.007)
      expect(run?.userId).toBeNull()

      // Rodar de novo na mesma semana é a passada do canal: nada sem canal.
      const again = await runWeeklyGames('houdini', now)
      expect(again).toMatchObject({ mode: 'channels', games: 0 })
      // O cron desligado (padrão) não faz nada.
      expect(await runWeeklyGames('cron', now)).toEqual({
        skipped: 'desligada'
      })
    } finally {
      spy.mockRestore()
      keys.CF_ACCOUNT_ID = previousAccount
      delete process.env.CLOUDFLARE_API_TOKEN
      await db.delete(weeklyGame).where(eq(weeklyGame.weekStart, '2027-03-01'))
      await db.delete(aiRun).where(eq(aiRun.feature, 'weekly_games'))
      await seeded.cleanup()
      await db.delete(bar).where(eq(bar.id, seeded.barId))
    }
  }
)
