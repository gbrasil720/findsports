import { expect, test } from 'bun:test'
import { eq } from '@findsports_oficial/db'
import { aiAction, aiRun } from '@findsports_oficial/db/schema/ai'
import { isDisposableTestDatabase } from '@findsports_oficial/db/utils/db-resolver'
import { setAiBinding } from '../lib/ai/binding'
import { CHAT_MODELS } from '../lib/ai/models'
import { contextFor, load, refusal, seedBar } from './integration-seed'

/**
 * Busca com IA (WEB-400) de ponta a ponta, com o modelo dublado (sem rede):
 * as ferramentas consultam o banco de verdade, o bar inventado sai da
 * resposta, só resposta útil desconta do limite e o limite diz quando volta.
 */
const integrationTest = isDisposableTestDatabase() ? test : test.skip

// Um ponto no mar, longe dos bares de outros testes.
const ORIGIN = { lat: -29.1, lng: -46.4 }

type Body = { messages: { role: string; content: string | null }[] }

/** Busca na primeira volta; depois responde citando o bar e um inventado. */
function fakeModel(log: string[]) {
  return {
    run: async (model: string, input: Record<string, unknown>) => {
      log.push(model)
      const last = (input as Body).messages.at(-1)
      if (last?.role === 'user')
        return {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function',
                    function: {
                      name: 'buscar_bares',
                      arguments: JSON.stringify({ caracteristicas: ['telao'] })
                    }
                  }
                ]
              }
            }
          ],
          usage: { prompt_tokens: 1000, completion_tokens: 50 }
        }
      const found = JSON.parse(last?.content ?? '{}').dados?.bares ?? []
      return {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'c2',
                  type: 'function',
                  function: {
                    name: 'responder',
                    arguments: JSON.stringify({
                      texto: `Achei ${found.length} bar com telão.`,
                      bares: [
                        ...found.map((b: { id: string }) => b.id),
                        '99999999-9999-4999-8999-999999999999'
                      ]
                    })
                  }
                }
              ]
            }
          }
        ],
        usage: { prompt_tokens: 1500, completion_tokens: 40 }
      }
    }
  }
}

integrationTest(
  'chat busca pela ferramenta, tira o bar inventado e só conta resposta útil',
  async () => {
    const { db, appRouter } = await load()
    const { setAppConfig, resetAppConfig } = await import('../lib/app-config')
    const seeded = await seedBar('pro', 'active', null, {
      name: 'Bar do Telão',
      latitude: String(ORIGIN.lat + 0.005),
      longitude: String(ORIGIN.lng),
      amenities: [1]
    })
    await seeded.seedGame({ startsAt: new Date(Date.now() + 3_600_000) })
    const fan = appRouter.createCaller(contextFor(seeded.fanId, 'fan'))
    const log: string[] = []
    setAiBinding(fakeModel(log))
    await setAppConfig('ai.enabled', true, null)

    try {
      expect(await fan.ai.status()).toEqual({
        kind: 'ready',
        remainingToday: 10,
        remainingMonth: 100
      })

      const answer = await fan.ai.chat({
        message: 'quero ver jogo com telão',
        origin: ORIGIN
      })
      if (answer.kind !== 'answer') throw new Error(answer.kind)
      expect(answer.text).toBe('Achei 1 bar com telão.')
      expect(answer.bars.map((b) => b.id)).toEqual([seeded.barId])
      expect(answer.chips).toEqual(['Telão', 'até 3 km'])
      expect(answer.search).toMatchObject({ amenities: [1], radiusKm: 3 })
      expect(answer.remainingToday).toBe(9)

      const [row] = await db
        .select()
        .from(aiRun)
        .where(eq(aiRun.runId, answer.runId))
      expect(row).toMatchObject({
        userId: seeded.fanId,
        feature: 'chat',
        status: 'ok',
        useful: true,
        tokensIn: 2500,
        tokensOut: 90
      })
      expect(Object.values(CHAT_MODELS)).toContain(row?.servedModel as never)
      expect(row?.assignedModel).toBe(row?.servedModel as string)
      expect(row?.costUsd).toBeGreaterThan(0)

      // Os dois modelos fora do ar: indisponível, linha com erro, não conta.
      log.length = 0
      setAiBinding({
        run: async (model) => {
          log.push(model)
          throw new Error('2021: Insufficient balance')
        }
      })
      expect(
        await fan.ai.chat({ message: 'e amanhã?', origin: ORIGIN })
      ).toEqual({ kind: 'unavailable' })
      expect(log).toHaveLength(3)
      expect(new Set(log).size).toBe(2)
      const rows = await db
        .select({ status: aiRun.status, useful: aiRun.useful })
        .from(aiRun)
        .where(eq(aiRun.userId, seeded.fanId))
      expect(rows).toHaveLength(2)
      expect(rows).toContainEqual({ status: 'error', useful: false })
      expect(await fan.ai.status()).toMatchObject({ remainingToday: 9 })

      // Polegar e ação só na própria resposta.
      await fan.ai.feedback({ runId: answer.runId, value: 1 })
      await fan.ai.action({
        runId: answer.runId,
        kind: 'open_bar',
        barId: seeded.barId
      })
      const other = appRouter.createCaller(
        contextFor(crypto.randomUUID(), 'fan')
      )
      expect(
        (await refusal(other.ai.feedback({ runId: answer.runId, value: -1 })))
          .code
      ).toBe('NOT_FOUND')
      const [rated] = await db
        .select({ feedback: aiRun.feedback })
        .from(aiRun)
        .where(eq(aiRun.runId, answer.runId))
      expect(rated?.feedback).toBe(1)
      expect(
        await db
          .select({ kind: aiAction.kind })
          .from(aiAction)
          .where(eq(aiAction.runId, answer.runId))
      ).toEqual([{ kind: 'open_bar' }])

      // Mais nove úteis hoje: o chat volta amanhã à meia-noite de Brasília.
      await db.insert(aiRun).values(
        Array.from({ length: 9 }, () => ({
          userId: seeded.fanId,
          feature: 'chat' as const,
          variant: 'a',
          assignedModel: CHAT_MODELS.a,
          status: 'ok' as const,
          useful: true
        }))
      )
      const limit = await fan.ai.chat({ message: 'mais um', origin: ORIGIN })
      expect(limit).toMatchObject({ kind: 'limit', scope: 'day' })
      if (limit.kind !== 'limit') throw new Error(limit.kind)
      const resumes = new Date(limit.resumesAt)
      expect(resumes.getUTCHours()).toBe(3)
      expect(resumes.getTime()).toBeGreaterThan(Date.now())
      expect(await fan.ai.status()).toMatchObject({ kind: 'limit' })
    } finally {
      await resetAppConfig('ai.enabled')
      await db.delete(aiRun).where(eq(aiRun.userId, seeded.fanId))
      await seeded.cleanup()
    }
  }
)

integrationTest(
  'chave desligada: indisponível, sem chamar modelo',
  async () => {
    const { appRouter } = await load()
    const log: string[] = []
    setAiBinding(fakeModel(log))
    const fan = appRouter.createCaller(contextFor(crypto.randomUUID(), 'fan'))
    expect(await fan.ai.chat({ message: 'oi' })).toEqual({
      kind: 'unavailable'
    })
    expect(log).toHaveLength(0)
  }
)
