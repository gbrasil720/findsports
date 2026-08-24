import { describe, expect, it } from 'bun:test'
import {
  createVerificationEmail,
  sendVerificationEmailWithResend
} from './verification-email'

describe('e-mail de verificação Onside', () => {
  it('mantém a identidade visual, CTA e alternativa em texto', () => {
    const email = createVerificationEmail({
      name: 'Ana',
      verificationUrl: 'https://onside.app/api/auth/verify-email?token=abc',
      logoUrl: 'https://onside.app/onside-wordmark-paper.png'
    })
    expect(email.html).toContain('#12120f')
    expect(email.html).toContain('#c9f135')
    expect(email.html).toContain('Confirmar meu e-mail')
    expect(email.html).toContain('onside-wordmark-paper.png')
    expect(email.text).toContain('https://onside.app/api/auth/verify-email')
  })

  it('escapa conteúdo controlável no HTML', () => {
    const email = createVerificationEmail({
      name: '<img src=x>',
      verificationUrl: 'https://onside.app/verify?a=1&b=2',
      logoUrl: 'https://onside.app/logo.png'
    })
    expect(email.html).not.toContain('<img src=x>')
    expect(email.html).toContain('&lt;img src=x&gt;')
    expect(email.html).toContain('a=1&amp;b=2')
  })

  it('envia HTML e texto pela API do Resend sem expor a chave no corpo', async () => {
    let request: Request | undefined
    await sendVerificationEmailWithResend({
      apiKey: 're_test',
      fromEmail: 'contato@onside.app',
      to: 'ana@example.com',
      name: 'Ana',
      verificationUrl: 'https://onside.app/verify',
      logoUrl: 'https://onside.app/logo.png',
      fetcher: async (input, init) => {
        request = new Request(input, init)
        return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 })
      }
    })

    expect(request?.url).toBe('https://api.resend.com/emails')
    expect(request?.headers.get('authorization')).toBe('Bearer re_test')
    const body = await request?.json()
    expect(body).toMatchObject({
      from: 'Onside <contato@onside.app>',
      to: ['ana@example.com']
    })
    expect(JSON.stringify(body)).not.toContain('re_test')
  })
})
