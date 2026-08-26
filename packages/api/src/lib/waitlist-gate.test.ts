import { describe, expect, it } from 'bun:test'
import {
  acaoDeEntrada,
  decidirEntrada,
  ehLoginEmail,
  emailDaRequisicao,
  respostaAdmissaoIndisponivel,
  respostaPortaoFechado
} from './waitlist-gate'

describe('admissão da waitlist', () => {
  it('intercepta somente cadastro', () => {
    expect(acaoDeEntrada('https://onside.app/api/auth/sign-up/email')).toBe(
      'signup'
    )
    for (const path of [
      '/api/auth/sign-in/email',
      '/api/auth/sign-out',
      '/api/auth/get-session',
      '/api/auth/forget-password',
      '/api/auth/dodopayments/webhooks'
    ]) {
      expect(acaoDeEntrada(`https://onside.app${path}`)).toBeNull()
    }
    expect(ehLoginEmail('https://onside.app/api/auth/sign-in/email')).toBe(true)
    expect(ehLoginEmail('/api/auth/sign-up/email')).toBe(false)
  })

  it('o painel persistido abre ou fecha sem depender de novo deploy', () => {
    expect(
      decidirEntrada({
        fechadoEmRuntime: false,
        aprovado: false
      })
    ).toEqual({ permitido: true })
    expect(
      decidirEntrada({
        fechadoEmRuntime: true,
        aprovado: false
      }).permitido
    ).toBe(false)
    expect(
      decidirEntrada({
        fechadoEmRuntime: false,
        aprovado: false
      })
    ).toEqual({ permitido: true })
    expect(
      decidirEntrada({
        fechadoEmRuntime: false,
        aprovado: true
      })
    ).toEqual({ permitido: true })
  })

  it('normaliza o e-mail sem consumir a requisição original', async () => {
    const original = new Request('https://onside.app/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email: '  Fan@Exemplo.COM ' })
    })
    expect(await emailDaRequisicao(original.clone())).toBe('fan@exemplo.com')
    expect(original.bodyUsed).toBe(false)
    expect(await emailDaRequisicao({ json: async () => ({ email: 42 }) })).toBe(
      null
    )
  })

  it('responde sem cache e falha fechada quando a consulta cai', async () => {
    const blocked = respostaPortaoFechado('Acesso ainda não liberado.')
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('cache-control')).toBe('no-store')

    const unavailable = respostaAdmissaoIndisponivel()
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toMatchObject({
      code: 'ADMISSION_CHECK_UNAVAILABLE'
    })
  })
})
