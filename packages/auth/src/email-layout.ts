/**
 * Layout único dos e-mails transacionais da Onside.
 *
 * Feito para passar em filtro de conteúdo (o Outlook mandava para o lixo
 * eletrônico com SPF/DKIM/DMARC passando): nenhuma imagem, a marca vai em
 * texto; HTML em tabelas com estilo inline, sem `<style>` nem preheader
 * escondido, porque a primeira frase visível já faz esse papel; um só botão,
 * com o mesmo link em texto logo abaixo; e a versão `text/plain` montada da
 * mesma copy, para as duas partes dizerem a mesma coisa.
 */

export type OnsideEmailInput = {
  /** Título do e-mail, no `<title>` e no topo da mensagem. */
  heading: string
  /** Primeira frase visível: é ela que a caixa de entrada mostra de prévia. */
  intro: string
  /** O que a pessoa precisa saber antes de clicar. Pode ser vazio. */
  steps: string[]
  action: string
  actionUrl: string
  /** Fecho de segurança: o que fazer se a mensagem não for para você. */
  note: string
  /** Rodapé: por que este endereço recebeu o e-mail. */
  reason: string
  actionTone?: 'primary' | 'secondary'
}

const INK = '#12120f'
const MUTED = '#55554f'
const LIME = '#c9f135'
const PAPER = '#f1eee6'
const FONT = 'Arial,Helvetica,sans-serif'

export function escapeHtml(value: string): string {
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
  heading,
  intro,
  steps,
  action,
  actionUrl,
  note,
  reason,
  actionTone = 'primary'
}: OnsideEmailInput): { html: string; text: string } {
  const safe = {
    heading: escapeHtml(heading),
    intro: escapeHtml(intro),
    action: escapeHtml(action),
    actionUrl: escapeHtml(actionUrl),
    note: escapeHtml(note),
    reason: escapeHtml(reason),
    steps: steps.map(escapeHtml)
  }
  const buttonBackground = actionTone === 'primary' ? LIME : '#ffffff'
  const cell = (padding: string, style: string, content: string) =>
    `<tr><td style="padding:${padding};font-family:${FONT};${style}">${content}</td></tr>`

  const text = [
    'ONSIDE',
    heading,
    intro,
    ...(steps.length ? [steps.map((step) => `• ${step}`).join('\n')] : []),
    `${action}:\n${actionUrl}`,
    note,
    `--\nOnside · O jogo começa aqui.\n${reason}`
  ].join('\n\n')

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${safe.heading}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${PAPER};border-collapse:collapse">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #d9d5cc;border-collapse:collapse">
<tr><td style="padding:20px 32px;border-bottom:4px solid ${LIME};font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:3px;color:${INK}">ONSIDE</td></tr>
${cell('28px 32px 0', `font-size:24px;font-weight:700;line-height:1.3;color:${INK}`, `<h1 style="margin:0;font-size:24px;font-weight:700;line-height:1.3">${safe.heading}</h1>`)}
${cell('16px 32px 0', `font-size:16px;line-height:1.6;color:${INK}`, safe.intro)}
${
  safe.steps.length
    ? cell(
        '16px 32px 0',
        `font-size:15px;line-height:1.6;color:${INK}`,
        `<ul style="margin:0;padding:0 0 0 20px">${safe.steps.map((step) => `<li style="margin:0 0 6px">${step}</li>`).join('')}</ul>`
      )
    : ''
}
<tr><td style="padding:24px 32px 0">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse"><tr>
<td bgcolor="${buttonBackground}" style="background:${buttonBackground};border:2px solid ${INK}"><a href="${safe.actionUrl}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:16px;font-weight:700;color:${INK};text-decoration:none">${safe.action}</a></td>
</tr></table>
</td></tr>
${cell('20px 32px 0', `font-size:13px;line-height:1.6;color:${MUTED}`, `Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${safe.actionUrl}" style="color:${INK};word-break:break-all">${safe.actionUrl}</a>`)}
${cell('20px 32px 28px', `font-size:13px;line-height:1.6;color:${MUTED}`, safe.note)}
${cell('16px 32px 20px', `border-top:1px solid #d9d5cc;font-size:12px;line-height:1.6;color:${MUTED}`, `Onside · O jogo começa aqui.<br>${safe.reason}`)}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`

  return { html, text }
}
