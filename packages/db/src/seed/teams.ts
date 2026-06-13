import { createDb } from '..'
import { sport, team } from '../schema/platform'

// --------------------------------------------------------------------------
// Times por esporte (slug do esporte → lista de times)
// --------------------------------------------------------------------------

const TEAMS_BY_SPORT: Record<string, { name: string; country: string }[]> = {
  futebol: [
    // Clubes brasileiros
    { name: 'Flamengo', country: 'BR' },
    { name: 'Palmeiras', country: 'BR' },
    { name: 'Corinthians', country: 'BR' },
    { name: 'São Paulo', country: 'BR' },
    { name: 'Santos', country: 'BR' },
    { name: 'Grêmio', country: 'BR' },
    { name: 'Internacional', country: 'BR' },
    { name: 'Atlético-MG', country: 'BR' },
    { name: 'Cruzeiro', country: 'BR' },
    { name: 'Botafogo', country: 'BR' },
    { name: 'Vasco', country: 'BR' },
    { name: 'Fluminense', country: 'BR' },
    { name: 'Athletico-PR', country: 'BR' },
    { name: 'Fortaleza', country: 'BR' },
    { name: 'Bahia', country: 'BR' },
    // Top europeus
    { name: 'Real Madrid', country: 'ES' },
    { name: 'Barcelona', country: 'ES' },
    { name: 'Manchester City', country: 'GB' },
    { name: 'Manchester United', country: 'GB' },
    { name: 'Liverpool', country: 'GB' },
    { name: 'Arsenal', country: 'GB' },
    { name: 'Chelsea', country: 'GB' },
    { name: 'Bayern München', country: 'DE' },
    { name: 'Borussia Dortmund', country: 'DE' },
    { name: 'PSG', country: 'FR' },
    { name: 'Juventus', country: 'IT' },
    { name: 'Inter de Milão', country: 'IT' },
    { name: 'Milan', country: 'IT' },
    { name: 'Atlético de Madrid', country: 'ES' },
    // Seleções Copa do Mundo 2026
    { name: 'Brasil', country: 'BR' },
    { name: 'Argentina', country: 'AR' },
    { name: 'França', country: 'FR' },
    { name: 'Espanha', country: 'ES' },
    { name: 'Inglaterra', country: 'GB' },
    { name: 'Alemanha', country: 'DE' },
    { name: 'Portugal', country: 'PT' },
    { name: 'Uruguai', country: 'UY' },
    { name: 'Colômbia', country: 'CO' },
    { name: 'México', country: 'MX' },
    { name: 'EUA', country: 'US' },
    { name: 'Japão', country: 'JP' },
    { name: 'Marrocos', country: 'MA' }
  ],

  basquete: [
    // NBA — todas as 30 franquias
    { name: 'Los Angeles Lakers', country: 'US' },
    { name: 'Golden State Warriors', country: 'US' },
    { name: 'Boston Celtics', country: 'US' },
    { name: 'Chicago Bulls', country: 'US' },
    { name: 'Miami Heat', country: 'US' },
    { name: 'New York Knicks', country: 'US' },
    { name: 'Milwaukee Bucks', country: 'US' },
    { name: 'Denver Nuggets', country: 'US' },
    { name: 'Phoenix Suns', country: 'US' },
    { name: 'Dallas Mavericks', country: 'US' },
    { name: 'Brooklyn Nets', country: 'US' },
    { name: 'Philadelphia 76ers', country: 'US' },
    { name: 'Cleveland Cavaliers', country: 'US' },
    { name: 'Toronto Raptors', country: 'CA' },
    { name: 'Atlanta Hawks', country: 'US' },
    { name: 'Memphis Grizzlies', country: 'US' },
    { name: 'New Orleans Pelicans', country: 'US' },
    { name: 'Sacramento Kings', country: 'US' },
    { name: 'Portland Trail Blazers', country: 'US' },
    { name: 'Utah Jazz', country: 'US' },
    { name: 'Oklahoma City Thunder', country: 'US' },
    { name: 'San Antonio Spurs', country: 'US' },
    { name: 'Houston Rockets', country: 'US' },
    { name: 'Minnesota Timberwolves', country: 'US' },
    { name: 'Indiana Pacers', country: 'US' },
    { name: 'Charlotte Hornets', country: 'US' },
    { name: 'Washington Wizards', country: 'US' },
    { name: 'Detroit Pistons', country: 'US' },
    { name: 'Orlando Magic', country: 'US' },
    { name: 'Los Angeles Clippers', country: 'US' },
    // NBB brasileiros
    { name: 'Flamengo Basquete', country: 'BR' },
    { name: 'Franca Basquete', country: 'BR' },
    { name: 'São Paulo FC Basquete', country: 'BR' },
    { name: 'Minas Tênis Clube', country: 'BR' },
    { name: 'Bauru Basket', country: 'BR' }
  ],

  volei: [
    { name: 'Sada Cruzeiro', country: 'BR' },
    { name: 'Minas Tênis Clube', country: 'BR' },
    { name: 'Praia Clube', country: 'BR' },
    { name: 'Osasco Audax', country: 'BR' },
    { name: 'Dentil/Praia Clube', country: 'BR' },
    { name: 'Sesi-SP', country: 'BR' },
    { name: 'Itambé/Minas', country: 'BR' },
    { name: 'EMS Taubaté Funvic', country: 'BR' },
    { name: 'Brasil Vôlei', country: 'BR' },
    { name: 'Pinheiros', country: 'BR' }
  ],

  'futebol-americano': [
    // NFL — todas as 32 franquias
    { name: 'Kansas City Chiefs', country: 'US' },
    { name: 'San Francisco 49ers', country: 'US' },
    { name: 'Philadelphia Eagles', country: 'US' },
    { name: 'Dallas Cowboys', country: 'US' },
    { name: 'Buffalo Bills', country: 'US' },
    { name: 'Baltimore Ravens', country: 'US' },
    { name: 'Green Bay Packers', country: 'US' },
    { name: 'Miami Dolphins', country: 'US' },
    { name: 'New England Patriots', country: 'US' },
    { name: 'Los Angeles Rams', country: 'US' },
    { name: 'Cincinnati Bengals', country: 'US' },
    { name: 'Las Vegas Raiders', country: 'US' },
    { name: 'New York Giants', country: 'US' },
    { name: 'New York Jets', country: 'US' },
    { name: 'Chicago Bears', country: 'US' },
    { name: 'Minnesota Vikings', country: 'US' },
    { name: 'Detroit Lions', country: 'US' },
    { name: 'Seattle Seahawks', country: 'US' },
    { name: 'Denver Broncos', country: 'US' },
    { name: 'Los Angeles Chargers', country: 'US' },
    { name: 'Indianapolis Colts', country: 'US' },
    { name: 'Jacksonville Jaguars', country: 'US' },
    { name: 'Tennessee Titans', country: 'US' },
    { name: 'Houston Texans', country: 'US' },
    { name: 'Cleveland Browns', country: 'US' },
    { name: 'Pittsburgh Steelers', country: 'US' },
    { name: 'Atlanta Falcons', country: 'US' },
    { name: 'Carolina Panthers', country: 'US' },
    { name: 'New Orleans Saints', country: 'US' },
    { name: 'Tampa Bay Buccaneers', country: 'US' },
    { name: 'Arizona Cardinals', country: 'US' },
    { name: 'Washington Commanders', country: 'US' }
  ],

  'formula-1': [
    // Escuderias 2026
    { name: 'Mercedes', country: 'DE' },
    { name: 'Ferrari', country: 'IT' },
    { name: 'McLaren', country: 'GB' },
    { name: 'Red Bull Racing', country: 'AT' },
    { name: 'Alpine', country: 'FR' },
    { name: 'Aston Martin', country: 'GB' },
    { name: 'Haas', country: 'US' },
    { name: 'Williams', country: 'GB' },
    { name: 'Racing Bulls', country: 'IT' },
    { name: 'Kick Sauber', country: 'CH' },
    { name: 'Audi', country: 'DE' },
    { name: 'Cadillac', country: 'US' }
  ],

  'mma-ufc': [
    // Campeões e principais lutadores 2026
    { name: 'Alex Pereira', country: 'BR' },
    { name: 'Charles Oliveira', country: 'BR' },
    { name: 'Gilbert Burns', country: 'BR' },
    { name: 'Amanda Nunes', country: 'BR' },
    { name: 'Rodrigo Minotauro', country: 'BR' },
    { name: 'Ilia Topuria', country: 'GE' },
    { name: 'Islam Makhachev', country: 'RU' },
    { name: 'Khamzat Chimaev', country: 'SE' },
    { name: 'Tom Aspinall', country: 'GB' },
    { name: 'Jon Jones', country: 'US' },
    { name: 'Conor McGregor', country: 'IE' },
    { name: 'Justin Gaethje', country: 'US' },
    { name: 'Max Holloway', country: 'US' },
    { name: 'Valentina Shevchenko', country: 'KG' },
    { name: 'Israel Adesanya', country: 'NZ' },
    { name: 'Petr Yan', country: 'RU' }
  ]
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function main() {
  const db = createDb()

  console.log('🌱 Seeding teams...')

  // Busca todos os esportes do banco
  const sports = await db.select().from(sport)

  if (sports.length === 0) {
    console.error(
      '❌ Nenhum esporte encontrado. Rode o seed de esportes primeiro.'
    )
    process.exit(1)
  }

  let total = 0

  for (const s of sports) {
    const teamsForSport = TEAMS_BY_SPORT[s.slug]

    if (!teamsForSport) {
      console.log(`⚠️  Sem times mapeados para o esporte: ${s.name} (${s.slug})`)
      continue
    }

    const values = teamsForSport.map((t) => ({
      id: crypto.randomUUID(),
      sportId: s.id,
      name: t.name,
      slug: t.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      country: t.country,
      logoUrl: null
    }))

    await db.insert(team).values(values).onConflictDoNothing()

    console.log(`✅ ${values.length} times inseridos para ${s.name}`)
    total += values.length
  }

  console.log(`\n🎉 Total: ${total} times inseridos.`)
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Seed falhou:', err)
  process.exit(1)
})
