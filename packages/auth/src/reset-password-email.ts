import {
  createOnsideEmailTemplate,
  sendEmailWithResend
} from './verification-email'

type ResetPasswordEmailInput = {
  name: string
  resetUrl: string
  logoUrl: string
  heroImageUrl: string
}

type EmailFetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * O e-mail de redefinição usa o mesmo template dos demais transacionais
 * (`createOnsideEmailTemplate`), então identidade visual, fallback em texto e
 * escape de HTML são exatamente os já cobertos por `verification-email`.
 * O que muda aqui é só a copy — e ela precisa dizer três coisas que o fluxo
 * de fato garante: uso único, prazo de 1 hora e queda das sessões abertas.
 */
export function createResetPasswordEmail({
  name,
  resetUrl,
  logoUrl,
  heroImageUrl
}: ResetPasswordEmailInput) {
  const template = createOnsideEmailTemplate({
    preheader: 'Link de uso único para você definir uma nova senha na Onside.',
    eyebrow: 'Redefinição de senha',
    heading: 'Defina uma nova senha',
    intro: `Olá, ${name.trim() || 'torcedor'}. Recebemos um pedido para redefinir a senha da sua conta Onside. Use o link abaixo para escolher uma nova.`,
    highlights: [
      'O link é de uso único: depois que a senha for definida, ele deixa de valer.',
      'Por segurança, este link expira em 1 hora.',
      'Ao concluir, as sessões abertas são encerradas — entre de novo com a senha nova.'
    ],
    action: 'Definir nova senha',
    actionUrl: resetUrl,
    logoUrl,
    heroImageUrl,
    note: 'Se você não pediu para redefinir sua senha, ignore esta mensagem. Sua senha atual continua valendo enquanto o link não for usado.'
  })

  return {
    subject: 'Redefina a senha da sua conta Onside',
    text: template.text,
    html: template.html
  }
}

export async function sendResetPasswordEmailWithResend(input: {
  apiKey: string | undefined
  fromEmail: string | undefined
  to: string
  name: string
  resetUrl: string
  logoUrl: string
  heroImageUrl: string
  fetcher?: EmailFetcher
}): Promise<void> {
  const email = createResetPasswordEmail(input)
  await sendEmailWithResend({ ...input, ...email })
}
