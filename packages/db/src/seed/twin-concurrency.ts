/**
 * Rampa de concorrência contra o gêmeo Neon, sem passar pela Vercel.
 *
 * O k6 local mede a aplicação inteira num processo quente com Postgres na
 * mesma máquina. Isso não diz nada sobre o compute contratado no Neon, que é
 * o teto real. Este driver ataca só o banco, pelo endpoint pooler, com a
 * mesma query que `pubs.search` emite — é o atalho que a própria Vercel
 * recomenda para separar gargalo de banco de gargalo de função.
 *
 * Recusa qualquer alvo que não seja um projeto Neon dedicado a carga: nunca
 * aponte para o banco que serve usuários.
 *
 *   TWIN_DATABASE_URL=postgres://... \
 *   TWIN_CONFIRM=findsports-loadtest \
 *   bun run src/seed/twin-concurrency.ts --levels 25,50,100 --seconds 45
 */
import { Pool } from 'pg'

const connectionString = process.env.TWIN_DATABASE_URL
if (!connectionString) {
  throw new Error('TWIN_DATABASE_URL é obrigatório')
}
if (process.env.TWIN_CONFIRM !== 'findsports-loadtest') {
  throw new Error(
    'Recusando rodar sem TWIN_CONFIRM=findsports-loadtest. ' +
      'Esta rampa só pode apontar para o projeto Neon descartável de carga.'
  )
}

const target = new URL(connectionString)
if (!/\.neon\.tech$/.test(target.hostname)) {
  throw new Error(`Alvo não é Neon: ${target.hostname}`)
}

function readList(flag: string, fallback: number[]): number[] {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  return (process.argv[index + 1] ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function readNumber(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag)
  if (index === -1) return fallback
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

const levels = readList('--levels', [25, 50, 100, 175, 250])
const seconds = readNumber('--seconds', 45)

/**
 * Mesma forma da query do router: camadas por plano, cada uma com o seu
 * LIMIT, e só as 20 linhas finais recebem COUNT/detalhe/participantes.
 */
const SEARCH_SQL = `
WITH ranked AS MATERIALIZED (
  SELECT * FROM (
    ${['elite', 'pro', 'starter']
      .map(
        (plan, index) => `(
      SELECT
        ${index + 1}::int AS cursor_plan_rank,
        b.id, b.name, b.neighborhood, b.city, b.latitude, b.longitude,
        b.photo_url, b.created_at, b.plan,
        ST_Distance(b.geo, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distance_km,
        to_char(agg.next_event_at, 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_next_event_at
      FROM bar b
      JOIN LATERAL (
        SELECT MIN(e.starts_at) AS next_event_at
        FROM event e
        WHERE e.bar_id = b.id AND e.starts_at >= NOW()
      ) agg ON agg.next_event_at IS NOT NULL
      WHERE b.is_active
        AND b.plan = '${plan}'
        AND ST_DWithin(b.geo, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
      ORDER BY agg.next_event_at ASC, distance_km ASC, b.id ASC
      LIMIT 20
    )`
      )
      .join(' UNION ALL ')}
  ) tiers
  LIMIT 20
)
SELECT r.*, cnt.event_count, nxt.next_event_id, nxt.next_championship,
       nxt.next_event_starts_at, nxt.next_sport_name, nxt.next_sport_slug,
       nxt.next_participant_free_text,
       COALESCE(parts.next_participants, '[]'::json) AS next_participants
FROM ranked r
JOIN LATERAL (
  SELECT COUNT(*)::int AS event_count FROM event e
  WHERE e.bar_id = r.id AND e.starts_at >= NOW()
) cnt ON true
LEFT JOIN LATERAL (
  SELECT e.id AS next_event_id, e.championship AS next_championship,
         e.starts_at AS next_event_starts_at, s.name AS next_sport_name,
         s.slug AS next_sport_slug,
         e.participant_free_text AS next_participant_free_text
  FROM event e JOIN sport s ON s.id = e.sport_id
  WHERE e.bar_id = r.id AND e.starts_at >= NOW()
  ORDER BY e.starts_at ASC LIMIT 1
) nxt ON true
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('name', t.name, 'logoUrl', t.logo_url)) AS next_participants
  FROM event_participants ep JOIN team t ON t.id = ep.team_id
  WHERE ep.event_id = nxt.next_event_id
) parts ON true
`

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const position = Math.min(
    sorted.length - 1,
    Math.floor(fraction * sorted.length)
  )
  return sorted[position] ?? 0
}

type LevelResult = {
  concurrency: number
  requests: number
  errors: number
  rps: number
  p50: number
  p95: number
  p99: number
  max: number
}

async function runLevel(concurrency: number): Promise<LevelResult> {
  // Pool do tamanho da concorrência: o objetivo é medir o compute do Neon
  // sob N buscas simultâneas, não a fila de um pool artificialmente pequeno.
  const pool = new Pool({ connectionString, max: concurrency })
  const durations: number[] = []
  let errors = 0

  // Aquecimento: acorda o compute e deixa o autoscaling reagir antes de
  // qualquer amostra entrar na conta.
  try {
    await pool.query('SELECT 1')
  } catch {
    errors++
  }

  const deadline = Date.now() + seconds * 1000
  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() < deadline) {
      // Jitter dentro da caixa de bares, para não medir sempre a mesma
      // célula quente do cache do Postgres.
      const lng = -46.63 + (Math.random() - 0.5) * 0.05
      const lat = -23.55 + (Math.random() - 0.5) * 0.05
      const startedAt = performance.now()
      try {
        await pool.query(SEARCH_SQL, [lng, lat, 3000])
        durations.push(performance.now() - startedAt)
      } catch {
        errors++
      }
      // Pausa humana, igual à do k6 (0,5–1,5 s entre ações).
      await new Promise((resolve) =>
        setTimeout(resolve, 500 + Math.random() * 1000)
      )
    }
  })

  await Promise.all(workers)
  await pool.end()

  durations.sort((a, b) => a - b)
  return {
    concurrency,
    requests: durations.length,
    errors,
    rps: Number((durations.length / seconds).toFixed(1)),
    p50: Number(percentile(durations, 0.5).toFixed(1)),
    p95: Number(percentile(durations, 0.95).toFixed(1)),
    p99: Number(percentile(durations, 0.99).toFixed(1)),
    max: Number((durations[durations.length - 1] ?? 0).toFixed(1))
  }
}

const results: LevelResult[] = []
for (const concurrency of levels) {
  const result = await runLevel(concurrency)
  results.push(result)
  console.log(JSON.stringify(result))
  // Aborta na primeira reprovação do SLO, para não queimar CU-h medindo
  // patamares que já não interessam.
  const failureRate = result.errors / Math.max(1, result.requests)
  if (result.p95 > 300 || failureRate > 0.01) {
    console.log(
      JSON.stringify({ abortadoEm: concurrency, motivo: 'SLO reprovado' })
    )
    break
  }
}

console.log(JSON.stringify({ resumo: results }, null, 2))
process.exit(0)
