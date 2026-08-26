import { sendEmailWithResend } from '@findsports_oficial/auth/verification-email'
import { env } from '@findsports_oficial/env/server'

type WaitlistEmailKind =
  | 'confirm'
  | 'joined'
  | 'invite'
  | 'approved-existing'
  | 'launch'

const content: Record<
  WaitlistEmailKind,
  { subject: string; heading: string; body: string; action: string }
> = {
  confirm: {
    subject: 'Confirme sua entrada na waitlist da Onside',
    heading: 'Confirme seu e-mail',
    body: 'Confirme este endereço para entrar ou atualizar seus dados na waitlist.',
    action: 'Confirmar e-mail'
  },
  joined: {
    subject: 'Você está na waitlist da Onside',
    heading: 'Entrada confirmada',
    body: 'Pronto: sua inscrição está confirmada. Avisaremos quando seu acesso for liberado.',
    action: 'Sair da waitlist'
  },
  invite: {
    subject: 'Seu convite para testar a Onside chegou',
    heading: 'Você foi convidado',
    body: 'Reservamos seu acesso por 7 dias. Ative sua conta e entre automaticamente.',
    action: 'Ativar minha conta'
  },
  'approved-existing': {
    subject: 'Seu acesso à Onside foi liberado',
    heading: 'Você está dentro',
    body: 'Seu acesso antecipado foi liberado. Entre com a conta que você já criou.',
    action: 'Entrar na Onside'
  },
  launch: {
    subject: 'A Onside está aberta',
    heading: 'Pode entrar',
    body: 'A Onside agora está aberta. Crie sua conta para começar.',
    action: 'Criar conta'
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ??
      character
  )
}

export async function sendWaitlistEmail(input: {
  kind: WaitlistEmailKind
  to: string
  url: string
  idempotencyKey?: string
}) {
  const copy = content[input.kind]
  const safeUrl = escapeHtml(input.url)
  await sendEmailWithResend({
    apiKey: env.RESEND_API_KEY,
    fromEmail: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: copy.subject,
    text: `${copy.heading}\n\n${copy.body}\n\n${input.url}`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f1eee6;color:#12120f;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:2px solid #12120f"><tr><td style="background:#12120f;color:#f1eee6;padding:24px 32px;font-size:24px;font-weight:900">ONSIDE</td></tr><tr><td style="padding:36px 32px 12px;font-size:36px;font-weight:900;text-transform:uppercase">${copy.heading}</td></tr><tr><td style="padding:12px 32px;font-size:16px;line-height:1.6">${copy.body}</td></tr><tr><td style="padding:24px 32px 36px"><a href="${safeUrl}" style="display:inline-block;border:2px solid #12120f;background:#c9f135;color:#12120f;padding:15px 22px;font-weight:800;text-decoration:none;text-transform:uppercase">${copy.action}</a></td></tr></table></td></tr></table></body></html>`,
    idempotencyKey: input.idempotencyKey
  })
}

export function waitlistUrl(path: string, token?: string) {
  const url = new URL(path, env.BETTER_AUTH_URL)
  if (token) url.searchParams.set('token', token)
  return url.toString()
}
