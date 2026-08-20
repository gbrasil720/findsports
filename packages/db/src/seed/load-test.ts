import { Pool } from 'pg'
import { resolveDatabaseUrl } from '../utils/db-resolver'

type LoadShape = {
  fans: number
  bars: number
  eventsPerBar: number
  sessions: number
  favoritesPerFan: number
  analyticsPerBar: number
}

const defaults: LoadShape = {
  fans: 10_000,
  bars: 2_000,
  eventsPerBar: 5,
  sessions: 2_000,
  favoritesPerFan: 2,
  analyticsPerBar: 5
}

const limits: LoadShape = {
  fans: 5_000_000,
  bars: 500_000,
  eventsPerBar: 20,
  sessions: 1_000_000,
  favoritesPerFan: 20,
  analyticsPerBar: 100
}

function readInteger(name: keyof LoadShape) {
  const flag = `--${name}`
  const index = process.argv.indexOf(flag)
  if (index === -1) return defaults[name]

  const value = Number(process.argv[index + 1])
  if (!Number.isSafeInteger(value) || value < 0 || value > limits[name]) {
    throw new Error(
      `${flag} must be an integer between 0 and ${limits[name].toLocaleString('en-US')}`
    )
  }
  return value
}

const shape: LoadShape = {
  fans: readInteger('fans'),
  bars: readInteger('bars'),
  eventsPerBar: readInteger('eventsPerBar'),
  sessions: readInteger('sessions'),
  favoritesPerFan: readInteger('favoritesPerFan'),
  analyticsPerBar: readInteger('analyticsPerBar')
}

if (shape.bars === 0 && (shape.eventsPerBar > 0 || shape.analyticsPerBar > 0)) {
  throw new Error('eventsPerBar and analyticsPerBar require at least one bar')
}
if (shape.fans === 0 && shape.favoritesPerFan > 0) {
  throw new Error('favoritesPerFan requires at least one fan')
}
if (shape.sessions > shape.fans) {
  throw new Error('--sessions cannot exceed --fans')
}
if (shape.bars > 0 && shape.favoritesPerFan > shape.bars) {
  throw new Error('--favoritesPerFan cannot exceed --bars')
}

const connectionString = resolveDatabaseUrl()
const target = new URL(connectionString)
if (
  !['localhost', '127.0.0.1', '::1'].includes(target.hostname) ||
  target.pathname !== '/findsports_load_test'
) {
  throw new Error('Refusing to seed anything except local findsports_load_test')
}

const pool = new Pool({ connectionString, max: 1 })
const startedAt = performance.now()

try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL synchronous_commit = off')
    await client.query(`
      TRUNCATE TABLE
        rate_limit,
        verification,
        account,
        session,
        user_favorite_bars,
        user_preference_sports,
        event_participants,
        bar_commercial_event,
        bar_commercial_daily_rollup,
        bar_commercial_monthly_rollup,
        rollup_checkpoint,
        event,
        subscription,
        bar,
        team,
        sport,
        "user"
      RESTART IDENTITY CASCADE
    `)

    await client.query(`
      INSERT INTO sport (id, name, slug, created_at)
      VALUES ('00000000-0000-4000-8000-000000000001', 'Futebol', 'futebol', NOW())
    `)

    await client.query(
      `
        INSERT INTO team (id, sport_id, name, slug, country, created_at)
        SELECT
          '60000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          '00000000-0000-4000-8000-000000000001',
          'Time ' || i,
          'time-' || i,
          'BR',
          NOW()
        FROM generate_series(1, 64) AS i
      `
    )

    await client.query(
      `
        INSERT INTO "user" (
          id, name, email, email_verified, role, onboarding_completed,
          search_radius_km, created_at, updated_at
        )
        SELECT
          '10000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          'Torcedor de carga ' || i,
          'fan-' || i || '@load.invalid',
          true,
          'fan',
          true,
          3,
          NOW(),
          NOW()
        FROM generate_series(1, $1::integer) AS i
      `,
      [shape.fans]
    )

    await client.query(
      `
        INSERT INTO "user" (
          id, name, email, email_verified, role, onboarding_completed,
          search_radius_km, created_at, updated_at
        )
        SELECT
          '20000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          'Bar de carga ' || i,
          'pub-' || i || '@load.invalid',
          true,
          'pub',
          true,
          3,
          NOW(),
          NOW()
        FROM generate_series(1, $1::integer) AS i
      `,
      [shape.bars]
    )

    await client.query(`
      INSERT INTO account (
        id, account_id, provider_id, user_id, created_at, updated_at
      )
      SELECT
        '50000000-0000-4000-8000-' || lpad(row_number() OVER (ORDER BY id)::text, 12, '0'),
        email,
        'load-test',
        id,
        NOW(),
        NOW()
      FROM "user"
    `)

    await client.query(
      `
        INSERT INTO session (
          id, token, expires_at, created_at, updated_at, user_id
        )
        SELECT
          '80000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          'load-session-' || i,
          NOW() + INTERVAL '30 days',
          NOW(),
          NOW(),
          '10000000-0000-4000-8000-' || lpad(i::text, 12, '0')
        FROM generate_series(1, $1::integer) AS i
      `,
      [shape.sessions]
    )

    await client.query(
      `
        INSERT INTO bar (
          id, user_id, name, address, neighborhood, city,
          latitude, longitude, is_active, created_at, updated_at
        )
        SELECT
          '30000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          '20000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          'Bar de carga ' || i,
          'Rua de carga ' || i,
          'Bairro ' || (i % 100),
          'São Paulo',
          (-23.55 + ((i % 1000) - 500) * 0.0002)::numeric(10, 8),
          (-46.63 + (((i * 37) % 1000) - 500) * 0.0002)::numeric(11, 8),
          true,
          NOW(),
          NOW()
        FROM generate_series(1, $1::integer) AS i
      `,
      [shape.bars]
    )

    await client.query(
      `
        INSERT INTO subscription (
          id, bar_id, plan, status, created_at, updated_at
        )
        SELECT
          '70000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          '30000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          CASE WHEN i % 20 = 0 THEN 'elite'::subscription_plan
               WHEN i % 5 = 0 THEN 'pro'::subscription_plan
               ELSE 'starter'::subscription_plan END,
          'active'::subscription_status,
          NOW(),
          NOW()
        FROM generate_series(1, $1::integer) AS i
      `,
      [shape.bars]
    )

    await client.query(
      `
        INSERT INTO event (
          id, bar_id, sport_id, championship, starts_at,
          participant_free_text, created_at
        )
        SELECT
          '40000000-0000-4000-8000-' || lpad(((bar_i - 1) * $2::integer + event_i)::text, 12, '0'),
          '30000000-0000-4000-8000-' || lpad(bar_i::text, 12, '0'),
          '00000000-0000-4000-8000-000000000001',
          'Campeonato ' || (event_i % 20),
          -- Faixa de -7 a +14 dias em torno do momento do seed.
          --
          -- A fórmula anterior era \`NOW() + (event_i * 60 + bar_i % 60)
          -- minutos\`, que com o padrão de 5 jogos por bar colocava a agenda
          -- inteira nas 6 horas seguintes ao seed. Passada essa janela, a
          -- base continuava carregada mas \`starts_at >= NOW()\` não casava
          -- com nada — e a busca, cujo custo real é o LATERAL que procura o
          -- próximo jogo de cada candidato, passava a medir uma varredura
          -- que descarta tudo. Sem erro e sem lista vazia visível: só um
          -- número de benchmark que parece plausível e não é.
          --
          -- Medido no mesmo banco, mesma query, mesma origem: 20,4 ms e
          -- 21.468 buffers com a agenda vencida, contra 2,1 ms e 1.789
          -- buffers com jogos de verdade no futuro.
          --
          -- Os multiplicadores primos espalham sem \`random()\`, então o
          -- seed continua determinístico. A fatia no passado importa porque
          -- a busca filtra por data: uma base só com jogo futuro esconde o
          -- custo desse filtro.
          NOW()
            + (((bar_i * 7 + event_i * 13) % 30240) || ' minutes')::interval
            - INTERVAL '7 days',
          'Participantes ' || event_i,
          NOW()
        FROM generate_series(1, $1::integer) AS bar_i
        CROSS JOIN generate_series(1, $2::integer) AS event_i
      `,
      [shape.bars, shape.eventsPerBar]
    )

    await client.query(
      `
        INSERT INTO user_preference_sports (user_id, sport_id)
        SELECT
          '10000000-0000-4000-8000-' || lpad(i::text, 12, '0'),
          '00000000-0000-4000-8000-000000000001'
        FROM generate_series(1, $1::integer) AS i
      `,
      [shape.fans]
    )

    await client.query(
      `
        INSERT INTO user_favorite_bars (user_id, bar_id, created_at)
        SELECT
          '10000000-0000-4000-8000-' || lpad(fan_i::text, 12, '0'),
          '30000000-0000-4000-8000-' || lpad((((fan_i + favorite_i - 2) % $2::integer) + 1)::text, 12, '0'),
          NOW()
        FROM generate_series(1, $1::integer) AS fan_i
        CROSS JOIN generate_series(1, $3::integer) AS favorite_i
      `,
      [shape.fans, shape.bars, shape.favoritesPerFan]
    )

    await client.query(
      `
        INSERT INTO bar_commercial_event (
          id, bar_id, actor_user_id, type, occurred_at,
          commercial_day, created_at
        )
        SELECT
          '90000000-0000-4000-8000-' || lpad(((bar_i - 1) * $2::integer + event_i)::text, 12, '0'),
          '30000000-0000-4000-8000-' || lpad(bar_i::text, 12, '0'),
          '10000000-0000-4000-8000-' || lpad((((bar_i + event_i - 2) % $3::integer) + 1)::text, 12, '0'),
          (ARRAY['profile_view', 'directions_opened', 'phone_clicked', 'whatsapp_opened']::bar_commercial_event_type[])[((event_i - 1) % 4) + 1],
          NOW() - (event_i || ' days')::interval,
          (CURRENT_DATE - event_i)::date,
          NOW()
        FROM generate_series(1, $1::integer) AS bar_i
        CROSS JOIN generate_series(1, $2::integer) AS event_i
      `,
      [shape.bars, shape.analyticsPerBar, shape.fans]
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  await pool.query('ANALYZE')
  const result = await pool.query(`
    SELECT json_build_object(
      'database', current_database(),
      'users', (SELECT count(*) FROM "user"),
      'accounts', (SELECT count(*) FROM account),
      'sessions', (SELECT count(*) FROM session),
      'fans', (SELECT count(*) FROM "user" WHERE role = 'fan'),
      'bars', (SELECT count(*) FROM bar),
      'events', (SELECT count(*) FROM event),
      'favorites', (SELECT count(*) FROM user_favorite_bars),
      'commercialEvents', (SELECT count(*) FROM bar_commercial_event),
      'databaseBytes', pg_database_size(current_database())
    ) AS summary
  `)

  console.log(
    JSON.stringify(
      {
        ...result.rows[0].summary,
        seedDurationMs: Math.round(performance.now() - startedAt)
      },
      null,
      2
    )
  )
} finally {
  await pool.end()
}
