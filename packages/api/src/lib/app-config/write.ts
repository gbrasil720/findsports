import { db, sql } from '@findsports_oficial/db'
import { appConfigStore } from './db-source'
import type { AppConfigKey, AppConfigValue } from './registry'

/**
 * Escrita da configuração em tempo de execução (ESC-19).
 *
 * Não valida: recebe um valor JÁ validado, e o tipo é o que garante isso.
 * A validação mora em `validateAppConfigValue`, no registro, e quem chama
 * passa por ela primeiro — assim a mensagem de recusa chega a quem pediu, com
 * o campo que errou, em vez de virar exceção para alguém traduzir de volta.
 */

/**
 * Grava o desvio de uma chave e derruba o cache local.
 *
 * As demais instâncias continuam servindo o valor anterior até o TTL do cache
 * expirar — ver `store.ts`. Quem chama precisa saber disso: a resposta dizer
 * "gravado" não significa "já valendo em todo lugar".
 */
export async function setAppConfig<K extends AppConfigKey>(
  key: K,
  value: AppConfigValue<K>,
  updatedBy: string | null
): Promise<void> {
  // `jsonb` precisa do valor serializado: o driver mandaria um array ou um
  // booleano do JS como parâmetro de outro tipo. `::jsonb` sobre texto é o
  // caminho que não depende de o driver adivinhar.
  const serializado = JSON.stringify(value)

  await db.execute(sql`
    INSERT INTO app_config (key, value, updated_at, updated_by)
    VALUES (${key}, ${serializado}::jsonb, NOW(), ${updatedBy})
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by
  `)

  appConfigStore.invalidate()
}

/**
 * Remove o desvio: a chave volta ao padrão de código.
 *
 * Apagar a linha, e não gravar o padrão nela, é deliberado — assim o padrão
 * continua vivendo em um lugar só. Se amanhã o padrão de código mudar, quem
 * nunca mexeu na flag acompanha a mudança.
 */
export async function resetAppConfig(key: AppConfigKey): Promise<void> {
  await db.execute(sql`DELETE FROM app_config WHERE key = ${key}`)
  appConfigStore.invalidate()
}
