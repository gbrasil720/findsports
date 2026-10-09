import { expect, test } from 'bun:test'
import { inArray, sql } from '@findsports_oficial/db'
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

import { wilsonLowerBound } from '../lib/rating'
import { contextFor, load } from './integration-seed'

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
const integrationTest = isDisposableTestDatabase() ? test : test.skip

const ORIGIN_LAT = -35.75
const ORIGIN_LNG = -37.25

integrationTest(
  'portão de elegibilidade, contadores por trigger e Wilson da coluna gerada',
  async () => {
    const { db, appRouter } = await load()

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

      // WEB-258: o jogo é nomeado pelos times, não só pelo campeonato.
      // Inseridos fora de ordem: a leitura devolve em ordem alfabética.
      const times = ['Palmeiras', 'Corinthians'].map((name) => ({
        id: crypto.randomUUID(),
        sportId,
        name,
        slug: `${name}-${sportId}`
      }))
      await db.insert(team).values(times)
      await db
        .insert(eventParticipants)
        .values(times.map(({ id }) => ({ eventId: jogoPassadoId, teamId: id })))
      const quemJoga = {
        championship: 'Jogo que acabou',
        participantFreeText: null,
        participants: ['Corinthians', 'Palmeiras']
      }

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
          .createCaller(contextFor(semIntencao, 'fan', now))
          .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      ).rejects.toThrow(/demonstrou interesse/i)

      // Jogo que ainda não acabou não avalia, mesmo com intenção.
      await expect(
        appRouter
          .createCaller(contextFor(comIntencao, 'fan', now))
          .ratings.submit({ barId, eventId: jogoFuturoId, wouldReturn: true })
      ).rejects.toThrow(/ainda não acabou/i)

      // Conta de bar não avalia.
      await expect(
        appRouter
          .createCaller(contextFor(ownerId, 'pub', now))
          .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      ).rejects.toThrow(/torcedores/i)

      expect(await contadores()).toEqual({ ratingCount: 0, ratingPositive: 0 })

      // --- contadores por trigger ---------------------------------------

      await appRouter
        .createCaller(contextFor(comIntencao, 'fan', now))
        .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      expect(await contadores()).toEqual({ ratingCount: 1, ratingPositive: 1 })

      // Reenviar CORRIGE em vez de somar: a amostra não infla com quem mudou
      // de ideia.
      await appRouter
        .createCaller(contextFor(comIntencao, 'fan', now))
        .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: false })
      expect(await contadores()).toEqual({ ratingCount: 1, ratingPositive: 0 })

      await appRouter
        .createCaller(contextFor(comIntencao, 'fan', now))
        .ratings.submit({ barId, eventId: jogoPassadoId, wouldReturn: true })
      expect(await contadores()).toEqual({ ratingCount: 1, ratingPositive: 1 })

      for (const fanId of [extra1, extra2]) {
        await appRouter
          .createCaller(contextFor(fanId, 'fan', now))
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
        .createCaller(contextFor(comIntencao, 'fan', now))
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
        .createCaller(contextFor(semIntencao, 'fan', now))
        .ratings.getPending()
      expect(pendentes.map((item) => item.eventId)).toContain(jogoPassadoId)
      expect(pendentes[0]?.barName).toBe('Bar da avaliação')
      expect(pendentes[0]).toMatchObject(quemJoga)

      // A lista de avaliações do dono nomeia o jogo do mesmo jeito.
      const doDono = await appRouter
        .createCaller(contextFor(ownerId, 'pub', now))
        .pub.getMyRatings()
      expect(doDono.recent).toHaveLength(3)
      expect(doDono.recent[0]).toMatchObject(quemJoga)

      // --- remoção -------------------------------------------------------

      await appRouter
        .createCaller(contextFor(extra2, 'fan', now))
        .ratings.remove({ barId, eventId: jogoPassadoId })
      expect(await contadores()).toEqual({ ratingCount: 2, ratingPositive: 2 })
      // É o "Desfazer" do card (WEB-321): a pergunta volta para quem desfez.
      const depoisDeDesfazer = await appRouter
        .createCaller(contextFor(extra2, 'fan', now))
        .ratings.getPending()
      expect(depoisDeDesfazer.map((item) => item.eventId)).toContain(
        jogoPassadoId
      )
    } finally {
      await db.delete(user).where(inArray(user.id, [ownerId, ...fanIds]))
      await db.delete(sport).where(inArray(sport.id, [sportId]))
    }
  }
)
