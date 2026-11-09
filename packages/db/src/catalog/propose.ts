import {
  CATALOG_SPORTS,
  type CatalogEntry,
  type CatalogSport,
  fold,
  readCatalog,
  writeCatalog
} from './catalog'

/*
 * WEB-381: `bun run catalog:propose [esporte…]` consulta as fontes e acrescenta
 * ao arquivo do esporte o que ainda não está nele. O que já está fica como foi
 * revisado (nome, tipo, destaque); só relevância e apelidos são atualizados.
 * Nada sai do arquivo sozinho: o que a fonte deixou de trazer é listado para
 * alguém decidir no PR.
 *
 * Vôlei e NBB não têm fonte boa na Wikidata e são só à mão (`manual:`).
 */

const USER_AGENT =
  'OnsideCatalog/1.0 (https://www.onside.sh; contato@onside.sh)'
const MAX_ALIASES = 20

type Proposal = Omit<CatalogEntry, 'featured' | 'hidden'>
type Row = Record<string, string | undefined>

async function sparql(query: string): Promise<Row[]> {
  const url = `https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    throw new Error(`Wikidata respondeu ${response.status} para:\n${query}`)
  }
  const body = (await response.json()) as {
    results: { bindings: Record<string, { value: string }>[] }
  }
  return body.results.bindings.map((binding) =>
    Object.fromEntries(
      Object.entries(binding).map(([name, { value }]) => [
        name,
        value.replace('http://www.wikidata.org/entity/', '')
      ])
    )
  )
}

/**
 * Uma linha por item (a consulta pode repetir o item, um por país), com nome
 * em português, em inglês e apelidos em português. Os apelidos vêm numa
 * consulta à parte: juntos na primeira, as linhas se multiplicam e a Wikidata
 * estoura o tempo.
 */
async function byItem(rows: Row[]) {
  const items = new Map<string, { row: Row; aliases: Set<string> }>()
  for (const row of rows) {
    const key = row.item
    if (!key || items.has(key)) continue
    const aliases = new Set<string>()
    for (const name of [row.pt, row.en]) if (name) aliases.add(name)
    items.set(key, { row, aliases })
  }
  const keys = [...items.keys()]
  for (let start = 0; start < keys.length; start += 200) {
    const chunk = keys.slice(start, start + 200)
    const aliases = await sparql(`
      SELECT ?item ?alias WHERE {
        VALUES ?item { ${chunk.map((key) => `wd:${key}`).join(' ')} }
        ?item skos:altLabel ?alias FILTER(lang(?alias) = "pt" || lang(?alias) = "pt-br")
      }`)
    for (const { item, alias } of aliases) {
      if (item && alias) items.get(item)?.aliases.add(alias)
    }
  }
  return [...items.entries()]
}

/**
 * Nome em português e em inglês. A Wikidata guarda o nome de muita gente só
 * em `mul` (multilíngue: "Novak Djokovic", "Alexander Zverev"), que vale como
 * o inglês quando ele falta.
 */
const LABELS = `
  OPTIONAL { ?item rdfs:label ?pt FILTER(lang(?pt) = "pt-br" || lang(?pt) = "pt") }
  OPTIONAL { ?item rdfs:label ?en0 FILTER(lang(?en0) = "en") }
  OPTIONAL { ?item rdfs:label ?mul FILTER(lang(?mul) = "mul") }
  BIND(COALESCE(?en0, ?mul) AS ?en)`

// --------------------------------------------------------------------------
// Futebol
// --------------------------------------------------------------------------

/** Séries A, B, C e D. O vínculo de liga não diz a temporada: pode estar velho. */
const BRAZIL_LEAGUES = ['Q206813', 'Q610175', 'Q2037826', 'Q931513']
/** Inglaterra, Espanha, Itália, Alemanha, França, Portugal, Argentina, MLS, Arábia Saudita. */
const FOREIGN_LEAGUES = [
  'Q9448',
  'Q324867',
  'Q15804',
  'Q82595',
  'Q13394',
  'Q182994',
  'Q223170',
  'Q18543',
  'Q255633'
]

const CLUB_PREFIXES = [
  'Sociedade Esportiva e Recreativa',
  'Sociedade Esportiva',
  'Associação Atlética',
  'Associação Desportiva',
  'Clube de Regatas do',
  'Clube de Regatas',
  'Club de Regatas',
  'Sport Club do',
  'Sport Club',
  'Esporte Clube',
  'Grêmio Esportivo',
  'Grêmio Recreativo',
  'Clube Atlético',
  'Club Athletico',
  'Centro Sportivo',
  'Associação',
  'Clube do',
  'Clube de',
  'Clube',
  'Club'
]
const CLUB_SUFFIXES = [
  'de Futebol e Regatas',
  'Futebol e Regatas',
  'Futebol Clube',
  'Foot Ball Club',
  'Football Club',
  'Esporte Clube',
  'Sporting Club',
  'Atlético Clube',
  'Club de Fútbol',
  'Fútbol Club',
  'Sport Club',
  'de Futebol',
  'de Desportos',
  'Futebol',
  'Clube',
  'F\\.?C\\.?',
  'A\\.?F\\.?C\\.?',
  'S\\.?C\\.?',
  'C\\.?F\\.?'
]

/** Nome oficial → nome curto. Proposta: quem revisa corrige no arquivo. */
export function shortClubName(official: string): string {
  let name = official.replace(/\s*\(.*\)$/, '')
  for (const prefix of CLUB_PREFIXES) {
    const next = name.replace(new RegExp(`^${prefix}\\s+`, 'i'), '')
    if (next !== name && next.length >= 3) {
      name = next
      break
    }
  }
  for (const suffix of CLUB_SUFFIXES) {
    const next = name.replace(new RegExp(`\\s+${suffix}$`, 'i'), '')
    if (next !== name && next.length >= 3) {
      name = next
      break
    }
  }
  return name.replace(/^(FC|AFC|SC|CF)\s+/, '').trim()
}

async function brazilianClubs(): Promise<Proposal[]> {
  const rows = await sparql(`
    SELECT ?item ?pt ?en ?links ?uf WHERE {
      VALUES ?league { ${BRAZIL_LEAGUES.map((q) => `wd:${q}`).join(' ')} }
      ?item wdt:P118 ?league; wdt:P31/wdt:P279* wd:Q476028; wikibase:sitelinks ?links .
      FILTER NOT EXISTS { ?item wdt:P576 [] }
      OPTIONAL {
        ?item (wdt:P159|wdt:P131)/wdt:P131?/wdt:P131? ?state .
        ?state wdt:P31 wd:Q485258; wdt:P300 ?uf
      }
      ${LABELS}
    }`)
  const clubs = (await byItem(rows)).map(([key, { row, aliases }]) => ({
    key,
    name: shortClubName(row.pt ?? row.en ?? key),
    uf: row.uf?.slice(3),
    relevance: Number(row.links),
    aliases
  }))
  // Dois "América" viram "América-MG" e "América-RN"; o mais conhecido também
  // leva o estado, e quem revisa tira se o nome sozinho for dele.
  const count = new Map<string, number>()
  for (const club of clubs)
    count.set(club.name, (count.get(club.name) ?? 0) + 1)
  return clubs.map((club) => ({
    key: club.key,
    name:
      (count.get(club.name) ?? 0) > 1 && club.uf
        ? `${club.name}-${club.uf}`
        : club.name,
    kind: 'team',
    country: 'BR',
    relevance: club.relevance,
    aliases: [...club.aliases].slice(0, MAX_ALIASES)
  }))
}

async function foreignClubs(): Promise<Proposal[]> {
  const rows = await sparql(`
    SELECT ?item ?pt ?en ?links ?country WHERE {
      VALUES ?league { ${FOREIGN_LEAGUES.map((q) => `wd:${q}`).join(' ')} }
      ?item wdt:P118 ?league; wdt:P31/wdt:P279* wd:Q476028; wikibase:sitelinks ?links .
      FILTER NOT EXISTS { ?item wdt:P576 [] }
      OPTIONAL { ?item wdt:P17/wdt:P297 ?country }
      ${LABELS}
    }`)
  // O rótulo em inglês é o nome de uso ("FC Barcelona"); o português costuma
  // ser o oficial ("Futbol Club Barcelona").
  return (await byItem(rows)).map(([key, { row, aliases }]) => ({
    key,
    name: shortClubName(row.en ?? row.pt ?? key),
    kind: 'team',
    country: row.country ?? null,
    relevance: Number(row.links),
    aliases: [...aliases].slice(0, MAX_ALIASES)
  }))
}

/** O Reino Unido tem quatro seleções; o país não diz qual. */
const UK_TEAMS: Record<string, [string, string]> = {
  England: ['Inglaterra', 'GB'],
  Scotland: ['Escócia', 'GB'],
  Wales: ['País de Gales', 'GB'],
  'Northern Ireland': ['Irlanda do Norte', 'GB']
}

/** Nome do país na Wikidata → como o torcedor fala. */
const NATION_NAMES: Record<string, string> = {
  'República Popular da China': 'China',
  'Estado da Palestina': 'Palestina',
  'Estados Unidos': 'EUA',
  'República da Irlanda': 'Irlanda',
  Tchéquia: 'República Tcheca',
  Birmânia: 'Mianmar'
}

async function nationalTeams(): Promise<Proposal[]> {
  const rows = await sparql(`
    SELECT ?item ?en ?nation ?links WHERE {
      ?item wdt:P31 wd:Q135408445; wikibase:sitelinks ?links .
      FILTER(?links >= 30)
      ?item wdt:P17 ?nation .
      OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
    }`)
  // País em consulta separada: na mesma, a Wikidata estoura o tempo.
  const nations = new Map(
    (
      await sparql(`
        SELECT ?nation ?code ?name WHERE {
          VALUES ?nation { ${[...new Set(rows.map((row) => `wd:${row.nation}`))].join(' ')} }
          ?nation wdt:P297 ?code .
          FILTER NOT EXISTS { ?nation wdt:P576 [] }
          SERVICE wikibase:label {
            bd:serviceParam wikibase:language "pt-br,pt" . ?nation rdfs:label ?name .
          }
        }`)
    ).map((row) => [row.nation, row])
  )
  // Uma seleção por nome: a classe também traz seleção olímpica, B e de
  // praia, que ficam com menos artigos que a principal.
  const teams = new Map<string, Proposal>()
  const byLinks = [...rows].sort((a, b) => Number(b.links) - Number(a.links))
  for (const row of byLinks) {
    const nation = nations.get(row.nation)
    // Sem país vivo é seleção de país que acabou (União Soviética).
    if (!row.item || !nation) continue
    const uk = Object.entries(UK_TEAMS).find(([name]) =>
      row.en?.startsWith(name)
    )?.[1]
    // As do Reino Unido que não são das quatro nações são a olímpica.
    if (nation.code === 'GB' && !uk) continue
    const name =
      NATION_NAMES[nation.name ?? ''] ?? uk?.[0] ?? nation.name ?? row.item
    if (teams.has(name)) continue
    teams.set(name, {
      key: row.item,
      name,
      kind: 'team',
      country: uk?.[1] ?? nation.code ?? null,
      nationalTeam: true,
      relevance: Number(row.links),
      aliases: [`Seleção ${name}`, ...(row.en ? [row.en] : [])]
    })
  }
  return [...teams.values()]
}

// --------------------------------------------------------------------------
// NBA, NFL e UFC
// --------------------------------------------------------------------------

async function leagueTeams(league: string): Promise<Proposal[]> {
  const rows = await sparql(`
    SELECT ?item ?pt ?en ?links ?country WHERE {
      ?item wdt:P118 wd:${league}; wdt:P31/wdt:P279* wd:Q12973014; wikibase:sitelinks ?links .
      FILTER NOT EXISTS { ?item wdt:P576 [] }
      OPTIONAL { ?item wdt:P17/wdt:P297 ?country }
      ${LABELS}
    }`)
  return (await byItem(rows)).map(([key, { row, aliases }]) => ({
    key,
    name: row.en ?? row.pt ?? key,
    kind: 'team',
    country: row.country ?? 'US',
    relevance: Number(row.links),
    aliases: [...aliases].slice(0, MAX_ALIASES)
  }))
}

/** Lutador com página no UFC.com, vivo e com 10 artigos ou mais na Wikipédia. */
async function ufcFighters(): Promise<Proposal[]> {
  const rows = await sparql(`
    SELECT ?item ?pt ?en ?links ?country WHERE {
      ?item wdt:P9722 []; wikibase:sitelinks ?links .
      FILTER(?links >= 10)
      FILTER NOT EXISTS { ?item wdt:P570 [] }
      OPTIONAL { ?item wdt:P27/wdt:P297 ?country }
      ${LABELS}
    }`)
  return (await byItem(rows)).map(([key, { row, aliases }]) => ({
    key,
    // O rótulo em português às vezes traz "(lutador)" ou foi vandalizado.
    name: (row.en ?? row.pt ?? key).replace(/\s*\(.*\)$/, ''),
    kind: 'athlete',
    country: row.country ?? null,
    relevance: Number(row.links),
    aliases: [...aliases].slice(0, MAX_ALIASES)
  }))
}

/**
 * Tenista com código da ATP ou da WTA, vivo, nascido de 1985 em diante, sem
 * data de fim de carreira e com 15 artigos ou mais na Wikipédia. Simples e
 * duplas ficam juntos: o código não separa.
 */
async function tennisPlayers(): Promise<Proposal[]> {
  const rows = await sparql(`
    SELECT ?item ?pt ?en ?links ?country WHERE {
      { ?item wdt:P536 [] } UNION { ?item wdt:P597 [] }
      ?item wikibase:sitelinks ?links; wdt:P569 ?born .
      FILTER(?links >= 15 && YEAR(?born) >= 1985)
      FILTER NOT EXISTS { ?item wdt:P570 [] }
      FILTER NOT EXISTS { ?item wdt:P2032 [] }
      # O país por que joga; sem ele, a cidadania.
      OPTIONAL { ?item wdt:P1532/wdt:P297 ?sportCountry }
      OPTIONAL { ?item wdt:P27/wdt:P297 ?citizenship }
      BIND(COALESCE(?sportCountry, ?citizenship) AS ?country)
      ${LABELS}
    }`)
  return (await byItem(rows)).map(([key, { row, aliases }]) => ({
    key,
    name: (row.en ?? row.pt ?? key).replace(/\s*\(.*\)$/, ''),
    kind: 'athlete',
    country: row.country ?? null,
    relevance: Number(row.links),
    aliases: [...aliases].slice(0, MAX_ALIASES)
  }))
}

// --------------------------------------------------------------------------
// F1 (WEB-520): um item por GP do calendário, à mão, como vôlei e NBB. A
// Jolpica-F1 (pilotos e escuderias) saiu: sem licença para usar a fonte.
// --------------------------------------------------------------------------

/** Uma consulta por vez: a Wikidata limita quem consulta em paralelo. */
export const SOURCES: Record<CatalogSport, (() => Promise<Proposal[]>)[]> = {
  futebol: [brazilianClubs, foreignClubs, nationalTeams],
  basquete: [() => leagueTeams('Q155223')],
  volei: [],
  'futebol-americano': [() => leagueTeams('Q1215884')],
  'formula-1': [],
  'mma-ufc': [ufcFighters],
  tenis: [tennisPlayers]
}

// --------------------------------------------------------------------------
// Junta a proposta ao arquivo revisado
// --------------------------------------------------------------------------

/**
 * Entrada já revisada mantém nome, tipo e destaque. Entrada `manual:` que a
 * fonte passou a trazer (mesmo nome ou apelido, um só candidato) ganha a
 * chave da fonte, e assim a linha da tabela continua a mesma.
 */
export function mergeProposal(current: CatalogEntry[], proposal: Proposal[]) {
  const entries = new Map(current.map((entry) => [entry.key, { ...entry }]))
  const added: string[] = []
  for (const item of proposal) {
    const existing = entries.get(item.key)
    if (existing) {
      existing.relevance = item.relevance
      existing.aliases = mergeAliases(existing, item.aliases)
      continue
    }
    const names = new Set([item.name, ...item.aliases].map(fold))
    const manual = [...entries.values()].filter(
      (entry) =>
        entry.key.startsWith('manual:') &&
        entry.nationalTeam === item.nationalTeam &&
        names.has(fold(entry.name))
    )
    if (manual.length === 1 && manual[0]) {
      const entry = manual[0]
      entries.delete(entry.key)
      entries.set(item.key, {
        ...entry,
        key: item.key,
        relevance: item.relevance,
        country: entry.country ?? item.country,
        aliases: mergeAliases(entry, [item.name, ...item.aliases])
      })
      continue
    }
    entries.set(item.key, item)
    added.push(item.name)
  }
  const proposed = new Set(proposal.map((item) => item.key))
  const missing = [...entries.values()]
    .filter(
      (entry) => !entry.key.startsWith('manual:') && !proposed.has(entry.key)
    )
    .map((entry) => entry.name)
  return { entries: [...entries.values()], added, missing }
}

function mergeAliases(entry: CatalogEntry, aliases: string[]): string[] {
  const own = fold(entry.name)
  const seen = new Set<string>([own])
  return [...entry.aliases, ...aliases]
    .filter((alias) => {
      const key = fold(alias)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_ALIASES)
}

async function main() {
  const requested = process.argv.slice(2)
  const sports = (
    requested.length ? requested : CATALOG_SPORTS
  ) as CatalogSport[]
  for (const sport of sports) {
    if (!CATALOG_SPORTS.includes(sport))
      throw new Error(`Esporte desconhecido: ${sport}`)
    const proposal: Proposal[] = []
    for (const source of SOURCES[sport]) proposal.push(...(await source()))
    const { entries, added, missing } = mergeProposal(
      readCatalog(sport),
      proposal
    )
    writeCatalog(sport, entries)
    console.log(`${sport}: ${entries.length} no arquivo, ${added.length} novos`)
    if (added.length)
      console.log(`  novos (revisar o nome): ${added.join(', ')}`)
    if (missing.length)
      console.log(`  a fonte não trouxe mais: ${missing.join(', ')}`)
  }
}

if (import.meta.main) await main()
