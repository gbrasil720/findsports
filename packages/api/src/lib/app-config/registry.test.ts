import { describe, expect, it } from 'bun:test'

import {
  APP_CONFIG_DEFINITIONS,
  APP_CONFIG_KEYS,
  appConfigDefault,
  isAppConfigKey,
  PUBLIC_APP_CONFIG_KEYS,
  parseAppConfigValue,
  validateAppConfigValue
} from './registry'

describe('registro de configuração (ESC-19)', () => {
  /**
   * A garantia que sustenta todo o resto: leitura que falha cai no padrão. Um
   * padrão que o próprio esquema recusa transformaria isso em silêncio — a
   * chave nunca funcionaria e nada apontaria para o motivo.
   */
  it('todo padrão passa no próprio esquema', () => {
    for (const key of APP_CONFIG_KEYS) {
      const padrao = appConfigDefault(key)
      expect(APP_CONFIG_DEFINITIONS[key].schema.safeParse(padrao).success).toBe(
        true
      )
    }
  })

  it('só reconhece chave declarada', () => {
    expect(isAppConfigKey('search.tiered_plan_query')).toBe(true)
    expect(isAppConfigKey('search.whatever')).toBe(false)
    // Nome herdado de Object.prototype não pode virar chave.
    expect(isAppConfigKey('toString')).toBe(false)
    expect(isAppConfigKey('__proto__')).toBe(false)
  })

  it('parse devolve null em vez de lançar quando o valor não casa', () => {
    expect(parseAppConfigValue('search.tiered_plan_query', 'sim')).toBeNull()
    expect(parseAppConfigValue('search.tiered_plan_query', true)).toBe(true)
    expect(parseAppConfigValue('launch.pub_cities', 'São Paulo')).toBeNull()
    expect(parseAppConfigValue('launch.pub_cities', ['Recife'])).toEqual([
      'Recife'
    ])
  })

  /**
   * WEB-232 e WEB-233: entrada por convite e cobrança saíram do registro. As
   * três chaves de cobrança viraram regra fixa do produto, mas as linhas
   * delas continuam gravadas em `app_config` até a migration de limpeza.
   * Chave fora do registro não existe para a aplicação.
   */
  it('o registro tem só as três chaves que ficam', () => {
    expect([...APP_CONFIG_KEYS].sort()).toEqual([
      'launch.pub_cities',
      'rating.public_display',
      'search.tiered_plan_query'
    ])
    for (const key of [
      'checkout_enabled',
      'onboarding_trial',
      'founder_coupon'
    ]) {
      expect(isAppConfigKey(`billing.${key}`)).toBe(false)
    }
  })

  // Quem lê a recusa é o administrador no painel: português, campo e limite.
  it('motivo da recusa sai em português, com o campo e o limite', () => {
    const motivo = (valor: unknown) => {
      const resultado = validateAppConfigValue('launch.pub_cities', valor)
      return resultado.ok ? null : resultado.erro
    }

    expect(motivo(['x'.repeat(101)])).toBe(
      '0: Grande demais: esperava que o texto tivesse <= 100 caracteres'
    )
    expect(motivo(['Recife', 'a'])).toBe(
      '1: Pequeno demais: esperava que o texto tivesse >= 2 caracteres'
    )
    expect(motivo('Recife')).toBe(
      'Entrada inválida: esperava um vetor, recebeu um texto'
    )
    expect(validateAppConfigValue('rating.public_display', 'sim')).toEqual({
      ok: false,
      erro: 'Entrada inválida: esperava um valor booleano, recebeu um texto'
    })
  })

  it('a tradução da recusa não muda o que é validado nem a leitura', () => {
    const noLimite = ['x'.repeat(100)]
    expect(validateAppConfigValue('launch.pub_cities', noLimite)).toEqual({
      ok: true,
      value: noLimite
    })
    expect(
      parseAppConfigValue('launch.pub_cities', ['x'.repeat(101)])
    ).toBeNull()
  })

  it('subconjunto público não inclui chave interna', () => {
    expect(PUBLIC_APP_CONFIG_KEYS).toContain('rating.public_display')
    expect(PUBLIC_APP_CONFIG_KEYS).toContain('launch.pub_cities')
    expect(PUBLIC_APP_CONFIG_KEYS).not.toContain('search.tiered_plan_query')
  })

  /**
   * Trava os padrões que precisam ser o comportamento de hoje. Se alguém
   * inverter um deles, a mudança passa a valer sem ninguém tocar no banco —
   * exatamente o que este desenho existe para impedir.
   */
  it('padrões reproduzem o comportamento anterior às flags', () => {
    expect(appConfigDefault('search.tiered_plan_query')).toBe(true)
    expect(appConfigDefault('launch.pub_cities')).toEqual([])
    expect(appConfigDefault('rating.public_display')).toBe(false)
  })
})
