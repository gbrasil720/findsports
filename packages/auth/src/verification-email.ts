import { appendFile } from 'node:fs/promises'
import { env } from '@findsports_oficial/env/server'
import { createOnsideEmailTemplate } from './email-layout'

export { escapeHtml } from './email-layout'

type VerificationEmailInput = {
  name: string
  verificationUrl: string
}

type EmailFetcher = (input: string, init?: RequestInit) => Promise<Response>

export function publicEmailUrl(
  url: string,
  publicBaseUrl: string,
  authBaseUrl: string
) {
  const sourceUrl = new URL(url, authBaseUrl)
  return new URL(
    `${sourceUrl.pathname}${sourceUrl.search}${sourceUrl.hash}`,
    publicBaseUrl
  ).toString()
}

export function createVerificationEmail({
  name,
  verificationUrl
}: VerificationEmailInput) {
  const template = createOnsideEmailTemplate({
    heading: 'Confirme seu e-mail',
    intro: `Olá, ${name.trim() || 'torcedor'}. Falta um passo para entrar em campo: confirme que este endereço é seu para ativar sua conta na Onside.`,
    steps: [
      // Vale para os dois: pelo app o link volta para o app; pelo site, o
      // rascunho do cadastro de bar fica no navegador em que foi começado.
      'Abra o link no aparelho em que começou o cadastro: pelo app, ele volta para o app; pelo site, use o mesmo navegador.',
      'Depois da confirmação, você entra automaticamente e continua de onde parou.',
      'Por segurança, este link expira em 1 hora.'
    ],
    action: 'Confirmar meu e-mail',
    actionUrl: verificationUrl,
    note: 'Se você não criou uma conta na Onside, ignore esta mensagem. Sem abrir o link, nenhuma conta é confirmada.',
    reason:
      'Você recebeu este e-mail porque este endereço foi usado em um cadastro na Onside.'
  })

  return {
    subject: 'Confirme seu e-mail para entrar em campo',
    text: template.text,
    html: template.html
  }
}

export async function sendVerificationEmailWithResend(input: {
  apiKey: string | undefined
  fromEmail: string | undefined
  to: string
  name: string
  verificationUrl: string
  fetcher?: EmailFetcher
}): Promise<void> {
  const email = createVerificationEmail(input)
  await sendEmailWithResend({ ...input, ...email })
}

/**
 * O envio sai de `mail.onside.sh` (WEB-109), que não tem MX: resposta ao
 * remetente voltaria com bounce. As respostas vão para a caixa do Workspace.
 */
const REPLY_TO_EMAIL = 'contato@onside.sh'

/** `content` em base64, como a Resend recebe. */
export type EmailAttachment = {
  filename: string
  contentType: string
  content: string
}

export async function sendEmailWithResend(input: {
  apiKey: string | undefined
  fromEmail: string | undefined
  to: string
  subject: string
  html: string
  text: string
  /** Padrão: a caixa da Onside. O feedback responde para quem escreveu. */
  replyTo?: string
  attachments?: EmailAttachment[]
  fetcher?: EmailFetcher
}): Promise<{ delivered: boolean }> {
  const replyTo = input.replyTo ?? REPLY_TO_EMAIL
  // Outbox e log dizem que anexo saiu (nome, tipo, bytes), sem o conteúdo.
  const attachments = (input.attachments ?? []).map(
    ({ filename, contentType, content }) => ({
      filename,
      contentType,
      size: Buffer.byteLength(content, 'base64')
    })
  )
  const summary = [
    `To: ${input.to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${input.subject}`,
    ...(attachments.length
      ? [
          `Anexos (${attachments.length}): ${attachments.map((a) => `${a.filename} (${a.contentType}, ${a.size} bytes)`).join(', ')}`
        ]
      : []),
    '',
    input.text
  ].join('\n')

  // E2E (WEB-174): o e-mail vira uma linha JSON num arquivo, lida pelo
  // `lastEmailTo` da suíte. Conta como entregue para o fluxo seguir igual ao
  // de produção. Vem antes da Resend: nem uma chave real no .env sai daqui.
  if (env.E2E_EMAIL_OUTBOX) {
    const { to, subject, text, html } = input
    await appendFile(
      env.E2E_EMAIL_OUTBOX,
      `${JSON.stringify({ to, replyTo, subject, text, html, attachments, sentAt: new Date().toISOString() })}\n`
    )
    return { delivered: true }
  }

  // Preview (EMAIL_DELIVERY=console, validada em packages/env): o link no
  // log é como se testa lá. Lida do process.env, como o NODE_ENV abaixo.
  if (process.env.EMAIL_DELIVERY === 'console') {
    console.log(`[email] EMAIL_DELIVERY=console, não enviado.\n${summary}`)
    return { delivered: true }
  }

  if (!input.apiKey || !input.fromEmail) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Resend não configurado para envio de e-mail.')
    }
    console.warn(
      `[email] Resend não configurado. E-mail não enviado.\n${summary}`
    )
    return { delivered: false }
  }

  const response = await (input.fetcher ?? fetch)(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: `Onside <${input.fromEmail}>`,
        to: [input.to],
        reply_to: replyTo,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.attachments?.length
          ? {
              attachments: input.attachments.map((attachment) => ({
                filename: attachment.filename,
                content_type: attachment.contentType,
                content: attachment.content
              }))
            }
          : {})
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Resend recusou o envio (${response.status}).`)
  }
  return { delivered: true }
}
