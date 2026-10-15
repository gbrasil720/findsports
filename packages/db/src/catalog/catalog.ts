import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TeamKind } from '../schema/platform'
import { fold } from './fold'

export { fold }

/**
 * WEB-381: catálogo de times e atletas, um arquivo por esporte em `data/`.
 *
 * O arquivo é a versão revisada: `catalog:propose` acrescenta o que a fonte
 * trouxe de novo, alguém confere no PR (nome curto, duplicata, lixo), e
 * `db:catalog:sync` grava na tabela `team`. App e web leem só a tabela.
 */
export type CatalogEntry = {
  /** `Q…` da Wikidata, `f1:<id>` da Jolpica-F1 ou `manual:<slug>`. */
  key: string
  /** Nome curto que a tela mostra ("Corinthians"). Revisado à mão. */
  name: string
  kind: TeamKind
  /** ISO 3166-1 alfa-2. */
  country: string | null
  nationalTeam?: true
  /** Aparece sem busca na tela de escolha. */
  featured?: true
  /**
   * Revisado e recusado (time extinto, item errado na fonte). Fica no arquivo
   * para o `catalog:propose` não trazer de volta; não aparece na tela.
   */
  hidden?: true
  /** Artigos na Wikipédia sobre o item: ordena a busca. */
  relevance: number
  /** Nome oficial e apelidos: a busca acha por eles também. */
  aliases: string[]
}

export const CATALOG_SPORTS = [
  'futebol',
  'basquete',
  'volei',
  'futebol-americano',
  'formula-1',
  'mma-ufc',
  'tenis'
] as const

export type CatalogSport = (typeof CATALOG_SPORTS)[number]

const DATA_DIR = join(import.meta.dir, 'data')

export function readCatalog(sport: CatalogSport): CatalogEntry[] {
  return JSON.parse(readFileSync(join(DATA_DIR, `${sport}.json`), 'utf8'))
}

/** Uma entrada por linha: o diff do PR mostra exatamente o que mudou. */
export function writeCatalog(sport: CatalogSport, entries: CatalogEntry[]) {
  const sorted = [...entries].sort(
    (a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name, 'pt-BR')
  )
  const body = sorted.map((entry) => `  ${JSON.stringify(entry)}`).join(',\n')
  writeFileSync(join(DATA_DIR, `${sport}.json`), `[\n${body}\n]\n`)
}

export function slugify(value: string): string {
  return fold(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** O que `team.search_text` guarda: nome e apelidos, sem repetição. */
export function searchText(entry: Pick<CatalogEntry, 'name' | 'aliases'>) {
  return [...new Set([entry.name, ...entry.aliases].map(fold))].join(' | ')
}
