import { and, eq, isNull } from 'drizzle-orm'
import { createDb } from '..'
import { sport, team } from '../schema/platform'
import {
  CATALOG_SPORTS,
  type CatalogEntry,
  fold,
  readCatalog,
  searchText,
  slugify
} from './catalog'

/*
 * WEB-381: `bun run db:catalog:sync` grava o catálogo revisado na tabela
 * `team`. Roda no deploy, depois da migration, e pode rodar quantas vezes
 * for: só escreve o que mudou.
 *
 * Nunca apaga: um time sai de favoritos e de jogos em cascata, então tirar do
 * catálogo é marcar `hidden`, que só o tira do destaque. Linha antiga, sem
 * chave, é ligada à entrada de mesmo esporte e mesmo nome.
 */

type Row = typeof team.$inferSelect
type Values = Pick<
  Row,
  | 'name'
  | 'kind'
  | 'country'
  | 'isNationalTeam'
  | 'featured'
  | 'relevance'
  | 'searchText'
  | 'catalogKey'
>

function valuesOf(entry: CatalogEntry): Values {
  return {
    name: entry.name,
    kind: entry.kind,
    country: entry.country,
    isNationalTeam: entry.nationalTeam ?? false,
    featured: !entry.hidden && (entry.featured ?? false),
    relevance: entry.relevance,
    searchText: searchText(entry),
    catalogKey: entry.key
  }
}

function changed(row: Row, values: Partial<Values>) {
  return Object.entries(values).some(
    ([field, value]) => row[field as keyof Values] !== value
  )
}

async function main() {
  const db = createDb()
  const sports = new Map(
    (await db.select().from(sport)).map((item) => [item.slug, item.id])
  )
  const rows = await db.select().from(team)
  const byKey = new Map(
    rows.flatMap((row) => (row.catalogKey ? [[row.catalogKey, row]] : []))
  )
  const slugs = new Set(rows.map((row) => row.slug))
  const keys = new Set<string>()
  let inserted = 0
  let updated = 0

  await db.transaction(async (tx) => {
    for (const sportSlug of CATALOG_SPORTS) {
      const sportId = sports.get(sportSlug)
      if (!sportId) {
        console.warn(`Esporte ${sportSlug} não existe no banco: pulado.`)
        continue
      }
      const fresh: (typeof team.$inferInsert)[] = []
      for (const entry of readCatalog(sportSlug)) {
        if (keys.has(entry.key)) {
          throw new Error(`Chave repetida no catálogo: ${entry.key}`)
        }
        keys.add(entry.key)
        const row =
          byKey.get(entry.key) ??
          rows.find(
            (candidate) =>
              !candidate.catalogKey &&
              candidate.sportId === sportId &&
              fold(candidate.name) === fold(entry.name)
          )
        if (row) {
          const linking = row.catalogKey !== entry.key
          // Na memória também: a mesma linha não se liga a outra entrada.
          row.catalogKey = entry.key
          // Recusado depois de existir: sai do destaque e continua na busca,
          // com o nome e a chave que já tinha.
          const values = entry.hidden
            ? { featured: false, catalogKey: entry.key }
            : valuesOf(entry)
          if (linking || changed(row, values)) {
            await tx.update(team).set(values).where(eq(team.id, row.id))
            updated++
          }
          continue
        }
        if (entry.hidden) continue
        // `slug` é único entre esportes ("Minas Tênis Clube" joga basquete e
        // vôlei) e não muda depois de criado: as regras de clássico o usam.
        let slug = slugify(entry.name)
        if (slugs.has(slug)) slug = `${slug}-${sportSlug}`
        for (let suffix = 2; slugs.has(slug); suffix++) {
          slug = `${slugify(entry.name)}-${sportSlug}-${suffix}`
        }
        slugs.add(slug)
        fresh.push({ ...valuesOf(entry), sportId, slug })
      }
      for (let start = 0; start < fresh.length; start += 500) {
        await tx.insert(team).values(fresh.slice(start, start + 500))
      }
      inserted += fresh.length
    }
    // O destaque é do catálogo: linha que ficou de fora dele não aparece sem busca.
    const demoted = await tx
      .update(team)
      .set({ featured: false })
      .where(and(isNull(team.catalogKey), eq(team.featured, true)))
      .returning({ id: team.id })
    updated += demoted.length
  })

  console.log(`Catálogo: ${inserted} novos, ${updated} atualizados.`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Catálogo não sincronizado:', error)
  process.exit(1)
})
