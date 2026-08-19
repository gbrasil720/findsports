import type { TtlCache } from '../ttl-cache'
import {
  APP_CONFIG_DEFINITIONS,
  type AppConfigKey,
  type AppConfigPublico,
  type AppConfigValue,
  appConfigDefault,
  PUBLIC_APP_CONFIG_KEYS,
  parseAppConfigValue
} from './registry'

/**
 * Leitura da configuração em tempo de execução (ESC-19).
 *
 * ## Por que uma leitura só, e não uma por chave
 *
 * A tabela é minúscula e lida no caminho quente — a busca consulta uma flag
 * por requisição. Uma consulta por chave multiplicaria idas ao banco pelo
 * número de flags que a requisição tocar. Aqui a tabela inteira vira um
 * registro em cache sob UMA chave, e ler a segunda flag é acesso a objeto.
 *
 * ## Por que o cache compartilhado
 *
 * Em serverless o cache em memória é por instância: com vinte instâncias
 * quentes, desligar uma flag levaria até vinte leituras diferentes para
 * propagar. O `createSharedCache` usa Redis/KV quando existe credencial e cai
 * em memória quando não existe — o mesmo padrão dos catálogos. Cabe aqui
 * porque configuração é dado global: nada nesta tabela deriva de sessão.
 *
 * ## Propagação
 *
 * Gravar invalida o cache local de quem gravou; as demais instâncias veem o
 * valor novo em até `APP_CONFIG_TTL_MS`. Um minuto para desarmar uma flag é aceitável e
 * é o preço de não consultar o banco a cada requisição. Quem precisar de
 * efeito imediato tem o mesmo recurso de sempre: um deploy.
 *
 * ## Falha
 *
 * Erro de banco, JSON corrompido, chave desconhecida — tudo cai no padrão do
 * registro, que é o comportamento atual de produção. Falha de leitura NÃO é
 * cacheada: se fosse, uma indisponibilidade de trinta segundos travaria a
 * configuração em padrão por um minuto inteiro depois de o banco voltar,
 * justamente quando alguém está tentando mexer numa flag.
 *
 * ## Por que este arquivo não importa o banco
 *
 * A lógica que decide o que acontece quando a leitura falha precisa ser
 * exercitável sem banco nenhum. Quem liga o cano é `db-source.ts`.
 */

export const APP_CONFIG_TTL_MS = 60_000

/** Chave única: o registro inteiro cabe em um valor. */
const CHAVE_REGISTRO = 'todas'

/**
 * O que veio do banco, antes de virar configuração. Chave desconhecida já é
 * descartada na leitura, então só sobram chaves do registro — mas o VALOR
 * continua `unknown`: é justamente o que o esquema de cada chave decide.
 */
export type RegistroBruto = Partial<Record<AppConfigKey, unknown>>

export type AppConfigEntrada<K extends AppConfigKey = AppConfigKey> = {
  key: K
  valor: AppConfigValue<K>
  padrao: AppConfigValue<K>
  /** Há linha no banco com valor válido e diferente do padrão de código. */
  sobrescrito: boolean
  publico: boolean
  descricao: string
}

export type AppConfigStore = {
  get<K extends AppConfigKey>(key: K): Promise<AppConfigValue<K>>
  getPublic(): Promise<AppConfigPublico>
  /** Descarta o cache local. Chamado depois de gravar. */
  invalidate(): void
}

/**
 * Resolve o registro cru inteiro contra o catálogo, marcando o que é desvio e
 * o que é padrão.
 *
 * Função pura e fora do store de propósito: o painel interno precisa da
 * resolução, mas NÃO do cache — a pergunta dele é "o que está gravado depois
 * que eu salvei", e servir cache ali mostraria o valor antigo da instância
 * que ainda não expirou.
 */
export function montarEntradasAppConfig(
  bruto: RegistroBruto
): AppConfigEntrada[] {
  return (Object.keys(APP_CONFIG_DEFINITIONS) as AppConfigKey[]).map((key) => {
    const { valor, sobrescrito } = resolverAppConfig(bruto, key)
    const definicao = APP_CONFIG_DEFINITIONS[key]
    return {
      key,
      valor,
      padrao: appConfigDefault(key),
      sobrescrito,
      publico: definicao.publico,
      descricao: definicao.descricao
    }
  })
}

function resolverAppConfig<K extends AppConfigKey>(
  bruto: RegistroBruto,
  key: K
): { valor: AppConfigValue<K>; sobrescrito: boolean } {
  if (!Object.hasOwn(bruto, key)) {
    return { valor: appConfigDefault(key), sobrescrito: false }
  }
  const analisado = parseAppConfigValue(key, bruto[key])
  if (analisado === null) {
    return { valor: appConfigDefault(key), sobrescrito: false }
  }
  return { valor: analisado, sobrescrito: true }
}

export function createAppConfigStore(deps: {
  carregar: () => Promise<RegistroBruto>
  cache: TtlCache<RegistroBruto>
}): AppConfigStore {
  async function registro(): Promise<RegistroBruto> {
    try {
      return await deps.cache.get(CHAVE_REGISTRO, deps.carregar)
    } catch {
      // Sem linha em cache: a próxima requisição tenta o banco de novo.
      return {}
    }
  }

  return {
    async get(key) {
      return resolverAppConfig(await registro(), key).valor
    },

    async getPublic() {
      const bruto = await registro()
      const saida: Record<string, unknown> = {}
      for (const key of PUBLIC_APP_CONFIG_KEYS) {
        saida[key] = resolverAppConfig(bruto, key).valor
      }
      // Único ponto de conversão: o laço percorre exatamente as chaves que o
      // tipo declara, então o formato bate — o compilador é que não consegue
      // provar isso a partir de um laço.
      return saida as AppConfigPublico
    },

    invalidate() {
      deps.cache.clear()
    }
  }
}
