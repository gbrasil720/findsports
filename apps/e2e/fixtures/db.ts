import pg from 'pg'
import { DATABASE_URL } from '../env'

// As colunas de data são `timestamp` sem fuso, e o app (Drizzle) grava UTC.
// Sem isto o `pg` serializa `Date` no fuso do processo e o Postgres descarta
// o offset: numa máquina em São Paulo, 3h de diferença do app (WEB-197).
pg.defaults.parseInputDatesAsUTC = true

/**
 * Acesso direto ao banco do E2E. SQL cru com `pg`, e não o Drizzle do
 * `packages/db`: os testes rodam no Node do Playwright, que não carrega o
 * TypeScript dos pacotes do workspace.
 */
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 })

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<T[]> {
  const { rows } = await pool.query<T>(text, values)
  return rows
}

/**
 * `INSERT` de uma linha, com as colunas em snake_case como estão no banco.
 * Os nomes de coluna vêm do código de teste, nunca de entrada externa.
 */
export async function insert(
  table: string,
  row: Record<string, unknown>
): Promise<void> {
  const columns = Object.keys(row)
  await query(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')})
     VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(row)
  )
}

/**
 * Grava uma chave de `app_config`. Vale na requisição seguinte, porque o
 * servidor de E2E roda com `E2E_DISABLE_CACHES=1`. Só em arquivo
 * `*.serial.e2e.ts`: a config é global e os testes paralelos contam com os
 * padrões. Desfaça com `resetAppConfig()`.
 */
export async function setAppConfig(key: string, value: unknown) {
  await query(
    `INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  )
}

/** Linha ausente é "usa o padrão": apagar tudo volta ao estado de produção. */
export async function resetAppConfig() {
  await query('DELETE FROM app_config')
}

/**
 * Esvazia o `rate_limit` do better-auth e da waitlist. Cada teste já sai com
 * um IP próprio (`fixtures/test.ts`), então isto só é preciso para limpar
 * sobra de rodada anterior — o setup chama — ou num teste que esgota o limite
 * de propósito e quer recomeçar.
 */
export async function clearRateLimits() {
  await query('DELETE FROM rate_limit')
}
