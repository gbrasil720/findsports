import { db, sql } from '@findsports_oficial/db'

import { createSharedCache } from '../shared-cache'
import { utcIso } from '../utc-timestamp'
import {
  type AppConfigKey,
  type AppConfigValue,
  isAppConfigKey
} from './registry'
import {
  APP_CONFIG_TTL_MS,
  createAppConfigStore,
  type RegistroBruto
} from './store'

/**
 * Ligação da configuração com o banco (ESC-19).
 *
 * Separado de `store.ts` para que a lógica de resolução — cache, valor
 * malformado, banco fora do ar — seja testável sem `DATABASE_URL`. O que mora
 * aqui é só o cano: a consulta, o cache compartilhado e a instância única.
 */

/**
 * Lê a tabela inteira. Chaves fora do registro são descartadas aqui mesmo —
 * lixo antigo ou linha inserida à mão não chega a virar configuração.
 */
async function carregarDoBanco(): Promise<RegistroBruto> {
  const resultado = await db.execute(sql`SELECT key, value FROM app_config`)
  const linhas = resultado.rows as { key: string; value: unknown }[]

  const bruto: RegistroBruto = {}
  for (const linha of linhas) {
    if (isAppConfigKey(linha.key)) bruto[linha.key] = linha.value
  }
  return bruto
}

export type LinhaAppConfig = {
  key: AppConfigKey
  value: unknown
  updatedAt: string
  updatedBy: string | null
  /**
   * Nome de quem gravou, ou o e-mail se o nome estiver vazio. `null` quando
   * ninguém assinou a gravação ou a conta não existe mais — `updated_by` não
   * tem chave estrangeira, então o id sobrevive ao usuário.
   */
  updatedByNome: string | null
}

/**
 * Tudo que está gravado, com a auditoria junto, direto do banco e sem cache.
 *
 * Uma consulta só: valor e "quem mexeu, quando" vivem na mesma linha, e
 * buscá-los separado seriam duas idas ao banco para responder uma pergunta.
 *
 * Sem cache de propósito. Esta é a leitura do painel interno, cuja pergunta é
 * "o que está valendo depois que eu salvei" — durante um incidente a resposta
 * certa é a de agora, não a de até um minuto atrás.
 */
export async function carregarAppConfigGravada(): Promise<LinhaAppConfig[]> {
  const resultado = await db.execute(
    sql`
      SELECT c.key, c.value, c.updated_at, c.updated_by,
        COALESCE(NULLIF(btrim(u.name), ''), u.email) AS updated_by_nome
      FROM app_config c
      LEFT JOIN "user" u ON u.id = c.updated_by
    `
  )
  const linhas = resultado.rows as {
    key: string
    value: unknown
    updated_at: string | Date
    updated_by: string | null
    updated_by_nome: string | null
  }[]

  return linhas
    .filter((linha) => isAppConfigKey(linha.key))
    .map((linha) => ({
      key: linha.key as AppConfigKey,
      value: linha.value,
      updatedAt: utcIso(linha.updated_at),
      updatedBy: linha.updated_by,
      updatedByNome: linha.updated_by_nome
    }))
}

export const appConfigStore = createAppConfigStore({
  carregar: carregarDoBanco,
  cache: createSharedCache<RegistroBruto>({
    prefix: 'app-config',
    ttlMs: APP_CONFIG_TTL_MS,
    maxEntries: 1
  })
})

export function getAppConfig<K extends AppConfigKey>(
  key: K
): Promise<AppConfigValue<K>> {
  return appConfigStore.get(key)
}
