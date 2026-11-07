/**
 * Protótipo do WEB-433: jogos da semana com onde passa, fora do app.
 *
 *   bun packages/api/scripts/weekly-games-prototype/run.ts [exa|linkup] [AAAA-MM-DD]
 *
 * Web Search da Cloudflare (Exa ou Linkup) → Browser Rendering `/markdown` →
 * GPT-6 Luna, tudo pelo AI Gateway `onside-preview` com o token do login do
 * wrangler (o mesmo caminho de `lib/ai/binding.ts` em desenvolvimento).
 *
 * Não abre banco nenhum: não importa `env` nem `db`. Tudo o que gasta vai para
 * `resultados/ledger.json`, somado entre execuções; antes de cada chamada o script
 * confere que o pior caso dela cabe em `BUDGET_USD` e para se não couber.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRobots, robotsAllows } from './robots'

const BUDGET_USD = 1.0
const ACCOUNT = process.env.CF_ACCOUNT_ID ?? 'dc48dae1d364480e5b618e4a00e98565'
const GATEWAY = process.env.AI_GATEWAY_ID ?? 'onside-preview'
const MODEL = 'openai/gpt-6-luna'
/** US$ por milhão, de `lib/ai/models.ts`. */
const LUNA = { in: 0.1, out: 0.5 }
/** US$ por busca: Exa 7/1.000, Linkup 5/1.000 (developers.cloudflare.com/web-search/providers). */
const SEARCH_USD = { exa: 0.007, linkup: 0.005 } as const
/** Corte do markdown de uma página (~12 mil tokens). */
const MAX_PAGE_CHARS = 40_000
const MAX_OUT_TOKENS = 3000
const PAGES_PER_COMPETITION = 2
const MAX_FOLLOWUPS = 12

type Provider = keyof typeof SEARCH_USD
const provider = (process.argv[2] ?? 'exa') as Provider
if (!(provider in SEARCH_USD)) throw new Error(`provedor? ${provider}`)
const start = process.argv[3] ?? '2026-11-07'

const OUT = join(import.meta.dir, 'resultados')
mkdirSync(OUT, { recursive: true })
const LEDGER = join(OUT, 'ledger.json')

type Ledger = {
  totalUsd: number
  runs: { at: string; label: string; usd: number }[]
}
const ledger: Ledger = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { totalUsd: 0, runs: [] }

const stats = {
  searches: 0,
  pages: 0,
  pagesSkipped: [] as { url: string; why: string }[],
  browserMs: 0,
  lunaCalls: 0,
  tokensIn: 0,
  tokensOut: 0,
  searchUsd: 0,
  lunaUsd: 0
}
const runUsd = () => stats.searchUsd + stats.lunaUsd

function spend(usd: number, label: string) {
  ledger.totalUsd += usd
  ledger.runs.push({ at: new Date().toISOString(), label, usd })
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 2))
}

class BudgetStop extends Error {}
function guard(worstUsd: number) {
  if (ledger.totalUsd + worstUsd > BUDGET_USD)
    throw new BudgetStop(
      `teto: gasto ${ledger.totalUsd.toFixed(4)} + ${worstUsd.toFixed(4)} passaria de ${BUDGET_USD}`
    )
}

let token = ''
function apiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  if (!token)
    token =
      execFileSync('bunx', ['wrangler', 'auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      })
        .trim()
        .split('\n')
        .at(-1) ?? ''
  return token
}

const BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`

async function cf(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken()}`,
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || json.success === false)
    throw new Error(
      `${path} ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 300)}`
    )
  return { json, headers: res.headers }
}

type Hit = { url: string; title: string; description: string }

/**
 * Cache em `resultados/cache` (fora do git): repetir a execução para ajustar o prompt
 * não paga a busca de novo. A medição final roda com a pasta vazia.
 */
const CACHE = join(OUT, 'cache')
mkdirSync(CACHE, { recursive: true })
const cachePath = (kind: string, id: string) =>
  join(CACHE, `${kind}-${Bun.hash(id).toString(36)}.txt`)
const cached = (kind: string, id: string) => {
  const p = cachePath(kind, id)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

async function search(query: string): Promise<Hit[]> {
  const hit = cached(`search-${provider}`, query)
  if (hit) return JSON.parse(hit)
  guard(SEARCH_USD[provider])
  const { json } = await cf('/ai/websearch/', {
    query,
    provider,
    limit: 8,
    options: { gateway: { id: GATEWAY } }
  })
  stats.searches++
  stats.searchUsd += SEARCH_USD[provider]
  spend(SEARCH_USD[provider], `${provider} search`)
  const items =
    (json.result as { items?: Hit[] })?.items ??
    (json as { items?: Hit[] }).items ??
    []
  writeFileSync(cachePath(`search-${provider}`, query), JSON.stringify(items))
  return items
}

/**
 * robots.txt do grupo `User-agent: *` (o Browser Rendering não tem nome
 * próprio): `Allow`/`Disallow` com `*` e `$`, a regra mais longa vence. Também
 * o `Content-Signal` da Cloudflare: `ai-input=no` (pôr a página num modelo) pula.
 */
const robotsCache = new Map<string, ReturnType<typeof parseRobots>>()
async function allowed(url: string) {
  const u = new URL(url)
  let robots = robotsCache.get(u.host)
  if (!robots) {
    let txt = ''
    try {
      const res = await fetch(`${u.origin}/robots.txt`, {
        signal: AbortSignal.timeout(8000)
      })
      if (res.ok) txt = await res.text()
    } catch {}
    robots = parseRobots(txt)
    robotsCache.set(u.host, robots)
  }
  return robotsAllows(robots, u.pathname + u.search)
}

async function read(url: string): Promise<string | null> {
  if (/\.pdf($|\?)/i.test(url)) {
    stats.pagesSkipped.push({ url, why: 'pdf' })
    return null
  }
  if (!(await allowed(url))) {
    stats.pagesSkipped.push({ url, why: 'robots.txt' })
    return null
  }
  const hit = cached('page', url)
  if (hit !== null) return hit || null
  try {
    const { json, headers } = await cf('/browser-rendering/markdown', {
      url,
      gotoOptions: { waitUntil: 'networkidle2', timeout: 30000 },
      rejectResourceTypes: ['image', 'media', 'font']
    })
    stats.pages++
    stats.browserMs += Number(headers.get('x-browser-ms-used') ?? 0)
    const md = String(json.result ?? '')
    writeFileSync(cachePath('page', url), md.slice(0, MAX_PAGE_CHARS))
    return md.slice(0, MAX_PAGE_CHARS) || null
  } catch (error) {
    stats.pagesSkipped.push({
      url,
      why: (error as Error).message.slice(0, 120)
    })
    return null
  }
}

type Game = {
  jogo: string
  campeonato: string
  data: string
  hora: string | null
  canais: string[]
  fonte: string
  /** Outra fonte que deu outros canais para o mesmo jogo (sinal de dúvida). */
  outras?: { canais: string[]; fonte: string }[]
}

async function extract(
  page: string,
  url: string,
  competition: string,
  days: string[]
): Promise<Game[]> {
  const system = `Você extrai fatos de páginas sobre futebol. Responda só JSON: {"jogos":[{"jogo":"Mandante x Visitante","campeonato":"...","data":"AAAA-MM-DD","hora":"HH:MM" ou null,"canais":["..."]}]}.
Hoje é ${new Date().toISOString().slice(0, 10)}. Regras: só jogos de ${competition} entre ${days[0]} e ${days.at(-1)}, com a data (dia e mês) escrita na página para aquele jogo; jogo de outro mês ou ano, ou sem data na página, fica de fora. Hora de Brasília; canais de TV ou streaming no Brasil, nomes curtos (Globo, SporTV, Premiere, ESPN, Disney+, Prime Video, CazéTV, Paramount+, Record, SBT, YouTube...). Canal que a página não diz para aquele jogo: lista vazia. Não invente. Página sem nenhum jogo do período: {"jogos":[]}.`
  const user = `Fonte: ${url}\n\n${page}`
  const estIn = Math.ceil((system.length + user.length) / 3)
  guard((estIn * LUNA.in + MAX_OUT_TOKENS * LUNA.out) / 1e6)
  const { json } = await cf(
    '/ai/v1/chat/completions',
    {
      model: MODEL,
      reasoning_effort: 'none',
      max_completion_tokens: MAX_OUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    },
    {
      'cf-aig-gateway-id': GATEWAY,
      'cf-aig-metadata': JSON.stringify({
        feature: 'weekly_games_prototype',
        variant: 'proto'
      })
    }
  )
  const r = (json.result ?? json) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  const tin = r.usage?.prompt_tokens ?? estIn
  const tout = r.usage?.completion_tokens ?? 0
  const usd = (tin * LUNA.in + tout * LUNA.out) / 1e6
  stats.lunaCalls++
  stats.tokensIn += tin
  stats.tokensOut += tout
  stats.lunaUsd += usd
  spend(usd, 'luna')
  try {
    const parsed = JSON.parse(r.choices?.[0]?.message?.content ?? '{}') as {
      jogos?: Omit<Game, 'fonte'>[]
    }
    return (parsed.jogos ?? [])
      .filter((g) => days.includes(g.data))
      .map((g) => ({ ...g, canais: g.canais ?? [], fonte: url }))
  } catch {
    return []
  }
}

/** Mesmo jogo em fontes diferentes: chave pelos nomes sem acento e data. */
function key(g: Pick<Game, 'jogo' | 'data'>) {
  const teams = g.jogo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+(?:x|×|vs\.?)\s+/)
    .map((t) =>
      t
        .split(/[^a-z]+/)
        .filter((w) => w.length > 2)
        .join('')
        .slice(0, 5)
    )
    .sort()
  return `${g.data}|${teams.join('-')}`
}

function merge(into: Map<string, Game>, games: Game[]) {
  for (const g of games) {
    const k = key(g)
    const prev = into.get(k)
    if (!prev) into.set(k, { ...g })
    else {
      prev.hora ??= g.hora
      if (!prev.canais.length && g.canais.length) {
        // A fonte que tem canal vale para o jogo inteiro: misturar a hora de
        // uma com o canal da outra atribuía à fonte uma hora que ela não deu.
        prev.canais = g.canais
        prev.fonte = g.fonte
        prev.hora = g.hora ?? prev.hora
      } else if (g.canais.length && g.canais.join() !== prev.canais.join())
        prev.outras = [
          ...(prev.outras ?? []),
          { canais: g.canais, fonte: g.fonte }
        ]
    }
  }
}

const days = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + i)
  return d.toISOString().slice(0, 10)
})
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const range = `${br(start)} a ${br(days[6] ?? start)}`

const COMPETITIONS = process.argv[4]?.split(',') ?? [
  'Brasileirão Série A',
  'Libertadores',
  'Copa do Brasil',
  'Copa Sul-Americana',
  'Brasileirão Série B',
  'Premier League'
]

const t0 = performance.now()
const catalog = new Map<string, Game>()
const log: { etapa: string; query?: string; urls: string[]; jogos: number }[] =
  []
let stopped: string | null = null

try {
  for (const comp of COMPETITIONS) {
    const query = `${comp} jogos desta semana onde assistir ${range} 2026`
    const hits = await search(query)
    const used: string[] = []
    let found = 0
    for (const hit of hits) {
      if (used.length >= PAGES_PER_COMPETITION) break
      const md = await read(hit.url)
      if (!md) continue
      used.push(hit.url)
      const games = await extract(md, hit.url, comp, days)
      found += games.length
      merge(catalog, games)
    }
    log.push({ etapa: 'campeonato', query, urls: used, jogos: found })
  }

  const missing = [...catalog.values()]
    .filter((g) => !g.canais.length)
    .slice(0, MAX_FOLLOWUPS)
  for (const g of missing) {
    const query = `${g.jogo} ${br(g.data)} onde assistir ao vivo`
    const hits = await search(query)
    const used: string[] = []
    for (const hit of hits) {
      if (used.length >= 1) break
      const md = await read(hit.url)
      if (!md) continue
      used.push(hit.url)
      const games = await extract(md, hit.url, g.campeonato, [g.data])
      const same = games.find((x) => key(x) === key(g))
      if (same?.canais.length) {
        g.canais = same.canais
        g.fonte = same.fonte
        g.hora ??= same.hora
      }
    }
    log.push({
      etapa: 'sem canal',
      query,
      urls: used,
      jogos: g.canais.length ? 1 : 0
    })
  }
} catch (error) {
  if (!(error instanceof BudgetStop)) throw error
  stopped = error.message
}

const games = [...catalog.values()].sort((a, b) =>
  `${a.data} ${a.hora ?? '99'}`.localeCompare(`${b.data} ${b.hora ?? '99'}`)
)
const seconds = Math.round((performance.now() - t0) / 100) / 10
const report = {
  provider,
  semana: days,
  buscas: stats.searches,
  paginas: stats.pages,
  paginasPuladas: stats.pagesSkipped,
  browserMs: stats.browserMs,
  chamadasLuna: stats.lunaCalls,
  tokensIn: stats.tokensIn,
  tokensOut: stats.tokensOut,
  custoBuscasUsd: +stats.searchUsd.toFixed(4),
  custoLunaUsd: +stats.lunaUsd.toFixed(5),
  custoTotalUsd: +runUsd().toFixed(4),
  acumuladoUsd: +ledger.totalUsd.toFixed(4),
  segundos: seconds,
  jogos: games.length,
  semCanal: games.filter((g) => !g.canais.length).length,
  parouNoTeto: stopped,
  log
}

const tag = `${provider}-${start}`
writeFileSync(
  join(OUT, `${tag}.json`),
  JSON.stringify({ report, games }, null, 2)
)
const md = [
  `| Data | Hora | Jogo | Campeonato | Onde passa | Fonte |`,
  `| -- | -- | -- | -- | -- | -- |`,
  ...games.map(
    (g) =>
      `| ${br(g.data)} | ${g.hora ?? '?'} | ${g.jogo} | ${g.campeonato} | ${g.canais.join(' · ') || '—'} | ${new URL(g.fonte).host} |`
  )
].join('\n')
writeFileSync(join(OUT, `${tag}.md`), `${md}\n`)
console.log(md)
console.log(JSON.stringify({ ...report, log: undefined }, null, 2))
