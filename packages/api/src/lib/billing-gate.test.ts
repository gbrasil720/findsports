import { describe, expect, it } from 'bun:test'

import {
  ehAberturaDeCheckout,
  respostaCheckoutIndisponivel
} from './billing-gate'

describe('portão de abertura de checkout (ESC-19)', () => {
  it('reconhece as duas rotas de abertura', () => {
    expect(
      ehAberturaDeCheckout('https://onside.app/api/auth/dodopayments/checkout')
    ).toBe(true)
    expect(
      ehAberturaDeCheckout(
        'https://onside.app/api/auth/dodopayments/checkout-session'
      )
    ).toBe(true)
  })

  /**
   * O que NÃO pode ser bloqueado, e por quê:
   *
   *   - webhook: assinatura ativando é dinheiro real; perder o aviso deixa o
   *     banco mentindo sobre o que o cliente comprou;
   *   - portal e listagens: quem quer cancelar precisa conseguir cancelar,
   *     inclusive — principalmente — enquanto a contratação está fechada.
   */
  it('não pega webhook, portal nem listagens', () => {
    for (const caminho of [
      '/api/auth/dodopayments/webhooks',
      '/api/auth/dodopayments/customer/portal',
      '/api/auth/dodopayments/customer/subscriptions/list',
      '/api/auth/dodopayments/customer/payments/list',
      '/api/auth/sign-in/email',
      '/api/auth/get-session'
    ]) {
      expect(ehAberturaDeCheckout(`https://onside.app${caminho}`)).toBe(false)
    }
  })

  it('ignora query string e barra final', () => {
    expect(
      ehAberturaDeCheckout(
        'https://onside.app/api/auth/dodopayments/checkout/?slug=pro'
      )
    ).toBe(true)
    expect(
      ehAberturaDeCheckout('/api/auth/dodopayments/checkout-session?slug=pro')
    ).toBe(true)
  })

  it('aceita caminho relativo, sem host', () => {
    expect(ehAberturaDeCheckout('/api/auth/dodopayments/checkout')).toBe(true)
    expect(ehAberturaDeCheckout('/api/auth/dodopayments/webhooks')).toBe(false)
  })

  /**
   * 503 e não 403: não é este usuário que está proibido, é a contratação que
   * está fechada para todos e volta sem ele fazer nada.
   */
  it('responde 503 sem cache', async () => {
    const resposta = respostaCheckoutIndisponivel()
    expect(resposta.status).toBe(503)
    expect(resposta.headers.get('cache-control')).toBe('no-store')
    expect(await resposta.json()).toMatchObject({ code: 'CHECKOUT_DISABLED' })
  })
})
