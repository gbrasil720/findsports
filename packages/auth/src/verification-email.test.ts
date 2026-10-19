import { describe, expect, it } from 'bun:test'
import {
  createVerificationEmail,
  publicEmailUrl,
  sendEmailWithResend,
  sendVerificationEmailWithResend
} from './verification-email'

describe('e-mail de verificação Onside', () => {
  it('move o link de autenticação para o host público do e-mail', () => {
    expect(
      publicEmailUrl(
        'http://localhost:3001/api/auth/verify-email?token=abc',
        'https://www.onside.sh',
        'http://localhost:3001'
      )
    ).toBe('https://www.onside.sh/api/auth/verify-email?token=abc')
  })

  it('mantém a marca, o CTA e a alternativa em texto', () => {
    const email = createVerificationEmail({
      name: 'Ana',
      verificationUrl: 'https://onside.app/api/auth/verify-email?token=abc'
    })
    expect(email.subject).toBe('Confirme seu e-mail para entrar em campo')
    expect(email.html).toContain('#12120f')
    expect(email.html).toContain('#c9f135')
    expect(email.html).toContain('alt="Onside"')
    expect(email.html).toContain('Confirmar meu e-mail')
    expect(email.html).toContain('copie e cole este endereço')
    expect(email.text).toContain(
      'Olá, Ana. Falta um passo para entrar em campo'
    )
    expect(email.text).toContain(
      'Confirmar meu e-mail:\nhttps://onside.app/api/auth/verify-email?token=abc'
    )
    expect(email.text).toContain('• Por segurança, este link expira em 1 hora.')
    // Serve a quem se cadastrou pelo app e pelo site.
    expect(email.text).toContain('pelo app, ele volta para o app')
  })

  it('escapa conteúdo controlável no HTML', () => {
    const email = createVerificationEmail({
      name: '<img src=x>',
      verificationUrl: 'https://onside.app/verify?a=1&b=2'
    })
    expect(email.html).not.toContain('<img src=x>')
    expect(email.html).toContain('&lt;img src=x&gt;')
    expect(email.html).toContain('a=1&amp;b=2')
    expect(email.html).not.toContain('verify?a=1&b=2')
  })

  it('renderiza href e src somente no host público configurado', () => {
    const publicBaseUrl = 'https://www.onside.sh'
    const publicHost = new URL(publicBaseUrl).hostname
    const email = createVerificationEmail({
      name: 'Ana',
      verificationUrl: new URL('/verify?token=abc', publicBaseUrl).toString()
    })
    const urls = [...email.html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(
      (match) => (match[1] ?? '').replaceAll('&amp;', '&')
    )

    // Wordmark, botão e link em texto: nenhum outro destino.
    expect(urls).toHaveLength(3)
    expect(email.html).not.toContain('localhost')
    for (const value of urls) {
      expect(new URL(value).hostname).toBe(publicHost)
    }
  })

  it('envia HTML e texto pela API do Resend sem expor a chave no corpo', async () => {
    let request: Request | undefined
    await sendVerificationEmailWithResend({
      apiKey: 're_test',
      fromEmail: 'contato@onside.app',
      to: 'ana@example.com',
      name: 'Ana',
      verificationUrl: 'https://onside.app/verify',
      fetcher: async (input, init) => {
        request = new Request(input, init)
        return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 })
      }
    })

    expect(request?.url).toBe('https://api.resend.com/emails')
    expect(request?.headers.get('authorization')).toBe('Bearer re_test')
    const body = (await request?.json()) as { text: string; html: string }
    expect(body).toMatchObject({
      from: 'Onside <contato@onside.app>',
      to: ['ana@example.com'],
      reply_to: 'contato@onside.sh',
      subject: 'Confirme seu e-mail para entrar em campo'
    })
    expect(body.text).toContain('https://onside.app/verify')
    expect(body.html).toContain('https://onside.app/verify')
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

  it('manda Reply-To próprio e anexos em base64 quando quem chama pede', async () => {
    let body: Record<string, unknown> | undefined
    await sendEmailWithResend({
      apiKey: 're_test',
      fromEmail: 'contato@onside.app',
      to: 'contato@onside.sh',
      replyTo: 'ana@example.com',
      subject: 'ok',
      html: '<p>ok</p>',
      text: 'ok',
      attachments: [
        { filename: 'imagem-1.png', contentType: 'image/png', content: 'AAAA' }
      ],
      fetcher: async (_input, init) => {
        body = JSON.parse(String(init?.body))
        return new Response('{}', { status: 200 })
      }
    })
    expect(body).toMatchObject({
      to: ['contato@onside.sh'],
      reply_to: 'ana@example.com',
      attachments: [
        { filename: 'imagem-1.png', content_type: 'image/png', content: 'AAAA' }
      ]
    })
  })

  it('com EMAIL_DELIVERY=console, o log lista os anexos sem o conteúdo', async () => {
    process.env.EMAIL_DELIVERY = 'console'
    const log = console.log
    const lines: unknown[] = []
    console.log = (...args: unknown[]) => {
      lines.push(args)
    }
    const content = Buffer.from('conteúdo-que-não-vai-ao-log').toString(
      'base64'
    )
    try {
      await sendEmailWithResend({
        apiKey: 're_real',
        fromEmail: 'contato@onside.app',
        to: 'contato@onside.sh',
        replyTo: 'ana@example.com',
        subject: 'ok',
        html: '<p>ok</p>',
        text: 'ok',
        attachments: [
          { filename: 'imagem-1.png', contentType: 'image/png', content }
        ]
      })
      const logged = String(lines[0])
      expect(logged).toContain('Reply-To: ana@example.com')
      expect(logged).toContain('Anexos (1): imagem-1.png (image/png, 29 bytes)')
      expect(logged).not.toContain(content)
    } finally {
      console.log = log
      delete process.env.EMAIL_DELIVERY
    }
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
        text: 'Olá\n\nhttps://onside.app/verify-email?token=abc',
        fetcher: async () => {
          throw new Error('não deveria chamar o Resend')
        }
      })
      expect(result).toEqual({ delivered: false })
      expect(String(warnings[0])).toContain(
        'https://onside.app/verify-email?token=abc'
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

  it('com EMAIL_DELIVERY=console (preview), loga o link mesmo em produção e com chave', async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    process.env.EMAIL_DELIVERY = 'console'
    const log = console.log
    const lines: unknown[] = []
    console.log = (...args: unknown[]) => {
      lines.push(args)
    }
    try {
      const result = await sendEmailWithResend({
        apiKey: 're_real',
        fromEmail: 'contato@onside.app',
        to: 'ana@example.com',
        subject: 'Confirme seu e-mail',
        html: '<p>Olá</p>',
        text: 'Olá\n\nhttps://preview.example/verify?token=abc',
        fetcher: async () => {
          throw new Error('não deveria chamar o Resend')
        }
      })
      expect(result).toEqual({ delivered: true })
      expect(String(lines[0])).toContain(
        'https://preview.example/verify?token=abc'
      )
    } finally {
      console.log = log
      process.env.NODE_ENV = previous
      delete process.env.EMAIL_DELIVERY
    }
  })
})
