import { expect, test } from 'bun:test'
import { user } from '@findsports_oficial/db/schema/auth'
import {
  bar,
  event,
  sport,
  subscription
} from '@findsports_oficial/db/schema/platform'
import { inArray } from 'drizzle-orm'

import { wilsonLowerBound } from '../lib/rating'

/**
 * O que este teste trava, e por que cada coisa precisa de banco de verdade:
 *
 *   1. **O portão de elegibilidade.** É a diferença entre uma nota que
 *      significa algo e um placar de popularidade. Depende de uma linha em
 *      `bar_commercial_event` com o jogo certo — não dá para simular sem o
 *      banco sem simular justamente o que se quer verificar.
 *
 *   2. **A trigger de contadores.** Insert, correção e remoção mexem em
 *      `rating_count`/`rating_positive`, e ninguém no TypeScript escreve
 *      esses números. Se a trigger errar, a busca ordena errado em silêncio.
 *
 *   3. **A cópia da fórmula de Wilson.** Ela existe duas vezes: em SQL, na
 *      coluna gerada, e em TypeScript. Duas cópias divergem, e a divergência
 *      aqui reordena a busca inteira sem nenhum sintoma visível.
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

const ORIGIN_LAT = -35.75
const ORIGIN_LNG = -37.25

function sessionFor(userId: string, role: 'fan' | 'pub', now: Date) {
  return {
    auth: null,
    clientIp: '127.0.0.1',
    session: {
      session: {
        id: crypto.randomUUID(),
        token: crypto.randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 3_600_000),
        ipAddress: null,
        userAgent: null
      },
      user: {
        id: userId,
        name: `Usuário ${userId}`,
        email: `${userId}@integration.invalid`,
        emailVerified: true,
        image: null,
        role,
        banned: false,
        onboardingCompleted: true,
        searchRadiusKm: 3,
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now
      }
    }
  }
}

integrationTest(
  'portão de elegibilidade, contadores por trigger e Wilson da coluna gerada',
  async () => {
    const [{ db, sql }, { appRouter }] = await Promise.all([
      import('@findsports_oficial/db'),
      import('./index')
    ])

    const now = new Date()
    const ownerId = crypto.randomUUID()
    const barId = crypto.randomUUID()
    const sportId = crypto.randomUUID()
    // Um fã com intenção registrada, um sem, e mais dois para a amostra.
    const comIntencao = crypto.randomUUID()
    const semIntencao = crypto.randomUUID()
    const extra1 = crypto.randomUUID()
    const extra2 = crypto.randomUUID()
    const fanIds = [comIntencao, semIntencao, extra1, extra2]

    // Jogo que já acabou: começou há 6 h e a janela ao vivo é de 3 h.
    const jogoPassadoId = crypto.randomUUID()
    // Jogo que ainda vai acontecer.
    const jogoFuturoId = crypto.randomUUID()

    await db.insert(user).values([
      {
        id: ownerId,
        name: 'Dono',
        email: `${ownerId}@integration.invalid`,
        emailVerified: true,
        role: 'pub' as const,
        onboardingCompleted: true
      },
      ...fanIds.map((id) => ({
        id,
        name: `Torcedor ${id}`,
        email: `${id}@integration.invalid`,
        emailVerified: true,
        role: 'fan' as const,
        onboardingCompleted: true
      }))
    ])

    try {
      await db.insert(sport).values({
        id: sportId,
        name: `Esporte ${sportId}`,
        slug: `rating-integration-${sportId}`
      })

      await db.insert(bar).values({
        id: barId,
        userId: ownerId,
        name: 'Bar da avaliação',
        address: 'Rua descartável, 1',
        neighborhood: 'Teste',
        city: 'Teste',
        latitude: ORIGIN_LAT.toFixed(8),
        longitude: ORIGIN_LNG.toFixed(8),
        isActive: true
      })
      await db
        .insert(subscription)
        .values({ barId, plan: 'starter', status: 'active' })

      await db.insert(event).values([
        {
          id: jogoPassadoId,
          barId,
          sportId,
          championship: 'Jogo que acabou',
          startsAt: new Date(now.getTime() - 6 * 60 * 60_000)
        },
        {
          id: jogoFuturoId,
          barId,
          sportId,
          championship: 'Jogo que vem',
          startsAt: new Date(now.getTime() + 6 * 60 * 60_000)
        }
      ])

      // Intenção registrada: todos menos `semIntencao`, e um deles também
      // para o jogo futuro (que não deve liberar avaliação ainda).
      const intencoes = [
        { userId: comIntencao, eventId: jogoPassadoId },
        { userId: extra1, eventId: jogoPassadoId },
        { userId: extra2, eventId: jogoPassadoId },
        { userId: comIntencao, eventId: jogoFuturoId }
      ]
      for (const intencao of intencoes) {
        await db.execute(sql`
          INSERT INTO bar_commercial_event
            (id, bar_id, actor_user_id, type, source_event_id, occurred_at, commercial_day)
          VALUES (
            ${crypto.randomUUID()}, ${barId}, ${intencao.userId},
            'directions_opened', ${intencao.eventId}, NOW(), CURRENT_DATE
          )
        `)
      }

      const contadores = async () => {
        const linha = await db.query.bar.findFirst({
          where: (b, { eq }) => eq(b.id, barId),
          columns: { ratingCount: true, ratingPositive: true }
        })
        return linha as { ratingCount: number; ratingPositive: number }
      }

      // --- portão -------------------------------------------------------

      // Quem nunca demonstrou interesse não avalia.
      await expect(
        appRouter
          .createCaller(sessionFor(semIntencao, 'fan', now))
          .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      ).rejects.toThrow(/demonstrou interesse/i)

      // Jogo que ainda não acabou não avalia, mesmo com intenção.
      await expect(
        appRouter
          .createCaller(sessionFor(comIntencao, 'fan', now))
          .ratings.submit({ barId, eventId: jogoFuturoId, wouldReturn: true })
      ).rejects.toThrow(/ainda não acabou/i)

      // Conta de bar não avalia.
      await expect(
        appRouter
          .createCaller(sessionFor(ownerId, 'pub', now))
          .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      ).rejects.toThrow(/torcedores/i)

      expect(await contadores()).toEqual({ ratingCount: 0, ratingPositive: 0 })

      // --- contadores por trigger ---------------------------------------

      await appRouter
        .createCaller(sessionFor(comIntencao, 'fan', now))
        .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      expect(await contadores()).toEqual({ ratingCount: 1, ratingPositive: 1 })

      // Reenviar CORRIGE em vez de somar: a amostra não infla com quem mudou
      // de ideia.
      await appRouter
        .createCaller(sessionFor(comIntencao, 'fan', now))
        .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: false })
      expect(await contadores()).toEqual({ ratingCount: 1, ratingPositive: 0 })

      await appRouter
        .createCaller(sessionFor(comIntencao, 'fan', now))
        .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      expect(await contadores()).toEqual({ ratingCount: 1, ratingPositive: 1 })

      for (const fanId of [extra1, extra2]) {
        await appRouter
          .createCaller(sessionFor(fanId, 'fan', now))
          .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      }
      expect(await contadores()).toEqual({ ratingCount: 3, ratingPositive: 3 })

      // --- Wilson: SQL gerado versus TypeScript -------------------------

      const score = await db.execute(
        sql`SELECT rating_score FROM bar WHERE id = ${barId}`
      )
      const doBanco = Number(
        (score.rows[0] as { rating_score: number }).rating_score
      )
      expect(doBanco).toBeCloseTo(wilsonLowerBound(3, 3), 10)
      // E o valor precisa ser bem menor que a média crua de 1,0 — é o
      // objetivo inteiro de usar Wilson.
      expect(doBanco).toBeLessThan(0.5)

      // --- pendências ---------------------------------------------------

      // Quem já avaliou não recebe pendência do mesmo jogo.
      const pendentesDeQuemAvaliou = await appRouter
        .createCaller(sessionFor(comIntencao, 'fan', now))
        .ratings.getPending()
      expect(pendentesDeQuemAvaliou.map((item) => item.eventId)).not.toContain(
        jogoPassadoId
      )

      // Quem tem intenção e ainda não avaliou, recebe.
      await db.execute(sql`
        INSERT INTO bar_commercial_event
          (id, bar_id, actor_user_id, type, source_event_id, occurred_at, commercial_day)
        VALUES (
          ${crypto.randomUUID()}, ${barId}, ${semIntencao},
          'whatsapp_opened', ${jogoPassadoId}, NOW(), CURRENT_DATE
        )
      `)
      const pendentes = await appRouter
        .createCaller(sessionFor(semIntencao, 'fan', now))
        .ratings.getPending()
      expect(pendentes.map((item) => item.eventId)).toContain(jogoPassadoId)
      expect(pendentes[0]?.barName).toBe('Bar da avaliação')

      // --- remoção -------------------------------------------------------

      await appRouter
        .createCaller(sessionFor(extra2, 'fan', now))
        .ratings.remove({ barId, eventId: jogoPassadoId })
      expect(await contadores()).toEqual({ ratingCount: 2, ratingPositive: 2 })
    } finally {
      await db.delete(user).where(inArray(user.id, [ownerId, ...fanIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
