import { createDb } from '..'
import { sport } from '../schema/platform'

const sports = [
  {
    name: 'Futebol',
    slug: 'futebol',
    iconUrl: null
  },
  {
    name: 'Basquete',
    slug: 'basquete',
    iconUrl: null
  },
  {
    name: 'Vôlei',
    slug: 'volei',
    iconUrl: null
  },
  {
    name: 'Futebol Americano',
    slug: 'futebol-americano',
    iconUrl: null
  },
  {
    name: 'Fórmula 1',
    slug: 'formula-1',
    iconUrl: null
  },
  {
    name: 'MMA / UFC',
    slug: 'mma-ufc',
    iconUrl: null
  }
]

async function main() {
  const db = createDb()

  console.log('🌱 Seeding sports...')

  await db
    .insert(sport)
    .values(sports.map((s) => ({ ...s, id: crypto.randomUUID() })))
    .onConflictDoNothing()

  console.log(`✅ ${sports.length} sports seeded.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
