type VerificationEmailInput = {
  name: string
  verificationUrl: string
  logoUrl: string
  heroImageUrl: string
}

type OnsideEmailTemplateInput = {
  preheader: string
  eyebrow: string
  heading: string
  intro: string
  highlights: string[]
  action: string
  actionUrl: string
  logoUrl: string
  heroImageUrl: string
  note: string
  actionTone?: 'primary' | 'secondary'
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

export function createOnsideEmailTemplate({
  preheader,
  eyebrow,
  heading,
  intro,
  highlights,
  action,
  actionUrl,
  logoUrl,
  heroImageUrl,
  note,
  actionTone = 'primary'
}: OnsideEmailTemplateInput): { html: string; text: string } {
  const safe = {
    preheader: escapeHtml(preheader),
    eyebrow: escapeHtml(eyebrow),
    heading: escapeHtml(heading),
    intro: escapeHtml(intro),
    action: escapeHtml(action),
    actionUrl: escapeHtml(actionUrl),
    logoUrl: escapeHtml(logoUrl),
    heroImageUrl: escapeHtml(heroImageUrl),
    note: escapeHtml(note),
    highlights: highlights.map(escapeHtml)
  }
  const buttonBackground = actionTone === 'primary' ? '#c9f135' : '#f1eee6'

  return {
    text: [
      heading,
      intro,
      `O que acontece agora:\n${highlights.map((item) => `• ${item}`).join('\n')}`,
      note,
      `${action}: ${actionUrl}`,
      'Onside — O jogo começa aqui.'
    ].join('\n\n'),
    html: `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${safe.heading}</title>
<style>
@media only screen and (max-width:620px){
  .email-shell{padding:16px 8px!important}
  .email-pad{padding-left:24px!important;padding-right:24px!important}
  .email-title{font-size:36px!important}
  .email-button{display:block!important;text-align:center!important}
}
</style>
</head>
<body style="margin:0;background:#e7e3db;color:#12120f;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;mso-hide:all">${safe.preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#e7e3db;border-collapse:collapse">
<tr><td class="email-shell" align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#f1eee6;border:2px solid #12120f;border-collapse:collapse">
<tr><td class="email-pad" style="background:#c9f135;padding:24px 32px"><img src="${safe.logoUrl}" width="166" height="50" alt="Onside" style="display:block;width:166px;max-width:100%;height:auto;border:0"></td></tr>
<tr><td><img src="${safe.heroImageUrl}" width="600" height="315" alt="O jogo é aqui — Onside em um bar com futebol ao vivo" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>
<tr><td class="email-pad" style="padding:36px 32px 0">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tr><td width="10" valign="middle"><span style="display:block;width:8px;height:8px;border-radius:50%;background:#f03b18"></span></td><td style="padding-left:8px;font-family:Consolas,Monaco,monospace;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#55554f">${safe.eyebrow}</td></tr></table>
</td></tr>
<tr><td class="email-pad email-title" style="padding:14px 32px 0;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:44px;font-weight:900;line-height:1;text-transform:uppercase;letter-spacing:-0.5px">${safe.heading}</td></tr>
<tr><td class="email-pad" style="padding:20px 32px 0;font-size:16px;line-height:1.65;color:#30302c">${safe.intro}</td></tr>
<tr><td class="email-pad" style="padding:28px 32px 0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#dedad1;border:1px solid #12120f;border-collapse:collapse">
<tr><td colspan="2" style="padding:16px 18px 12px;font-family:Consolas,Monaco,monospace;font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase">O que acontece agora</td></tr>
${safe.highlights
  .map(
    (item, index) =>
      `<tr><td width="42" valign="top" style="padding:12px 0 12px 18px;border-top:1px solid #b7b3aa"><span style="display:block;width:24px;height:24px;background:#c9f135;border:1px solid #12120f;font-family:Consolas,Monaco,monospace;font-size:11px;font-weight:700;line-height:24px;text-align:center">${index + 1}</span></td><td valign="top" style="padding:13px 18px 12px 10px;border-top:1px solid #b7b3aa;font-size:14px;line-height:1.55">${item}</td></tr>`
  )
  .join('')}
</table>
</td></tr>
<tr><td class="email-pad" style="padding:28px 32px 0"><a class="email-button" href="${safe.actionUrl}" style="display:inline-block;border:2px solid #12120f;background:${buttonBackground};color:#12120f;padding:15px 22px;font-size:13px;font-weight:800;letter-spacing:.4px;text-decoration:none;text-transform:uppercase">${safe.action}</a></td></tr>
<tr><td class="email-pad" style="padding:18px 32px 0;font-size:11px;line-height:1.55;color:#55554f">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${safe.actionUrl}" style="color:#12120f;word-break:break-all">${safe.actionUrl}</a></td></tr>
<tr><td class="email-pad" style="padding:24px 32px 32px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse"><tr><td style="border-left:4px solid #f03b18;background:#dedad1;padding:14px 16px;font-size:12px;line-height:1.6;color:#55554f">${safe.note}</td></tr></table></td></tr>
<tr><td class="email-pad" style="border-top:2px solid #12120f;background:#12120f;padding:20px 32px;font-size:11px;line-height:1.6;color:#aaa9a4">ONSIDE · O jogo começa aqui.<br>Encontre o bar certo para assistir ao jogo certo.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  }
}

export function createVerificationEmail({
  name,
  verificationUrl,
  logoUrl,
  heroImageUrl
}: VerificationEmailInput) {
  const template = createOnsideEmailTemplate({
    preheader: 'Confirme seu e-mail para continuar sua conta Onside.',
    eyebrow: 'Confirmação de conta',
    heading: 'Confirme seu e-mail',
    intro: `Olá, ${name.trim() || 'torcedor'}. Confirme que este endereço é seu para proteger sua conta e continuar no Onside.`,
    highlights: [
      'Abra o link abaixo no mesmo navegador em que iniciou o cadastro.',
      'Depois da confirmação, você entra automaticamente e continua de onde parou.',
      'Por segurança, este link expira em 1 hora.'
    ],
    action: 'Confirmar meu e-mail',
    actionUrl: verificationUrl,
    logoUrl,
    heroImageUrl,
    note: 'Se você não criou uma conta no Onside, ignore esta mensagem. Nenhuma conta será confirmada sem abrir o link.'
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
  logoUrl: string
  heroImageUrl: string
  fetcher?: EmailFetcher
}): Promise<void> {
  const email = createVerificationEmail(input)
  await sendEmailWithResend({ ...input, ...email })
}

export async function sendEmailWithResend(input: {
  apiKey: string | undefined
  fromEmail: string | undefined
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey?: string
  fetcher?: EmailFetcher
}): Promise<{ delivered: boolean }> {
  if (!input.apiKey || !input.fromEmail) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Resend não configurado para envio de e-mail.')
    }
    console.warn(
      `[email] Resend não configurado. E-mail não enviado.\nTo: ${input.to}\nSubject: ${input.subject}\n\n${input.text}`
    )
    return { delivered: false }
  }

  const response = await (input.fetcher ?? fetch)(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
        ...(input.idempotencyKey
          ? { 'idempotency-key': input.idempotencyKey }
          : {})
      },
      body: JSON.stringify({
        from: `Onside <${input.fromEmail}>`,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text
      })
    }
  )

  if (!response.ok) {
    throw new Error(`Resend recusou o envio (${response.status}).`)
  }
  return { delivered: true }
}
