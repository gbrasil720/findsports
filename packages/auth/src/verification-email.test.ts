import { describe, expect, it } from 'bun:test'
import {
  createVerificationEmail,
  sendEmailWithResend,
  sendVerificationEmailWithResend
} from './verification-email'

describe('e-mail de verificação Onside', () => {
  it('mantém a identidade visual, CTA e alternativa em texto', () => {
    const email = createVerificationEmail({
      name: 'Ana',
      verificationUrl: 'https://onside.app/api/auth/verify-email?token=abc',
      logoUrl: 'https://onside.app/onside-wordmark-paper.png',
      heroImageUrl: 'https://onside.app/og-image.jpg'
    })
    expect(email.html).toContain('#12120f')
    expect(email.html).toContain('#c9f135')
    expect(email.html).toContain('Confirmar meu e-mail')
    expect(email.html).toContain('onside-wordmark-paper.png')
    expect(email.html).toContain('og-image.jpg')
    expect(email.html).toContain('O que acontece agora')
    expect(email.html).toContain('copie e cole este endereço')
    expect(email.text).toContain('https://onside.app/api/auth/verify-email')
    expect(email.text).toContain('• Por segurança, este link expira em 1 hora.')
  })

  it('escapa conteúdo controlável no HTML', () => {
    const email = createVerificationEmail({
      name: '<img src=x>',
      verificationUrl: 'https://onside.app/verify?a=1&b=2',
      logoUrl: 'https://onside.app/logo.png',
      heroImageUrl: 'https://onside.app/hero.jpg?a=1&b=2'
    })
    expect(email.html).not.toContain('<img src=x>')
    expect(email.html).toContain('&lt;img src=x&gt;')
    expect(email.html).toContain('a=1&amp;b=2')
    expect(email.html).not.toContain('hero.jpg?a=1&b=2')
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
      heroImageUrl: 'https://onside.app/og-image.jpg',
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

  it('marca o envio como delivered quando o Resend aceita', async () => {
    expect(
      await sendEmailWithResend({
        apiKey: 're_test',
        fromEmail: 'contato@onside.app',
        to: 'ana@example.com',
        subject: 'ok',
        html: '<p>ok</p>',
        text: 'ok',
        fetcher: async () => new Response('{}', { status: 200 })
      })
    ).toEqual({ delivered: true })
  })

  it('em desenvolvimento, ausência de Resend não quebra o envio', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const warn = console.warn
    const warnings: unknown[] = []
    console.warn = (...args: unknown[]) => {
      warnings.push(args)
    }
    try {
      const result = await sendEmailWithResend({
        apiKey: undefined,
        fromEmail: undefined,
        to: 'ana@example.com',
        subject: 'Confirme seu e-mail',
        html: '<p>Olá</p>',
        text: 'Olá\n\nhttps://onside.app/confirm-waitlist?token=abc',
        fetcher: async () => {
          throw new Error('não deveria chamar o Resend')
        }
      })
      expect(result).toEqual({ delivered: false })
      expect(String(warnings[0])).toContain(
        'https://onside.app/confirm-waitlist?token=abc'
      )
    } finally {
      console.warn = warn
      process.env.NODE_ENV = previous
    }
  })

  it('em produção, ausência de Resend continua sendo erro', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      await expect(
        sendEmailWithResend({
          apiKey: undefined,
          fromEmail: undefined,
          to: 'ana@example.com',
          subject: 'Confirme seu e-mail',
          html: '<p>Olá</p>',
          text: 'Olá',
          fetcher: async () => {
            throw new Error('não deveria chamar o Resend')
          }
        })
      ).rejects.toThrow('Resend não configurado para envio de e-mail.')
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('repassa a chave idempotente para campanhas', async () => {
    let request: Request | undefined
    await sendEmailWithResend({
      apiKey: 're_test',
      fromEmail: 'contato@onside.app',
      to: 'ana@example.com',
      subject: 'Onside aberta',
      html: '<p>Olá</p>',
      text: 'Olá',
      idempotencyKey: 'waitlist-launch-entry-1',
      fetcher: async (input, init) => {
        request = new Request(input, init)
        return new Response('{}', { status: 200 })
      }
    })
    expect(request?.headers.get('idempotency-key')).toBe(
      'waitlist-launch-entry-1'
    )
  })
})
