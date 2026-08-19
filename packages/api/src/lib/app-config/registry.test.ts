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
   * O usuário deste registro é um administrador com pressa. Valor absurdo não
   * pode ser representável — em especial os que trancam gente do lado de fora.
   */
  it('recusa limite que trancaria todo mundo ou nunca expiraria', () => {
    const base = appConfigDefault('waitlist.rate_limit')

    expect(
      validateAppConfigValue('waitlist.rate_limit', {
        ...base,
        ip: { max: 0, windowMs: 60_000 }
      }).ok
    ).toBe(false)

    expect(
      validateAppConfigValue('waitlist.rate_limit', {
        ...base,
        ip: { max: 10, windowMs: 365 * 24 * 60 * 60 * 1_000 }
      }).ok
    ).toBe(false)

    expect(
      validateAppConfigValue('waitlist.rate_limit', {
        ...base,
        ip: { max: 200, windowMs: 60_000 }
      }).ok
    ).toBe(true)
  })

  it('erro de validação aponta o campo', () => {
    const resultado = validateAppConfigValue('waitlist.rate_limit', {
      enabled: true,
      ip: { max: 0, windowMs: 60_000 },
      email: { max: 3, windowMs: 60_000 }
    })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.erro).toContain('ip.max')
  })

  it('subconjunto público não inclui chave interna', () => {
    expect(PUBLIC_APP_CONFIG_KEYS).toContain('billing.checkout_enabled')
    expect(PUBLIC_APP_CONFIG_KEYS).toContain('launch.pub_cities')
    expect(PUBLIC_APP_CONFIG_KEYS).not.toContain('search.tiered_plan_query')
    expect(PUBLIC_APP_CONFIG_KEYS).not.toContain('waitlist.rate_limit')
  })

  /**
   * Trava os padrões que precisam ser o comportamento de hoje. Se alguém
   * inverter um deles, a mudança passa a valer sem ninguém tocar no banco —
   * exatamente o que este desenho existe para impedir.
   */
  it('padrões reproduzem o comportamento anterior às flags', () => {
    expect(appConfigDefault('search.tiered_plan_query')).toBe(true)
    expect(appConfigDefault('billing.checkout_enabled')).toBe(false)
    expect(appConfigDefault('launch.pub_cities')).toEqual([])
    expect(appConfigDefault('waitlist.rate_limit')).toEqual({
      enabled: true,
      ip: { max: 8, windowMs: 600_000 },
      email: { max: 3, windowMs: 600_000 }
    })
  })
})
