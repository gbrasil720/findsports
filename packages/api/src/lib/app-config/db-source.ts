import { db, sql } from '@findsports_oficial/db'
import { recordAdminActionSafely } from '@findsports_oficial/db/admin-action'

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
/**
 * WEB-387: feitiço com prazo vencido sai da tabela e a volta fica escrita no
 * Grimório. O `DELETE … RETURNING` garante que só uma instância registra cada
 * volta, por mais que várias carreguem ao mesmo tempo. Roda a cada carga do
 * store (no máximo uma vez por TTL por instância), então a volta aparece em
 * até um TTL depois do prazo; a leitura já ignora a linha vencida antes disso.
 */
export async function expirarFeiticosVencidos(): Promise<AppConfigKey[]> {
  const resultado = await db.execute(sql`
    DELETE FROM app_config
    WHERE expires_at IS NOT NULL AND expires_at <= NOW()
    RETURNING key, value, expires_at, updated_by
  `)
  const linhas = resultado.rows as {
    key: string
    value: unknown
    expires_at: string | Date
    updated_by: string | null
  }[]
  const chaves: AppConfigKey[] = []
  for (const linha of linhas) {
    if (!isAppConfigKey(linha.key)) continue
    chaves.push(linha.key)
    await recordAdminActionSafely({
      kind: 'config.expire',
      actorId: 'houdini',
      actorName: 'Houdini',
      targetType: 'config',
      targetId: linha.key,
      targetLabel: linha.key,
      before: { value: linha.value },
      after: { padrao: true },
      detail: {
        expiresAt: utcIso(linha.expires_at),
        lancadoPor: linha.updated_by
      }
    })
  }
  return chaves
}

async function carregarDoBanco(): Promise<RegistroBruto> {
  await expirarFeiticosVencidos()
  const resultado = await db.execute(
    sql`SELECT key, value FROM app_config WHERE expires_at IS NULL OR expires_at > NOW()`
  )
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
  /** WEB-387: até quando vale; nulo = sem prazo. */
  expiresAt: string | null
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
      SELECT c.key, c.value, c.updated_at, c.updated_by, c.expires_at,
        COALESCE(NULLIF(btrim(u.name), ''), u.email) AS updated_by_nome
      FROM app_config c
      LEFT JOIN "user" u ON u.id = c.updated_by
      WHERE c.expires_at IS NULL OR c.expires_at > NOW()
    `
  )
  const linhas = resultado.rows as {
    key: string
    value: unknown
    updated_at: string | Date
    updated_by: string | null
    updated_by_nome: string | null
    expires_at: string | Date | null
  }[]

  return linhas
    .filter((linha) => isAppConfigKey(linha.key))
    .map((linha) => ({
      key: linha.key as AppConfigKey,
      value: linha.value,
      updatedAt: utcIso(linha.updated_at),
      updatedBy: linha.updated_by,
      updatedByNome: linha.updated_by_nome,
      expiresAt: linha.expires_at ? utcIso(linha.expires_at) : null
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
