type VerificationEmailInput = {
  name: string
  verificationUrl: string
  logoUrl: string
}

type EmailFetcher = (input: string, init?: RequestInit) => Promise<Response>

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escaped: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }
    return escaped[character] ?? character
  })
}

export function createVerificationEmail({
  name,
  verificationUrl,
  logoUrl
}: VerificationEmailInput) {
  const safeName = escapeHtml(name.trim() || 'torcedor')
  const safeUrl = escapeHtml(verificationUrl)
  const safeLogo = escapeHtml(logoUrl)

  return {
    subject: 'Confirme seu e-mail para entrar em campo',
    text: `Olá, ${name.trim() || 'torcedor'}! Confirme seu e-mail no Onside: ${verificationUrl}\n\nO link expira em 1 hora. Se você não criou esta conta, ignore esta mensagem.`,
    html: `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f1eee6;color:#12120f;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1eee6;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:2px solid #12120f;background:#f1eee6">
<tr><td style="background:#12120f;padding:28px 32px"><img src="${safeLogo}" width="166" height="50" alt="Onside" style="display:block;max-width:166px;height:auto"></td></tr>
<tr><td style="padding:36px 32px 12px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#c92b0c">Confirmação de conta</td></tr>
<tr><td style="padding:0 32px;font-family:Impact,Arial Black,sans-serif;font-size:40px;line-height:1.05;text-transform:uppercase">Falta só confirmar o seu e-mail.</td></tr>
<tr><td style="padding:24px 32px 0;font-size:16px;line-height:1.6">Olá, <strong>${safeName}</strong>. Confirme que este endereço é seu para liberar sua conta Onside.</td></tr>
<tr><td style="padding:28px 32px"><a href="${safeUrl}" style="display:inline-block;border:2px solid #12120f;background:#c9f135;color:#12120f;padding:15px 22px;font-size:14px;font-weight:800;text-decoration:none;text-transform:uppercase">Confirmar meu e-mail</a></td></tr>
<tr><td style="padding:0 32px 32px;font-size:13px;line-height:1.6;color:#5e5c55">Este link expira em 1 hora. Se você não criou uma conta no Onside, ignore esta mensagem.</td></tr>
<tr><td style="border-top:1px solid #12120f;padding:20px 32px;font-size:11px;color:#5e5c55">Onside · O jogo começa aqui.</td></tr>
</table></td></tr></table></body></html>`
  }
}

export async function sendVerificationEmailWithResend(input: {
  apiKey: string | undefined
  fromEmail: string | undefined
  to: string
  name: string
  verificationUrl: string
  logoUrl: string
  fetcher?: EmailFetcher
}): Promise<void> {
  if (!input.apiKey || !input.fromEmail) {
    throw new Error('Resend não configurado para verificação de e-mail.')
  }

  const email = createVerificationEmail(input)
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
        subject: email.subject,
        html: email.html,
        text: email.text
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Resend recusou o envio (${response.status}).`)
  }
}
