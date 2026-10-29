import { describe, expect, it } from 'bun:test'
import {
  createResetPasswordEmail,
  sendResetPasswordEmail
} from './reset-password-email'
import { publicEmailUrl } from './verification-email'

describe('e-mail de redefinição de senha', () => {
  it('mantém a marca, o CTA e a alternativa em texto', () => {
    const email = createResetPasswordEmail({
      name: 'Ana',
      resetUrl:
        'https://onside.app/api/auth/reset-password/abc?callbackURL=%2Freset-password'
    })

    expect(email.subject).toBe('Redefina a senha da sua conta Onside')
    expect(email.html).toContain('#12120f')
    expect(email.html).toContain('#c9f135')
    expect(email.html).toContain('Definir nova senha')
    expect(email.html).toContain('alt="Onside"')
    expect(email.html).toContain('copie e cole este endereço')
    expect(email.text).toContain(
      'https://onside.app/api/auth/reset-password/abc'
    )
    expect(email.text).toContain(
      '• Por segurança, este link expira em 30 minutos.'
    )
  })

  it('declara uso único, prazo e queda das sessões — o que o fluxo garante', () => {
    const email = createResetPasswordEmail({
      name: 'Ana',
      resetUrl: 'https://onside.app/api/auth/reset-password/abc'
    })
    expect(email.text).toContain('uso único')
    expect(email.text).toContain('expira em 30 minutos')
    expect(email.text).toContain('sessões abertas são encerradas')
    // Quem não pediu a redefinição precisa saber que ignorar basta.
    expect(email.text).toContain('Se você não pediu para redefinir sua senha')
  })

  it('cai para um tratamento genérico quando o nome vem vazio', () => {
    const email = createResetPasswordEmail({
      name: '   ',
      resetUrl: 'https://onside.app/reset'
    })
    expect(email.text).toContain('Olá, torcedor.')
  })

  it('escapa conteúdo controlável no HTML', () => {
    const email = createResetPasswordEmail({
      name: '<img src=x>',
      resetUrl: 'https://onside.app/reset?a=1&b=2'
    })
    expect(email.html).not.toContain('<img src=x>')
    expect(email.html).toContain('&lt;img src=x&gt;')
    expect(email.html).toContain('a=1&amp;b=2')
    expect(email.html).not.toContain('reset?a=1&b=2')
  })

  it('renderiza href e src somente no host público configurado', () => {
    const publicBaseUrl = 'https://www.onside.sh'
    const publicHost = new URL(publicBaseUrl).hostname
    // Reproduz o que o `sendResetPassword` faz: o better-auth monta a URL com
    // o host de BETTER_AUTH_URL (localhost em dev) e `publicEmailUrl` a
    // reescreve para o host público antes de ir para a caixa de entrada.
    const email = createResetPasswordEmail({
      name: 'Ana',
      resetUrl: publicEmailUrl(
        'http://localhost:3001/api/auth/reset-password/abc?callbackURL=%2Freset-password',
        publicBaseUrl,
        'http://localhost:3001'
      )
    })
    const urls = [...email.html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map(
      (match) => (match[1] ?? '').replaceAll('&amp;', '&')
    )

    expect(urls).toHaveLength(3)
    expect(email.html).not.toContain('localhost')
    for (const value of urls) {
      expect(new URL(value).hostname).toBe(publicHost)
    }
    // O callbackURL precisa sobreviver à reescrita de host, senão o link do
    // e-mail redireciona para o `/error` do better-auth em vez da tela nova.
    expect(email.html).toContain('callbackURL=%2Freset-password')
  })

  it('envia HTML e texto pela API de e-mail sem expor a chave no corpo', async () => {
    let request: Request | undefined
    await sendResetPasswordEmail({
      apiKey: 're_test',
      fromEmail: 'contato@onside.app',
      to: 'ana@example.com',
      name: 'Ana',
      resetUrl: 'https://onside.app/api/auth/reset-password/abc',
      fetcher: async (input, init) => {
        request = new Request(input, init)
        return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 })
      }
    })

    expect(request?.url).toBe('https://api.millionsend.com/emails')
    expect(request?.headers.get('authorization')).toBe('Bearer re_test')
    const body = (await request?.json()) as { subject?: string }
    expect(body).toMatchObject({
      from: 'Onside <contato@onside.app>',
      to: ['ana@example.com'],
      subject: 'Redefina a senha da sua conta Onside'
    })
    expect(JSON.stringify(body)).not.toContain('re_test')
  })
})
