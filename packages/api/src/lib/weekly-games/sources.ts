import { fold } from '@findsports_oficial/db/catalog/fold'
import { hourInPage } from './merge'
import { parseRobots, robotsAllows } from './robots'

/*
 * As fontes dos jogos da semana (WEB-433), pela rede:
 * - calendário do football-data.org (plano grátis, `X-Auth-Token`), para as
 *   ligas que ele cobre: data e hora certas, sem canal;
 * - Web Search da Cloudflare (provedor Exa, decisão do dono) pelo AI Gateway;
 * - Browser Rendering `/markdown` da página, depois do robots.txt;
 * - a extração com o GPT-6 Luna, que chega pronta em `call` (`runAi`).
 *
 * Preços medidos no protótipo (`docs/web-433-prototipo.md`). A Jolpica não
 * entra: a licença dela é não comercial.
 */

/** US$ por busca da Exa (developers.cloudflare.com/web-search/providers). */
export const SEARCH_USD = 0.007
/** Browser Rendering além das 10 h do Workers Paid: US$ 0,09 por hora. */
export const BROWSER_USD_PER_MS = 0.09 / 3_600_000
/** Pior caso de uma leitura de página, para o teto conferir antes. */
export const BROWSER_WORST_USD = 60_000 * BROWSER_USD_PER_MS
export const EXTRACTION_MODEL = 'openai/gpt-6-luna'
/** Corte do markdown de uma página (~12 mil tokens). */
export const MAX_PAGE_CHARS = 40_000
export const MAX_OUT_TOKENS = 3000

export type Cloudflare = { accountId: string; token: string; gatewayId: string }
export type Hit = { url: string; title?: string; description?: string }

async function cfPost(cf: Cloudflare, path: string, body: unknown) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}${path}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cf.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000)
    }
  )
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok || json.success === false)
    throw new Error(
      `${path} ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 200)}`
    )
  return { json, headers: res.headers }
}

export async function webSearch(cf: Cloudflare, query: string): Promise<Hit[]> {
  const { json } = await cfPost(cf, '/ai/websearch/', {
    query,
    provider: 'exa',
    limit: 8,
    options: { gateway: { id: cf.gatewayId } }
  })
  return (
    (json.result as { items?: Hit[] } | undefined)?.items ??
    (json as { items?: Hit[] }).items ??
    []
  )
}

const robotsCache = new Map<string, ReturnType<typeof parseRobots>>()

async function allowedByRobots(url: URL) {
  let robots = robotsCache.get(url.host)
  if (!robots) {
    let txt = ''
    try {
      const res = await fetch(`${url.origin}/robots.txt`, {
        signal: AbortSignal.timeout(8000)
      })
      if (res.ok) txt = await res.text()
    } catch {}
    robots = parseRobots(txt)
    robotsCache.set(url.host, robots)
  }
  return robotsAllows(robots, url.pathname + url.search)
}

export type PageRead =
  | { ok: true; markdown: string; browserMs: number }
  | { ok: false; why: string }

/** Markdown da página, cortado; PDF e página que o robots.txt fecha ficam de fora. */
export async function readPage(cf: Cloudflare, url: string): Promise<PageRead> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, why: 'url' }
  }
  if (/\.pdf($|\?)/i.test(parsed.pathname)) return { ok: false, why: 'pdf' }
  if (!(await allowedByRobots(parsed))) return { ok: false, why: 'robots.txt' }
  try {
    const { json, headers } = await cfPost(cf, '/browser-rendering/markdown', {
      url,
      gotoOptions: { waitUntil: 'networkidle2', timeout: 30_000 },
      rejectResourceTypes: ['image', 'media', 'font']
    })
    const markdown = String(json.result ?? '').slice(0, MAX_PAGE_CHARS)
    const browserMs = Number(headers.get('x-browser-ms-used') ?? 0)
    return markdown
      ? { ok: true, markdown, browserMs }
      : { ok: false, why: 'vazia' }
  } catch (error) {
    return { ok: false, why: (error as Error).message.slice(0, 120) }
  }
}

export type Extracted = {
  name: string
  day: string
  time: string
  channels: string[]
}

/** O pedido ao modelo: só JSON, só o período, canal vazio quando a página não diz. */
export function extractionInput(
  page: string,
  url: string,
  championship: string,
  days: readonly string[],
  today: string
) {
  const system = `Você extrai fatos de páginas sobre esporte. Responda só JSON: {"jogos":[{"jogo":"Mandante x Visitante" (ou o nome do evento quando não é confronto),"data":"AAAA-MM-DD","hora":"HH:MM" ou null,"canais":["..."]}]}.
Hoje é ${today}. Regras: só jogos de ${championship} entre ${days[0]} e ${days.at(-1)}, com a data (dia e mês) escrita na página para aquele jogo; jogo de outro mês ou ano, ou sem data na página, fica de fora. Hora de Brasília, como a página escreve; se a página não diz que é de Brasília e é de outro país, hora null. Canais de TV ou streaming no Brasil, nomes curtos (Globo, SporTV, Premiere, ESPN, Disney+, Prime Video, CazéTV, Paramount+, Record, SBT, GE TV...). Canal que a página não diz para aquele jogo: lista vazia. Não invente. Página sem nenhum jogo do período: {"jogos":[]}.`
  const user = `Fonte: ${url}\n\n${page}`
  return {
    input: {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      reasoning_effort: 'none',
      temperature: 0,
      max_completion_tokens: MAX_OUT_TOKENS,
      response_format: { type: 'json_object' }
    },
    /** Tokens de entrada estimados (3 caracteres por token), para o teto. */
    estimatedTokensIn: Math.ceil((system.length + user.length) / 3)
  }
}

type Raw = {
  choices?: { message?: { content?: string | null } }[]
  result?: { choices?: { message?: { content?: string | null } }[] }
}

/**
 * Os jogos da resposta, só os do período e com hora escrita na página
 * (`hourInPage`). Resposta que não é JSON vira lista vazia.
 */
export function parseExtraction(
  raw: unknown,
  page: string,
  days: readonly string[]
): Extracted[] {
  const r = raw as Raw
  const content =
    r?.choices?.[0]?.message?.content ??
    r?.result?.choices?.[0]?.message?.content ??
    '{}'
  let jogos: unknown
  try {
    jogos = (JSON.parse(content) as { jogos?: unknown }).jogos
  } catch {
    return []
  }
  if (!Array.isArray(jogos)) return []
  return jogos.flatMap((g: Record<string, unknown>) => {
    const name = typeof g.jogo === 'string' ? g.jogo.trim() : ''
    const day = typeof g.data === 'string' ? g.data : ''
    const time = typeof g.hora === 'string' ? g.hora.trim() : ''
    if (!name || !days.includes(day) || !time || !hourInPage(page, time))
      return []
    const channels = Array.isArray(g.canais)
      ? g.canais.filter((c): c is string => typeof c === 'string')
      : []
    return [{ name, day, time, channels }]
  })
}

/**
 * Campeonatos que o plano grátis do football-data.org cobre, com os nomes que
 * os bares escrevem (sem acento). O campeonato entra quando um nome do escopo
 * contém um dos apelidos.
 */
const FOOTBALL_DATA_COMPETITIONS: Record<string, string[]> = {
  BSA: ['brasileirao', 'campeonato brasileiro', 'serie a do brasil'],
  PL: ['premier league'],
  PD: ['la liga', 'laliga', 'campeonato espanhol'],
  SA: ['serie a italiana', 'campeonato italiano', 'calcio'],
  BL1: ['bundesliga'],
  FL1: ['ligue 1', 'campeonato frances'],
  CL: ['champions league', 'liga dos campeoes'],
  PPL: ['primeira liga', 'liga portugal', 'campeonato portugues'],
  DED: ['eredivisie'],
  WC: ['copa do mundo'],
  EC: ['eurocopa', 'euro 20']
}

/** Código do football-data → o campeonato do escopo que ele cobre. */
export function footballDataCodes(championships: readonly string[]) {
  const codes = new Map<string, string>()
  for (const championship of championships) {
    const name = fold(championship)
    // "Brasileirão Série B" não é a Série A que o football-data tem.
    if (/serie [bcd]\b/.test(name)) continue
    for (const [code, aliases] of Object.entries(FOOTBALL_DATA_COMPETITIONS))
      if (!codes.has(code) && aliases.some((alias) => name.includes(alias)))
        codes.set(code, championship)
  }
  return codes
}

export type Fixture = {
  code: string
  startsAt: Date
  home: string
  away: string
}

type FootballDataMatch = {
  utcDate?: string
  status?: string
  competition?: { code?: string }
  homeTeam?: { name?: string | null; shortName?: string | null }
  awayTeam?: { name?: string | null; shortName?: string | null }
}

/** Nome do time sem o sufixo de clube ("Manchester United FC"). */
const teamName = (team: FootballDataMatch['homeTeam']) =>
  (team?.name ?? team?.shortName ?? '')
    .replace(/\s+(FC|AFC|CF|SC|EC|FR)$/i, '')
    .trim()

/**
 * Os jogos da semana nas ligas pedidas, numa chamada só (o plano grátis
 * aceita até 10 dias e 10 chamadas por minuto). Adiado e cancelado saem.
 */
export async function footballDataFixtures(
  apiKey: string,
  from: string,
  to: string,
  codes: readonly string[]
): Promise<Fixture[]> {
  if (!codes.length) return []
  const url = new URL('https://api.football-data.org/v4/matches')
  url.searchParams.set('dateFrom', from)
  url.searchParams.set('dateTo', to)
  url.searchParams.set('competitions', codes.join(','))
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': apiKey },
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`football-data ${res.status}`)
  const json = (await res.json()) as { matches?: FootballDataMatch[] }
  return (json.matches ?? []).flatMap((m) => {
    if (!m.utcDate || m.status === 'POSTPONED' || m.status === 'CANCELLED')
      return []
    const home = teamName(m.homeTeam)
    const away = teamName(m.awayTeam)
    const startsAt = new Date(m.utcDate)
    if (!home || !away || Number.isNaN(startsAt.getTime())) return []
    return [{ code: m.competition?.code ?? '', startsAt, home, away }]
  })
}
