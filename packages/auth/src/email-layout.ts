/**
 * Layout único dos e-mails transacionais da Onside (desenho do dono, WEB-477:
 * `gen/emails.js` do projeto 5185ab40, telas 1a–1g).
 *
 * Feito para passar em filtro de conteúdo (o Outlook mandava para o lixo
 * eletrônico com SPF/DKIM/DMARC passando): uma só imagem, o wordmark
 * hospedado no próprio domínio, pequeno e com `alt`; HTML em tabelas com estilo
 * inline, sem `<style>`, fonte web nem preheader escondido, porque a primeira
 * frase visível já faz esse papel; um só botão, com o mesmo link em texto logo
 * abaixo; e a versão `text/plain` montada da mesma copy, com os blocos como
 * linhas na mesma ordem, para as duas partes dizerem a mesma coisa.
 *
 * Títulos em Impact (com as condensadas de sistema atrás), corpo em Arial,
 * números e etiquetas em Courier. A sombra do card são células de 6 px, que
 * o Outlook desenha; o `border-radius` ele ignora, e o card fica reto.
 */

import { EMAIL_LOGO_URL } from '@findsports_oficial/config/site'

/** Partes do corpo, na ordem em que vêm depois da introdução. */
export type EmailBlock =
  /** Passos numerados. */
  | { kind: 'steps'; items: string[] }
  /** Etiquetas curtas ("USO ÚNICO"); `strong` é a escura com texto acid. */
  | { kind: 'chips'; items: { label: string; strong?: boolean }[] }
  /** Números grandes lado a lado ("486" / "pessoas marcaram..."). */
  | { kind: 'stats'; items: { value: string; label: string }[] }
  /** Agenda: dia na caixa escura, jogo e detalhe ao lado. */
  | {
      kind: 'games'
      label: string
      items: { weekday: string; day: string; title: string; detail: string }[]
      more?: string
    }
  /** O jogo como ingresso, com o número em destaque embaixo do picote. */
  | {
      kind: 'ticket'
      tag: string
      title: string
      when: string
      number: string
      label: string
    }
  /** A semana em branco: sete dias tracejados. */
  | {
      kind: 'week'
      label?: string
      days: { weekday: string; day: string }[]
      note?: string
    }
  /** O anexo. */
  | { kind: 'file'; name: string; detail: string }

export type OnsideEmailInput = {
  /** Título do e-mail, no `<title>` e no topo da mensagem. */
  heading: string
  /** Fim do título, em vermelho: "Confirme seu" + "e-mail". */
  headingAccent?: string
  /** Etiqueta do topo, à direita do wordmark: CONTA, SEGURANÇA... */
  tag?: string
  /** Linha pequena acima do título ("BAR DO ZÉ · DE 19/10 A 25/10"). */
  eyebrow?: string
  /** Primeira frase do corpo: é ela que a caixa de entrada mostra de prévia. */
  intro: string
  /** Passos numerados depois dos blocos. */
  steps?: string[]
  blocks?: EmailBlock[]
  action: string
  actionUrl: string
  /** Fecho: o que fazer se a mensagem não for para você. */
  note: string
  /** Etiqueta do fecho. Padrão: SEGURANÇA. */
  noteTag?: string
  /** Rodapé: por que este endereço recebeu o e-mail. */
  reason: string
  /** Link do rodapé para desligar o aviso. */
  optOut?: { label: string; url: string }
  actionTone?: 'primary' | 'secondary'
  /** Cor da sombra do card. Padrão: acid. */
  shadow?: 'acid' | 'ink'
}

const INK = '#12120f'
const MUTED = '#55554f'
const LIME = '#c9f135'
const PAPER = '#f1eee6'
const RED = '#c92b0c'
const LINE = '#d9d5cc'
const SOFT = '#f7f5ef'
const DARK_LINE = '#3a3a34'
const FONT = 'Arial,Helvetica,sans-serif'
const HEAD = "Impact,'Arial Narrow Bold','Arial Black',Arial,sans-serif"
const MONO = "'Courier New',Courier,monospace"
// Proporção do PNG (845×256) em 112px de largura.
const LOGO_WIDTH = 112
const LOGO_HEIGHT = 34

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

const e = escapeHtml

const table = (inner: string, style = '') =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;${style}">${inner}</table>`

const row = (padding: string, content: string, style = '') =>
  `<tr><td style="padding:${padding};font-family:${FONT};${style}">${content}</td></tr>`

const label = (text: string, color = RED) =>
  `<div style="font:700 11px/1 ${MONO};letter-spacing:.08em;color:${color};margin:0 0 10px">${e(text)}</div>`

const chip = ({ label, strong }: { label: string; strong?: boolean }) =>
  `<span style="display:inline-block;padding:6px 10px;border-radius:4px;background:${strong ? INK : SOFT};color:${strong ? LIME : INK};font:700 11px/1 ${MONO};letter-spacing:.06em">${e(label)}</span>`

function blockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case 'steps':
      return table(
        block.items
          .map((step, k) => {
            const top = k ? '12px' : '0'
            return `<tr><td width="30" valign="top" style="padding:${top} 0 0"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="26" height="26" align="center" bgcolor="${LIME}" style="width:26px;height:26px;background:${LIME};border-radius:4px;font:400 15px/26px ${HEAD};color:${INK}">${k + 1}</td></tr></table></td><td style="padding:${top} 0 0 12px;font:15px/1.55 ${FONT};color:${INK}">${e(step)}</td></tr>`
          })
          .join('')
      )
    case 'chips':
      return block.items.map(chip).join(' ')
    case 'stats':
      return table(
        `<tr>${block.items
          .map(
            ({ value, label }, k) =>
              `${k ? '<td width="8" style="width:8px"></td>' : ''}<td valign="top" bgcolor="${SOFT}" style="background:${SOFT};border-radius:6px;padding:14px 14px 13px;font-family:${FONT}"><div style="font:400 32px/1 ${HEAD};color:${INK}">${e(value)}</div><div style="font-size:12.5px;line-height:1.4;color:${MUTED};margin-top:6px">${e(label)}</div></td>`
          )
          .join('')}</tr>`
      )
    case 'games':
      return (
        label(block.label) +
        table(
          block.items
            .map(({ weekday, day, title, detail }, k) => {
              const top = k ? 10 : 0
              return `<tr><td width="58" valign="middle" style="padding:${top}px 0 0"><table role="presentation" width="58" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="${INK}" style="background:${INK};border-radius:6px;padding:8px 0 7px"><div style="font:700 10px/1 ${MONO};letter-spacing:.06em;color:${LIME}">${e(weekday)}</div><div style="font:400 20px/1 ${HEAD};color:${PAPER};margin-top:4px">${e(day)}</div></td></tr></table></td><td valign="middle" style="padding:${top}px 0 0 14px;font-family:${FONT}"><div style="font-size:15px;font-weight:700;color:${INK}">${e(title)}</div><div style="font-size:13px;color:${MUTED};margin-top:2px">${e(detail)}</div></td></tr>`
            })
            .join('') +
            (block.more
              ? `<tr><td colspan="2" style="padding:12px 0 0;font:13px/1.4 ${FONT};color:${MUTED}">${e(block.more)}</td></tr>`
              : '')
        )
      )
    case 'ticket':
      return table(
        `<tr><td bgcolor="${INK}" style="background:${INK};border-radius:8px 8px 0 0;padding:18px 20px 16px;font-family:${FONT}"><div style="font:700 11px/1 ${MONO};letter-spacing:.1em;color:${LIME}">${e(block.tag)}</div><div style="font:400 30px/1.05 ${HEAD};text-transform:uppercase;color:${PAPER};margin-top:10px">${e(block.title)}</div><div style="font:700 13px/1 ${MONO};color:#aaa9a4;margin-top:8px">${e(block.when)}</div></td></tr><tr><td bgcolor="${INK}" style="background:${INK};padding:0 20px"><div style="border-top:2px dashed ${DARK_LINE};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr><tr><td bgcolor="${INK}" style="background:${INK};border-radius:0 0 8px 8px;padding:14px 20px 18px;font-family:${FONT}">${table(`<tr><td width="1" style="font:400 56px/1 ${HEAD};color:${LIME};white-space:nowrap;padding-right:14px">${e(block.number)}</td><td style="font:15px/1.4 ${FONT};color:${PAPER}">${e(block.label)}</td></tr>`)}</td></tr>`
      )
    case 'week':
      return (
        (block.label ? label(block.label) : '') +
        table(
          `<tr>${block.days
            .map(
              ({ weekday, day }, k) =>
                `${k ? '<td width="6" style="width:6px"></td>' : ''}<td align="center" style="border:1.5px dashed #c9c4b8;border-radius:6px;padding:9px 0 8px;font-family:${FONT}"><div style="font:700 9.5px/1 ${MONO};letter-spacing:.05em;color:${MUTED}">${e(weekday)}</div><div style="font:400 18px/1 ${HEAD};color:#b9b4a8;margin-top:5px">${e(day)}</div></td>`
            )
            .join('')}</tr>`
        ) +
        (block.note
          ? `<div style="font:14px/1.5 ${FONT};color:${INK};margin-top:10px">${e(block.note)}</div>`
          : '')
      )
    case 'file':
      return table(
        `<tr><td style="border:1.5px solid ${INK};border-radius:6px;padding:0">${table(`<tr><td width="56" align="center" bgcolor="${LIME}" style="background:${LIME};border-radius:5px 0 0 5px;border-right:1.5px dashed ${INK};font:400 20px/1 ${HEAD};color:${INK};padding:16px 0">{ }</td><td style="padding:12px 14px;font-family:${FONT}"><div style="font:700 13px/1.3 ${MONO};color:${INK};word-break:break-all">${e(block.name)}</div><div style="font-size:12.5px;color:${MUTED};margin-top:4px">${e(block.detail)}</div></td></tr>`)}</td></tr>`
      )
  }
}

function blockText(block: EmailBlock): string {
  switch (block.kind) {
    case 'steps':
      return block.items.map((step, k) => `${k + 1}. ${step}`).join('\n')
    case 'chips':
      return block.items.map(({ label }) => `[${label}]`).join(' ')
    case 'stats':
      return block.items
        .map(({ value, label }) => `${value} ${label}`)
        .join('\n')
    case 'games':
      return [
        block.label,
        ...block.items.map(
          ({ weekday, day, title, detail }) =>
            `${weekday} ${day} · ${title} · ${detail}`
        ),
        ...(block.more ? [block.more] : [])
      ].join('\n')
    case 'ticket':
      return [
        block.tag,
        block.title,
        block.when,
        `${block.number} ${block.label}`
      ].join('\n')
    case 'week':
      // Os sete dias vazios são desenho; no texto, só o que eles dizem.
      return [block.label, block.note].filter(Boolean).join('\n')
    case 'file':
      return `Anexo: ${block.name} (${block.detail})`
  }
}

export function createOnsideEmailTemplate({
  heading,
  headingAccent,
  tag,
  eyebrow,
  intro,
  steps = [],
  blocks = [],
  action,
  actionUrl,
  note,
  noteTag = 'SEGURANÇA',
  reason,
  optOut,
  actionTone = 'primary',
  shadow = 'acid'
}: OnsideEmailInput): { html: string; text: string } {
  const title = headingAccent ? `${heading} ${headingAccent}` : heading
  const body: EmailBlock[] = [
    ...blocks,
    ...(steps.length ? [{ kind: 'steps', items: steps } as const] : [])
  ]
  const url = e(actionUrl)
  const shade = shadow === 'ink' ? INK : LIME
  const buttonBackground = actionTone === 'primary' ? LIME : '#ffffff'

  const text = [
    tag ? `ONSIDE · ${tag}` : 'ONSIDE',
    ...(eyebrow ? [eyebrow] : []),
    title,
    intro,
    ...body.map(blockText).filter(Boolean),
    `${action}:\n${actionUrl}`,
    `${noteTag}\n${note}`,
    `--\nOnside · O jogo começa aqui.\n${reason}${optOut ? `\n${optOut.label}: ${optOut.url}` : ''}`
  ].join('\n\n')

  // Etiquetas grudam no bloco vizinho (16 px), o resto respira 22 px.
  const blockRows = body
    .map((block, k) => {
      const tight = block.kind === 'chips' || body[k - 1]?.kind === 'chips'
      return row(`${tight ? 16 : 22}px 28px 0`, blockHtml(block))
    })
    .join('')

  const card = [
    `<tr><td bgcolor="#ffffff" style="background:#ffffff;border-radius:8px 8px 0 0;padding:20px 28px 18px;border-bottom:4px solid ${LIME}">${table(`<tr><td><img src="${EMAIL_LOGO_URL}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="Onside" style="display:block;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border:0"></td>${tag ? `<td align="right"><span style="display:inline-block;padding:6px 9px;border-radius:4px;background:${INK};color:${LIME};font:700 10.5px/1 ${MONO};letter-spacing:.12em">${e(tag)}</span></td>` : ''}</tr>`)}</td></tr>`,
    eyebrow
      ? row(
          '28px 28px 0',
          `<div style="font:700 11px/1.4 ${MONO};letter-spacing:.08em;color:${MUTED}">${e(eyebrow)}</div>`
        )
      : '',
    row(
      `${eyebrow ? 10 : 28}px 28px 0`,
      `<h1 style="margin:0;font:400 38px/1.02 ${HEAD};text-transform:uppercase;letter-spacing:.2px;color:${INK}">${e(heading)}${headingAccent ? ` <span style="color:${RED}">${e(headingAccent)}</span>` : ''}</h1>`
    ),
    row('14px 28px 0', e(intro), `font-size:16px;line-height:1.6;color:${INK}`),
    blockRows,
    row(
      '26px 28px 0',
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate"><tr><td bgcolor="${buttonBackground}" style="background:${buttonBackground};border:2px solid ${INK};border-right-width:5px;border-bottom-width:5px;border-radius:6px"><a href="${url}" style="display:inline-block;padding:14px 24px;font:700 16px/1 ${FONT};color:${INK};text-decoration:none">${e(action)} &rarr;</a></td></tr></table>`
    ),
    row(
      '16px 28px 0',
      `Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${url}" style="color:${INK};word-break:break-all">${url}</a>`,
      `font-size:12.5px;line-height:1.6;color:${MUTED}`
    ),
    row(
      '22px 28px 28px',
      table(
        `<tr><td bgcolor="${SOFT}" style="background:${SOFT};border-radius:6px;padding:13px 16px;font-family:${FONT}"><div style="font:700 10.5px/1 ${MONO};letter-spacing:.1em;color:${RED}">${e(noteTag)}</div><div style="font-size:13px;line-height:1.55;color:${INK};margin-top:6px">${e(note)}</div></td></tr>`
      )
    )
  ].join('')

  const shadowed = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse"><tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:8px">${table(card)}</td><td width="6" bgcolor="${shade}" style="width:6px;background:${shade};border-top:6px solid ${PAPER};border-radius:0 0 4px 0"></td></tr><tr><td height="6" bgcolor="${shade}" style="height:6px;line-height:6px;font-size:0;background:${shade};border-left:6px solid ${PAPER};border-radius:0 0 0 4px">&nbsp;</td><td height="6" bgcolor="${shade}" style="height:6px;background:${shade};border-radius:0 0 4px 0"></td></tr></table>`

  const footer = `<tr><td style="padding:18px 6px 0;font:12px/1.6 ${FONT};color:${MUTED}"><b style="color:${INK}">Onside · O jogo começa aqui.</b><br>${e(reason)}${optOut ? `<br><a href="${e(optOut.url)}" style="color:${INK}">${e(optOut.label)}</a>` : ''}</td></tr>`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${PAPER};border-collapse:collapse"><tr><td align="center" style="padding:28px 14px 32px">
<!--[if mso]><table role="presentation" width="566" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:566px;border-collapse:collapse"><tr><td>${shadowed}</td></tr>${footer}</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`

  return { html, text }
}
