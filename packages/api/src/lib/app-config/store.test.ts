import { describe, expect, it } from 'bun:test'

import { createTtlCache } from '../ttl-cache'
import {
  APP_CONFIG_KEYS,
  appConfigDefault,
  PUBLIC_APP_CONFIG_KEYS
} from './registry'
import {
  createAppConfigStore,
  montarEntradasAppConfig,
  type RegistroBruto
} from './store'

function relogioFalso(inicio = 0) {
  let agora = inicio
  return {
    now: () => agora,
    avancar: (ms: number) => {
      agora += ms
    }
  }
}

function montar(
  respostas: (() => Promise<RegistroBruto>)[],
  now?: () => number
) {
  let chamadas = 0
  const store = createAppConfigStore({
    carregar: async () => {
      const resposta = respostas[Math.min(chamadas, respostas.length - 1)]
      chamadas++
      if (!resposta) throw new Error('sem resposta configurada')
      return resposta()
    },
    cache: createTtlCache<RegistroBruto>({
      ttlMs: 60_000,
      maxEntries: 1,
      now
    })
  })
  return {
    store,
    chamadas: () => chamadas
  }
}

const vazio = async () => ({})

describe('leitura da configuração (ESC-19)', () => {
  it('sem linha no banco entrega o padrão', async () => {
    const { store } = montar([vazio])
    expect(await store.get('search.tiered_plan_query')).toBe(
      appConfigDefault('search.tiered_plan_query')
    )
    expect(await store.get('launch.pub_cities')).toEqual([])
  })

  it('linha válida sobrescreve o padrão', async () => {
    const { store } = montar([
      async () => ({
        'search.tiered_plan_query': false,
        'launch.pub_cities': ['Recife', 'Olinda']
      })
    ])
    expect(await store.get('search.tiered_plan_query')).toBe(false)
    expect(await store.get('launch.pub_cities')).toEqual(['Recife', 'Olinda'])
  })

  /**
   * Linha inserida à mão, migration mal feita, tipo trocado — nada disso pode
   * derrubar a requisição que só queria ler uma flag. Cair no padrão é cair
   * no comportamento de produção.
   */
  it('valor malformado cai no padrão em vez de lançar', async () => {
    const { store } = montar([
      async () => ({
        'search.tiered_plan_query': 'talvez',
        'waitlist.rate_limit': { enabled: true, ip: { max: 0 } }
      })
    ])
    expect(await store.get('search.tiered_plan_query')).toBe(true)
    expect(await store.get('waitlist.rate_limit')).toEqual(
      appConfigDefault('waitlist.rate_limit')
    )
  })

  it('banco indisponível entrega o padrão', async () => {
    const { store } = montar([
      async () => {
        throw new Error('connection refused')
      }
    ])
    expect(await store.get('billing.checkout_enabled')).toBe(false)
    expect(await store.get('launch.pub_cities')).toEqual([])
  })

  /**
   * Falha NÃO pode ser cacheada. Se fosse, uma indisponibilidade de segundos
   * travaria a configuração em padrão por um TTL inteiro depois de o banco
   * voltar — justo quando alguém está tentando desarmar uma flag.
   */
  it('falha não fica em cache: a leitura seguinte tenta de novo', async () => {
    const { store, chamadas } = montar([
      async () => {
        throw new Error('connection refused')
      },
      async () => ({ 'billing.checkout_enabled': true })
    ])

    expect(await store.get('billing.checkout_enabled')).toBe(false)
    expect(await store.get('billing.checkout_enabled')).toBe(true)
    expect(chamadas()).toBe(2)
  })

  it('lê uma vez por TTL, não uma vez por chave', async () => {
    const relogio = relogioFalso()
    const { store, chamadas } = montar(
      [async () => ({ 'search.tiered_plan_query': false })],
      relogio.now
    )

    await store.get('search.tiered_plan_query')
    await store.get('billing.checkout_enabled')
    await store.get('launch.pub_cities')
    expect(chamadas()).toBe(1)

    relogio.avancar(60_001)
    await store.get('search.tiered_plan_query')
    expect(chamadas()).toBe(2)
  })

  it('invalidate força releitura antes do TTL', async () => {
    const relogio = relogioFalso()
    const { store, chamadas } = montar(
      [
        async () => ({ 'billing.checkout_enabled': false }),
        async () => ({ 'billing.checkout_enabled': true })
      ],
      relogio.now
    )

    expect(await store.get('billing.checkout_enabled')).toBe(false)
    store.invalidate()
    expect(await store.get('billing.checkout_enabled')).toBe(true)
    expect(chamadas()).toBe(2)
  })

  it('getPublic devolve só o que o registro marcou como público', async () => {
    const { store } = montar([
      async () => ({
        'search.tiered_plan_query': false,
        'billing.checkout_enabled': true,
        'launch.pub_cities': ['Recife']
      })
    ])

    const publico = await store.getPublic()

    // As públicas saem, com valor gravado ou com padrão.
    expect(publico['billing.checkout_enabled']).toBe(true)
    expect(publico['launch.pub_cities']).toEqual(['Recife'])
    expect(publico['launch.waitlist_gate']).toEqual({
      signup: false
    })

    // As internas não saem — nem as que têm valor gravado.
    expect(Object.hasOwn(publico, 'search.tiered_plan_query')).toBe(false)
    expect(Object.hasOwn(publico, 'waitlist.rate_limit')).toBe(false)

    // Nenhuma chave a mais do que o registro marcou.
    expect(Object.keys(publico).sort()).toEqual(
      [...PUBLIC_APP_CONFIG_KEYS].sort()
    )
  })

  it('não guarda dado de sessão: só chaves do catálogo saem da leitura', async () => {
    const { store } = montar([
      async () =>
        ({
          'billing.checkout_enabled': true,
          // Chave fora do catálogo — o carregador do banco já a descarta, mas a
          // resolução não pode reintroduzi-la nem por acidente.
          'algo.injetado': 'valor'
        }) as RegistroBruto
    ])

    const publico = await store.getPublic()
    expect(publico['billing.checkout_enabled']).toBe(true)
    expect(Object.keys(publico).sort()).toEqual(
      [...PUBLIC_APP_CONFIG_KEYS].sort()
    )
    expect(Object.hasOwn(publico, 'algo.injetado')).toBe(false)
  })
})

/**
 * A montagem das entradas é pura e vive fora do store de propósito: o painel
 * interno precisa da resolução, mas nunca do cache. Ele lê direto do banco,
 * porque a pergunta dele é "o que está gravado depois que eu salvei".
 */
describe('montagem das entradas para o painel (ESC-19)', () => {
  it('marca o que é desvio e o que é padrão', () => {
    const entradas = montarEntradasAppConfig({
      'billing.checkout_enabled': true,
      // Malformado: não conta como desvio, porque não é o que vai valer.
      'launch.pub_cities': 'Recife'
    })
    const porChave = new Map(entradas.map((entrada) => [entrada.key, entrada]))

    expect(porChave.get('billing.checkout_enabled')).toMatchObject({
      valor: true,
      padrao: false,
      sobrescrito: true
    })
    expect(porChave.get('launch.pub_cities')).toMatchObject({
      valor: [],
      sobrescrito: false
    })
    expect(porChave.get('search.tiered_plan_query')).toMatchObject({
      valor: true,
      sobrescrito: false
    })
  })

  it('devolve toda chave do catálogo, mesmo sem linha gravada', () => {
    const entradas = montarEntradasAppConfig({})
    expect(entradas.map((entrada) => entrada.key).sort()).toEqual(
      [...APP_CONFIG_KEYS].sort()
    )
    expect(entradas.every((entrada) => !entrada.sobrescrito)).toBe(true)
  })
})
