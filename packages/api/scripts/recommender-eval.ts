/**
 * Fase offline do teste A/B/C do recomendador (WEB-426). Roda as três
 * variantes sobre os mesmos perfis e candidatos: A é o ranking de regras; B
 * (Jev) e C (Clef-flash) trocam o eixo "Seu estilo" pela afinidade da IA
 * (`lib/recommendations/ai-affinity.ts`). Mede, contra A: em quantos perfis o
 * trio muda (e quantos cards troca), o Kendall tau da ordem dos 15 candidatos
 * que foram à IA, o tempo por chamada, desvios, falhas e o custo (preços de
 * `lib/ai/models.ts`).
 *
 * Perfis sintéticos e reprodutíveis (semente fixa), nunca dados de produção.
 * O JSON traz o trio de cada variante por perfil, para o painel às cegas.
 *
 * Por padrão roda com o modelo DUBLADO (sem rede, sem custo, sem env):
 *
 *   bun packages/api/scripts/recommender-eval.ts [--profiles 30] [--seed 426] [--out r.json]
 *
 * Com o modelo de verdade, só com `--live` E `--max-usd` (teto do script; para
 * antes da chamada que passaria dele). Pelo binding de desenvolvimento
 * (login do wrangler) e o Gateway `default`, em `packages/api`:
 *
 *   NODE_ENV=development bun --env-file=../../apps/web/.env run \
 *     scripts/recommender-eval.ts --live --max-usd 0.05 --out r.json
 *
 * Não grava em `ai_run`: mede o modelo, não a pessoa (como `ai-chat-eval.ts`).
 * Passa da fase offline a variante que mudar o trio em 20%+ dos perfis E não
 * perder do controle no painel dos sócios (o painel é à parte).
 */

import { writeFileSync } from 'node:fs'

import { costUsd, RECOMMENDER_MODELS } from '../src/lib/ai/models'
import { AMENITIES } from '../src/lib/amenities'
import {
  type AffinityProfile,
  affinityCandidates,
  type RecommenderModel,
  requestAffinity
} from '../src/lib/recommendations/ai-affinity'
import {
  jaccard,
  type RecommendationCandidate,
  rankRecommendations,
  scoreRecommendationCandidate
} from '../src/lib/recommendations/ranking'

const NOW = new Date('2026-11-12T15:00:00.000Z')
const TRIO = 3

/** Kendall tau-b entre duas notas dos mesmos itens (1 = mesma ordem). */
export function kendallTau(first: number[], second: number[]): number {
  let concordant = 0
  let discordant = 0
  let tiesFirst = 0
  let tiesSecond = 0
  for (let i = 0; i < first.length; i++) {
    for (let j = i + 1; j < first.length; j++) {
      const a = Math.sign((first[i] ?? 0) - (first[j] ?? 0))
      const b = Math.sign((second[i] ?? 0) - (second[j] ?? 0))
      if (a === 0 && b === 0) continue
      if (a === 0) tiesFirst++
      else if (b === 0) tiesSecond++
      else if (a === b) concordant++
      else discordant++
    }
  }
  const denominator = Math.sqrt(
    (concordant + discordant + tiesFirst) *
      (concordant + discordant + tiesSecond)
  )
  return denominator === 0 ? 1 : (concordant - discordant) / denominator
}

/** Quantos cards do trio da variante não estão no trio do controle. */
export function swappedCards(control: string[], variant: string[]): number {
  const base = new Set(control)
  return variant.filter((id) => !base.has(id)).length
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
}

/** PRNG com semente (mulberry32): o mesmo `--seed` dá os mesmos perfis. */
function rng(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(next() * list.length)] as T
  const some = <T>(list: readonly T[], min: number, max: number): T[] => {
    const count = min + Math.floor(next() * (max - min + 1))
    return [...list].sort(() => next() - 0.5).slice(0, count)
  }
  return { next, pick, some }
}

const NEIGHBORHOODS = [
  'Pinheiros',
  'Vila Madalena',
  'Moema',
  'Centro',
  'Mooca',
  'Tatuapé',
  'Lapa',
  'Butantã',
  'Santana',
  'Itaim Bibi'
]
const SPORTS = ['Futebol', 'Basquete', 'Vôlei', 'Fórmula 1', 'UFC']
const CHAMPIONSHIPS: Record<string, string> = {
  Futebol: 'Brasileirão',
  Basquete: 'NBA',
  Vôlei: 'Superliga',
  'Fórmula 1': 'Fórmula 1',
  UFC: 'UFC'
}
const TEAMS = ['Corinthians', 'Palmeiras', 'São Paulo', 'Santos', 'Flamengo']
const AMENITY_IDS = AMENITIES.map((amenity) => amenity.id)
const STYLES = [
  'Boteco de esquina, cerveja gelada e torcida em pé.',
  'Bar de drinks com poltronas e telão discreto.',
  'Pub com várias TVs e cozinha até tarde.',
  'Bar de família, mesa na calçada e petiscos.',
  'Casa grande de torcida organizada, som alto do jogo.'
]

export type EvalProfile = {
  profile: AffinityProfile
  radiusKm: number
  candidates: RecommendationCandidate[]
  descriptions: Record<string, string>
}

export function syntheticProfiles(count: number, seed: number): EvalProfile[] {
  const r = rng(seed)
  return Array.from({ length: count }, (_, p) => {
    const sports = r.some(SPORTS, 1, 2)
    const profile: AffinityProfile = {
      sports,
      teams: sports.includes('Futebol') ? r.some(TEAMS, 0, 2) : [],
      likedAmenities: r.some(AMENITY_IDS, 2, 4),
      likedNeighborhoods: r.some(NEIGHBORHOODS, 1, 2),
      dislikedAmenities: r.some(AMENITY_IDS, 0, 1)
    }
    const radiusKm = 2 + Math.floor(r.next() * 5)
    const preferredScreens = Math.floor(r.next() * 5)
    const descriptions: Record<string, string> = {}
    const candidates = Array.from(
      { length: 18 + Math.floor(r.next() * 12) },
      (_, c): RecommendationCandidate => {
        const id = `p${p}-bar${c}`
        const sport = r.pick(SPORTS)
        const amenities = r.some(AMENITY_IDS, 2, 7)
        const screenCount = r.next() < 0.2 ? null : Math.floor(r.next() * 7)
        const neighborhood = r.pick(NEIGHBORHOODS)
        const ratingCount = Math.floor(r.next() * 40)
        const recentRatingCount = Math.min(
          ratingCount,
          Math.floor(r.next() * 15)
        )
        const hasEvent = r.next() < 0.7
        descriptions[id] = r.pick(STYLES)
        return {
          id,
          name: `Bar ${c}`,
          neighborhood,
          city: 'São Paulo',
          latitude: '-23.56',
          longitude: '-46.68',
          photoUrl: null,
          amenities,
          screenCount,
          distanceKm: Math.round(r.next() * radiusKm * 1.5 * 100) / 100,
          eventCount: hasEvent ? 1 : 0,
          nextEvent: hasEvent
            ? {
                id: `${id}-e`,
                championship: CHAMPIONSHIPS[sport] ?? sport,
                startsAt: '2026-11-12T22:00:00.000Z',
                sport: { id: sport, name: sport, slug: sport }
              }
            : null,
          sportIds: [sport],
          ratingCount,
          ratingScore: ratingCount >= 5 ? r.next() : null,
          recentRatingCount,
          recentRatingPositive: Math.floor(recentRatingCount * r.next()),
          preferredSportMatch: sports.includes(sport),
          recentSportMatch: r.next() < 0.3,
          recentTeamMatch: r.next() < 0.15,
          hasUpcomingEvent: hasEvent,
          matchedSportName: sports.includes(sport) ? sport : null,
          amenitySimilarity: jaccard(amenities, profile.likedAmenities),
          screenSimilarity:
            screenCount == null
              ? 0
              : Math.max(
                  0,
                  1 -
                    Math.abs(screenCount - preferredScreens) /
                      Math.max(1, preferredScreens)
                ),
          neighborhoodSimilarity: profile.likedNeighborhoods.includes(
            neighborhood
          )
            ? 1
            : 0,
          negativeSimilarity: jaccard(amenities, profile.dislikedAmenities),
          intentActions:
            r.next() < 0.15
              ? [
                  {
                    kind: r.pick([
                      'high_intent',
                      'game_view',
                      'direct_view'
                    ] as const),
                    occurredAt: new Date(
                      NOW.getTime() - Math.floor(r.next() * 30) * 86_400_000
                    )
                  }
                ]
              : []
        }
      }
    )
    return { profile, radiusKm, candidates, descriptions }
  })
}

type Call = (model: string, input: Record<string, unknown>) => Promise<unknown>

/** Tokens de entrada estimados para o teto (por cima: 1 token a cada 3 caracteres). */
const estimateTokens = (input: Record<string, unknown>) =>
  Math.ceil(JSON.stringify(input).length / 3)

/**
 * O modelo dublado: nota pela sobreposição do que o torcedor gosta com o que
 * o bar tem, mais um ruído por modelo (para B e C não saírem iguais), no
 * formato de cada um (Jev dentro de `result`).
 */
function dubla(): Call {
  return async (model, input) => {
    const state = input.state as {
      torcedor: { gosta_de: string[] }
      bares: { bar: string; caracteristicas: string[] }[]
    }
    const liked = new Set(state.torcedor.gosta_de)
    const r = rng(model.length * 7919 + state.bares.length)
    const answers = Object.fromEntries(
      state.bares.map((bar) => {
        const overlap =
          bar.caracteristicas.filter((label) => liked.has(label)).length /
          Math.max(1, liked.size)
        const score = Math.min(
          4,
          Math.max(0, overlap * 4 + (r.next() - 0.5) * 2)
        )
        return [bar.bar, { type: 'score', score }]
      })
    )
    const usage = { input_tokens: estimateTokens(input), output_tokens: 0 }
    return model === RECOMMENDER_MODELS.b
      ? { result: { answers, usage } }
      : { answers, usage }
  }
}

type VariantKey = 'b' | 'c'
type VariantStats = {
  model: RecommenderModel
  profiles: number
  trioChanged: number
  swapped: number[]
  tau: number[]
  ms: number[]
  calls: number
  fallback: number
  error: number
  costUsd: number
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const live = process.argv.includes('--live')
  const maxUsd = Number(arg('max-usd'))
  if (live && !(maxUsd > 0)) {
    console.error('--live exige --max-usd <teto em US$> (ex.: --max-usd 0.05).')
    process.exit(1)
  }
  const profiles = syntheticProfiles(
    Number(arg('profiles') ?? 30),
    Number(arg('seed') ?? 426)
  )

  let raw: Call = dubla()
  let readUsage = (value: unknown) => {
    const usage = (value as { usage?: { input_tokens?: number } }).usage ??
      (value as { result?: { usage?: { input_tokens?: number } } }).result
        ?.usage ?? { input_tokens: 0 }
    return { tokensIn: usage.input_tokens ?? 0, tokensOut: 0 }
  }
  if (live) {
    // Só aqui: o binding e o `run.ts` leem o env do servidor.
    const { getAiBinding, aiGatewayId } = await import('../src/lib/ai/binding')
    const run = await import('../src/lib/ai/run')
    const binding = await getAiBinding()
    if (!binding)
      throw new Error('Sem binding (NODE_ENV=development e CF_ACCOUNT_ID).')
    const gateway = aiGatewayId() ?? 'default'
    raw = (model, input) =>
      binding.run(model, input, {
        gateway: {
          id: gateway,
          metadata: {
            run_id: `recommender-eval-${crypto.randomUUID()}`,
            variant: model === RECOMMENDER_MODELS.b ? 'b' : 'c',
            feature: 'recommender'
          }
        }
      })
    readUsage = (value) => run.readUsage(value as never)
  }

  let spent = 0
  let exhausted = false
  const stats = (key: VariantKey): VariantStats => ({
    model: RECOMMENDER_MODELS[key],
    profiles: 0,
    trioChanged: 0,
    swapped: [],
    tau: [],
    ms: [],
    calls: 0,
    fallback: 0,
    error: 0,
    costUsd: 0
  })
  const variants: Record<VariantKey, VariantStats> = {
    b: stats('b'),
    c: stats('c')
  }
  const panel: unknown[] = []

  for (const [index, item] of profiles.entries()) {
    const context = { now: NOW, radiusKm: item.radiusKm }
    const control = rankRecommendations(item.candidates, context, 5)
    const controlTrio = control.slice(0, TRIO).map((r) => r.bar.id)
    const pool = affinityCandidates(item.candidates, context)
    const bars = pool.map((candidate) => ({
      candidate,
      description: item.descriptions[candidate.id]
    }))
    const describe = (id: string) => {
      const bar = item.candidates.find((candidate) => candidate.id === id)
      return bar
        ? `${bar.neighborhood}, ${bar.distanceKm} km, ${bar.nextEvent?.sport.name ?? 'sem jogo'}: ${item.descriptions[id]}`
        : id
    }
    const row: Record<string, unknown> = {
      perfil: index + 1,
      torcedor: item.profile,
      A: controlTrio.map(describe)
    }

    for (const key of ['b', 'c'] as const) {
      const stats = variants[key]
      const call: Call = async (model, input) => {
        const estimate = costUsd(model, {
          tokensIn: estimateTokens(input),
          tokensOut: 0
        })
        if (live && spent + estimate > maxUsd) {
          exhausted = true
          throw new Error('teto do script')
        }
        const started = performance.now()
        const value = await raw(model, input)
        stats.ms.push(performance.now() - started)
        const cost = costUsd(model, readUsage(value))
        spent += cost
        stats.costUsd += cost
        return value
      }
      const result = await requestAffinity(
        call,
        stats.model,
        item.profile,
        bars
      )
      if (exhausted) break
      stats.profiles++
      stats.calls += result.calls
      if (result.status === 'fallback') stats.fallback++
      if (result.status === 'error') stats.error++
      const variant = rankRecommendations(
        item.candidates,
        { ...context, affinity: result.affinity ?? undefined },
        5
      )
      const trio = variant.slice(0, TRIO).map((r) => r.bar.id)
      const swapped = swappedCards(controlTrio, trio)
      if (swapped > 0) stats.trioChanged++
      stats.swapped.push(swapped)
      const scores = (affinity?: Map<string, number> | null) =>
        pool.map(
          (candidate) =>
            scoreRecommendationCandidate(candidate, {
              ...context,
              affinity: affinity ?? undefined
            }).score
        )
      stats.tau.push(
        kendallTau(scores(), scores(result.affinity as Map<string, number>))
      )
      row[key.toUpperCase()] = trio.map(describe)
    }
    if (exhausted) {
      console.error(
        `Parou no perfil ${index + 1}: a próxima chamada passaria de US$ ${maxUsd}.`
      )
      break
    }
    panel.push(row)
  }

  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length
  const summary = (['b', 'c'] as const).map((key) => {
    const s = variants[key]
    const changed = s.profiles === 0 ? 0 : s.trioChanged / s.profiles
    return {
      variante: key.toUpperCase(),
      modelo: s.model,
      perfis: s.profiles,
      trio_muda_pct: Math.round(changed * 1000) / 10,
      cards_trocados_media: Math.round(mean(s.swapped) * 100) / 100,
      kendall_tau_media: Math.round(mean(s.tau) * 1000) / 1000,
      chamadas: s.calls,
      desvios: s.fallback,
      quedas_no_controle: s.error,
      ms_p50: Math.round(percentile(s.ms, 0.5)),
      ms_p95: Math.round(percentile(s.ms, 0.95)),
      custo_usd: Number(s.costUsd.toFixed(6)),
      usd_por_mil_rodadas:
        s.profiles === 0
          ? 0
          : Number(((s.costUsd / s.profiles) * 1000).toFixed(4)),
      passa_no_criterio_20pct: changed >= 0.2
    }
  })

  console.log(
    live
      ? `Modelo de verdade, teto US$ ${maxUsd}, gasto US$ ${spent.toFixed(6)}.`
      : 'Modelo DUBLADO: tempos e custo não valem; rode com --live para medir.'
  )
  console.table(summary)
  const out = arg('out')
  if (out) {
    writeFileSync(
      out,
      JSON.stringify(
        { live, seed: Number(arg('seed') ?? 426), summary, perfis: panel },
        null,
        2
      )
    )
    console.log(`JSON em ${out}`)
  }
}

if (import.meta.main) {
  await main()
  process.exit(0)
}
