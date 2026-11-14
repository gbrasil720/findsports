import { db, sql } from '@findsports_oficial/db'
import { aiRun } from '@findsports_oficial/db/schema/ai'
import { assignVariant } from '../ai/limits'
import { RECOMMENDER_MODELS } from '../ai/models'
import { aiGate, runAi } from '../ai/run'
import { getAppConfig } from '../app-config'
import { affinityCandidates, requestAffinity } from './ai-affinity'
import type { RecommendationStyle } from './load-candidates'
import type { AiAffinity, RecommendationCandidate } from './ranking'

/*
 * O teste A × C de "Bares pra você" (WEB-426, fase 2; o B saiu em 14/11/2026
 * por perder do controle no painel às cegas). Com o teste ligado
 * (`ai.enabled` e `ai.recommender_enabled`), cada rodada nova do dia ganha
 * uma linha em `ai_run` com o MESMO `run_id` da rodada: as ações dos cards
 * (`recommendation_event`, que levam o `runId` da rodada) chegam ao braço
 * sorteado sem coluna nova. Desligado, nada muda: nenhuma linha, rodada como
 * sempre.
 *
 * A: só o algoritmo, sem chamada (linha com custo zero, para a comparação).
 * C: os 15 primeiros candidatos vão ao Clef-flash pelo `runAi` (tetos,
 * Gateway, `ai_run`), e a afinidade troca o eixo "Seu estilo". Falha: uma nova
 * tentativa no mesmo modelo; depois, a ordem do controle. Demora acima do
 * teto do spec cai direto no controle, com `timeout` na linha.
 *
 * Não há cache próprio: a rodada fica gravada o dia todo
 * (`recommendation_round`), então a IA é chamada no máximo uma vez por pessoa
 * por dia (duas com a nova tentativa).
 */

export const RECOMMENDER_EXPERIMENT = 'recommender-2026-11'

/** `assigned_model` da linha do braço A, que não chama modelo. */
export const CONTROL_MODEL = 'control'

/**
 * Teto de tempo de cada chamada: o p95 de 300 ms do spec (ADR 0001). Passou,
 * a rodada sai na ordem do controle.
 */
// ponytail: teto por chamada, não da rodada inteira; com a nova tentativa
// depois de erro a espera chega a 2 × 300 ms.
export const AFFINITY_TIMEOUT_MS = 300

export type RecommenderVariant = 'a' | 'c'

/** O braço da pessoa pelos pesos de A e C (o peso do B é ignorado). */
export function recommenderVariant(
  userId: string,
  weights: { a: number; c: number }
): RecommenderVariant {
  return assignVariant(userId, RECOMMENDER_EXPERIMENT, {
    a: weights.a,
    c: weights.c
  })
}

/** O braço da pessoa, ou nulo com o teste desligado. */
export async function recommenderArm(
  userId: string
): Promise<RecommenderVariant | null> {
  const [enabled, on, weights] = await Promise.all([
    getAppConfig('ai.enabled'),
    getAppConfig('ai.recommender_enabled'),
    getAppConfig('ai.variant_weights')
  ])
  if (!enabled || !on) return null
  return recommenderVariant(userId, weights.recommender)
}

/** Linha sem chamada ao modelo: o braço A, ou o C barrado pelos tetos. */
async function recordRun(
  userId: string,
  variant: RecommenderVariant,
  status: 'ok' | 'error'
) {
  const [row] = await db
    .insert(aiRun)
    .values({
      userId,
      feature: 'recommender',
      variant,
      assignedModel: variant === 'a' ? CONTROL_MODEL : RECOMMENDER_MODELS.c,
      status
    })
    .returning({ runId: aiRun.runId })
  return row?.runId ?? crypto.randomUUID()
}

/** Esportes e times da pessoa e a descrição publicada de cada bar. */
async function loadAffinityInputs(userId: string, barIds: string[]) {
  const [person, bars] = await Promise.all([
    db.execute<{ sports: string[] | null; teams: string[] | null }>(sql`
      SELECT
        (SELECT array_agg(s.name ORDER BY s.name)
          FROM user_preference_sports ups
          JOIN sport s ON s.id = ups.sport_id
          WHERE ups.user_id = ${userId}) AS sports,
        (SELECT array_agg(t.name ORDER BY t.name)
          FROM user_favorite_teams uft
          JOIN team t ON t.id = uft.team_id
          WHERE uft.user_id = ${userId}) AS teams
    `),
    db.execute<{ id: string; description: string | null }>(sql`
      SELECT id, description FROM bar
      WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(barIds)}::jsonb))
    `)
  ])
  return {
    sports: person.rows[0]?.sports ?? [],
    teams: person.rows[0]?.teams ?? [],
    descriptions: new Map(bars.rows.map((row) => [row.id, row.description]))
  }
}

export type RoundAi = { runId: string; affinity: AiAffinity | null }

/**
 * O braço da rodada nova e, no C, a afinidade da IA. Nulo com o teste
 * desligado (a rodada nasce como sempre). Qualquer falha vira a ordem do
 * controle: a rodada nunca deixa de sair por causa da IA.
 */
export async function planRoundAi(input: {
  userId: string
  candidates: RecommendationCandidate[]
  style: RecommendationStyle | null
  now: Date
  radiusKm: number
}): Promise<RoundAi | null> {
  const variant = await recommenderArm(input.userId)
  if (!variant) return null
  if (variant === 'a')
    return { runId: await recordRun(input.userId, 'a', 'ok'), affinity: null }

  const bars = affinityCandidates(input.candidates, input)
  if (bars.length === 0 || !input.style)
    return { runId: await recordRun(input.userId, 'c', 'ok'), affinity: null }
  const style = input.style

  // Teto do mês, gasto ou chamadas da pessoa: ordem do controle, e a linha
  // conta como queda para o controle.
  const gate = await aiGate(input.userId, input.now)
  if (!gate.ok)
    return {
      runId: await recordRun(input.userId, 'c', 'error'),
      affinity: null
    }

  try {
    const outcome = await runAi(
      {
        userId: input.userId,
        feature: 'recommender',
        variant: 'c',
        assignedModel: RECOMMENDER_MODELS.c
      },
      gate.deps,
      async (call) => {
        const extra = await loadAffinityInputs(
          input.userId,
          bars.map((bar) => bar.id)
        )
        const result = await requestAffinity(
          (model, body) =>
            call(model, body, { timeoutMs: AFFINITY_TIMEOUT_MS }),
          RECOMMENDER_MODELS.c,
          { sports: extra.sports, teams: extra.teams, ...style },
          bars.map((candidate) => ({
            candidate,
            description: extra.descriptions.get(candidate.id)
          })),
          { other: null }
        )
        return {
          value: result.affinity,
          status: result.status,
          servedModel: result.servedModel,
          useful: result.affinity !== null
        }
      }
    )
    return { runId: outcome.runId, affinity: outcome.value }
  } catch {
    // `runAi` já gravou a linha com `error`; sem o id dela, a rodada sai
    // com um novo e fica fora da comparação (raro: falha de banco).
    return { runId: crypto.randomUUID(), affinity: null }
  }
}
