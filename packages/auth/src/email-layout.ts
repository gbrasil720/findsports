/**
 * Layout único dos e-mails da Onside (desenho do WEB-477): cabeçalho em
 * tinta com o wordmark e uma etiqueta mono, faixa-ticker opcional, título
 * Anton em duas linhas (a segunda em vermelho), corpo em cartão sobre papel,
 * botão à prova de bala e rodapé com o motivo do envio.
 *
 * Feito para passar em filtro de conteúdo (o Outlook mandava para o lixo
 * eletrônico com SPF/DKIM/DMARC passando): uma só imagem, o wordmark
 * hospedado no próprio domínio, pequeno e com `alt`; HTML em tabelas com
 * estilo inline, sem `<style>` nem preheader escondido; um só botão; e a
 * versão `text/plain` montada da mesma copy, para as duas partes dizerem a
 * mesma coisa. A web font só pega no Apple Mail: toda família tem fallback.
 *
 * As peças (`chips`, `scoreboard`, `agenda`...) escapam o que recebem e
 * devolvem HTML e texto; o template as põe no corpo, na ordem dada, antes
 * da lista de passos.
 */

import { EMAIL_LOGO_URL, SITE_URL } from '@findsports_oficial/config/site'

/** Uma peça do corpo: o HTML e o que ela diz na versão texto ('' = nada). */
export type EmailBlock = { html: string; text: string }

export type OnsideEmailInput = {
  /** Primeira linha do título, no `<title>` e no topo da mensagem. */
  heading: string
  /** Segunda linha do título, em vermelho. */
  headingAccent?: string
  /** Etiqueta à direita do logo: CONTA, SEGURANÇA, PAINEL DO BAR... */
  tag?: string
  /** Faixa-ticker sob o cabeçalho, montada por `band`. */
  band?: string
  /** Primeira frase do corpo. */
  intro: string
  /** Peças entre a introdução e os passos. */
  blocks?: EmailBlock[]
  /** O que a pessoa precisa saber antes de clicar. Pode ser vazio. */
  steps: string[]
  /** Passos numerados (uma ordem de verdade) ou lista com fio. */
  numberedSteps?: boolean
  /** Sem `action`, o e-mail não tem botão. */
  action?: string
  actionUrl?: string
  /** `primary` (acid) convida a agir; `secondary` (tinta) é segurança e privacidade. */
  actionTone?: 'primary' | 'secondary'
  /** Repete o link em texto sob o botão: vale para link de token. */
  linkFallback?: boolean
  /** Fecho: o que fazer se a mensagem não for para você. */
  note?: string
  noteLabel?: string
  /** Rodapé: por que este endereço recebeu o e-mail. */
  reason: string
  /** Link do rodapé para desligar o aviso. */
  optOut?: { label: string; url: string }
}

const C = {
  ink: '#12120f',
  raised: '#1c1c18',
  well: '#2a2a24',
  line: '#34342d',
  paper: '#f1eee6',
  card: '#faf8f3',
  sand: '#d9d4c8',
  stone: '#e7e3db',
  acid: '#c9f135',
  drop: '#7f9a12',
  red: '#e8320c',
  body: '#3a3a35',
  muted: '#55554f',
  mutedInk: '#aaa9a4',
  softInk: '#c9c7c0'
}
const F = {
  display: "Anton,Impact,'Arial Narrow',sans-serif",
  body: 'Archivo,Arial,Helvetica,sans-serif',
  mono: "'Geist Mono',Menlo,Consolas,'Courier New',monospace"
}
export const EMAIL_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;600;700&family=Geist+Mono:wght@500;600&display=swap'
const TB =
  'role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"'
const T = `${TB} style="width:100%;border-collapse:collapse"`
const TI =
  'role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate"'
// Proporção do PNG (238×72) em 36 px de altura.
const LOGO_WIDTH = 119
const LOGO_HEIGHT = 36

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

const label = (text: string, color = C.muted) =>
  `<span style="font-family:${F.mono};font-size:11.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${color}">${e(text)}</span>`

/** Número grande em mono acid, do placar e do ingresso. */
const bigNumber = (size: number) =>
  `font-family:${F.mono};font-size:${size}px;font-weight:600;line-height:1.1;color:${C.acid};letter-spacing:-.03em;white-space:nowrap`

/** Selos em pílula; os marcados saem em acid. Repetem o texto: não vão à versão texto. */
export function chips(items: [text: string, strong?: boolean][]): EmailBlock {
  // inline-block para quebrar linha no celular; no Outlook vira texto com fundo.
  const html = `<div style="line-height:0">${items
    .map(
      ([text, strong]) =>
        `<span style="display:inline-block;margin:0 6px 6px 0;background:${strong ? C.acid : C.stone};border-radius:999px;padding:8px 13px;font-family:${F.mono};font-size:11.5px;font-weight:600;line-height:1.2;letter-spacing:.08em;color:${C.ink};white-space:nowrap">${e(text)}</span>`
    )
    .join('')}</div>`
  return { html, text: '' }
}

/**
 * Placar em tinta: números em mono acid. Com um número só, ele ocupa a
 * linha com o rótulo ao lado, em vez de uma coluna estreita sobrando.
 */
export function scoreboard(
  head: string,
  items: [value: string, label: string][]
): EmailBlock {
  const width = Math.floor(100 / items.length)
  const [single] = items
  const cells =
    items.length === 1 && single
      ? `<td style="padding:10px 18px 20px"><table ${TI}><tr><td valign="middle" style="padding-right:16px;${bigNumber(40)}">${e(single[0])}</td><td valign="middle" style="font-family:${F.body};font-size:15px;line-height:1.35;color:${C.softInk}">${e(single[1])}</td></tr></table></td>`
      : items
          .map(
            ([value, text], i) =>
              `<td valign="top" width="${width}%" style="width:${width}%;padding:10px 10px 18px ${i ? 12 : 18}px;${i ? `border-left:1px solid ${C.line};` : ''}"><div style="${bigNumber(26)}">${e(value)}</div><div style="padding-top:6px;font-family:${F.body};font-size:13px;line-height:1.35;color:${C.softInk}">${e(text)}</div></td>`
          )
          .join('')
  const html = `<table ${TB} bgcolor="${C.ink}" style="width:100%;border-collapse:separate;table-layout:fixed;background:${C.ink};border-radius:20px;border-bottom:4px solid #000000">
<tr><td colspan="${items.length}" style="padding:16px 18px 4px">${label(head, C.mutedInk)}</td></tr>
<tr>${cells}</tr></table>`
  return {
    html,
    text: [head, ...items.map(([value, text]) => `${value} ${text}`)].join('\n')
  }
}

export type AgendaGame = {
  /** "QUA" */
  weekday: string
  /** "11/11" */
  day: string
  title: string
  /** "21:30 · BRASILEIRÃO" */
  detail: string
}

/** Agenda com a caixa do dia, como no painel. */
export function agenda(
  head: string,
  games: AgendaGame[],
  more?: string
): EmailBlock {
  const rows = games
    .map(
      (game) =>
        `<tr><td valign="top" width="58" style="width:58px;padding:12px 12px 12px 0;border-top:1px solid ${C.sand}"><table ${TI}><tr><td align="center" width="50" bgcolor="${C.stone}" style="width:50px;background:${C.stone};border-radius:12px;padding:7px 0;font-family:${F.mono};line-height:1.15"><span style="font-size:10.5px;font-weight:600;letter-spacing:.08em;color:${C.muted}">${e(game.weekday)}</span><br><span style="font-size:15px;font-weight:600;color:${C.ink}">${e(game.day)}</span></td></tr></table></td><td valign="middle" style="padding:12px 0;border-top:1px solid ${C.sand}"><div style="font-family:${F.body};font-size:16px;font-weight:700;line-height:1.3;color:${C.ink}">${e(game.title)}</div><div style="padding-top:3px;font-family:${F.mono};font-size:12.5px;font-weight:500;color:${C.muted};letter-spacing:.02em">${e(game.detail)}</div></td></tr>`
    )
    .join('')
  const tail = more
    ? `<tr><td colspan="2" style="padding:12px 0 0;border-top:1px solid ${C.sand};font-family:${F.body};font-size:14.5px;color:${C.muted}">${e(more)}</td></tr>`
    : ''
  return {
    html: `${label(head)}<table ${TB} style="width:100%;border-collapse:collapse;margin-top:10px">${rows}${tail}</table>`,
    text: [
      head,
      ...games.map(
        (game) =>
          `• ${game.weekday} ${game.day} · ${game.title} · ${game.detail}`
      ),
      ...(more ? [more] : [])
    ].join('\n')
  }
}

/** A semana em branco, dia a dia. Não diz nada a mais em texto. */
export function emptyWeek(days: [weekday: string, day: string][]): EmailBlock {
  const html = `<table ${TB} style="width:100%;border-collapse:separate;border-spacing:4px 0;table-layout:fixed"><tr>${days
    .map(
      ([weekday, day]) =>
        `<td align="center" bgcolor="${C.stone}" style="background:${C.stone};border-radius:12px;padding:10px 0 12px;font-family:${F.mono};line-height:1.2"><span style="font-size:10px;font-weight:600;letter-spacing:.06em;color:${C.muted}">${e(weekday)}</span><br><span style="font-size:15px;font-weight:600;color:${C.ink}">${e(day)}</span><br><span style="font-size:15px;color:${C.muted}">&mdash;</span></td>`
    )
    .join('')}</tr></table>`
  return { html, text: '' }
}

/** Ingresso do jogo em tinta, com picote. */
export function ticket(input: {
  tag: string
  title: string
  when: string
  number: string
  label: string
}): EmailBlock {
  const html = `<table ${TB} bgcolor="${C.ink}" style="width:100%;border-collapse:separate;background:${C.ink};border-radius:24px;border-bottom:4px solid #000000">
<tr><td style="padding:20px 22px 0">${label(input.tag, C.mutedInk)}</td></tr>
<tr><td style="padding:10px 22px 0;font-family:${F.display};font-size:34px;line-height:1.05;color:${C.paper};text-transform:uppercase;letter-spacing:.005em">${e(input.title)}</td></tr>
<tr><td style="padding:10px 22px 20px"><table ${TI}><tr><td bgcolor="${C.well}" style="background:${C.well};border-radius:8px;padding:7px 10px;font-family:${F.mono};font-size:13px;font-weight:600;color:${C.acid};letter-spacing:.06em">${e(input.when)}</td></tr></table></td></tr>
<tr><td style="padding:0 22px"><div style="border-top:2px dashed ${C.line};height:0;line-height:0;font-size:0">&nbsp;</div></td></tr>
<tr><td style="padding:18px 22px 22px"><table ${TI}><tr><td valign="middle" style="padding-right:16px;${bigNumber(44)};line-height:1">${e(input.number)}</td><td valign="middle" style="font-family:${F.body};font-size:15px;line-height:1.35;color:${C.softInk}">${e(input.label)}</td></tr></table></td></tr></table>`
  return {
    html,
    text: [
      input.tag,
      input.title,
      input.when,
      `${input.number} ${input.label}`
    ].join('\n')
  }
}

/** O anexo à vista, com o nome do arquivo. */
export function fileCard(name: string, detail: string): EmailBlock {
  const html = `<table ${TB} bgcolor="${C.stone}" style="width:100%;border-collapse:separate;background:${C.stone};border-radius:16px"><tr><td width="64" style="width:64px;padding:16px 0 16px 16px"><table ${TI}><tr><td width="44" height="44" align="center" bgcolor="${C.ink}" style="width:44px;height:44px;background:${C.ink};border-radius:12px;font-family:${F.mono};font-size:15px;font-weight:600;color:${C.acid}">{&nbsp;}</td></tr></table></td><td style="padding:16px 16px 16px 4px"><div style="font-family:${F.mono};font-size:14px;font-weight:600;color:${C.ink};word-break:break-all">${e(name)}</div><div style="padding-top:4px">${label(detail)}</div></td></tr></table>`
  return { html, text: `Anexo: ${name} (${detail})` }
}

/** Texto de quem escreveu, escapado e com as quebras de linha dele. */
export function quote(text: string): EmailBlock {
  const html = `<table ${TB} bgcolor="${C.stone}" style="width:100%;border-collapse:separate;background:${C.stone};border-radius:16px"><tr><td style="padding:18px 20px;font-family:${F.body};font-size:16px;line-height:1.55;color:${C.ink};white-space:pre-wrap">${e(text)}</td></tr></table>`
  return { html, text }
}

/** Tabela de dados: rótulo mono à esquerda, valor à direita. */
export function metaTable(rows: [key: string, value: string][]): EmailBlock {
  const html = `<table ${T}>${rows
    .map(
      ([key, value]) =>
        `<tr><td valign="top" width="120" style="width:120px;padding:8px 12px 8px 0;border-top:1px solid ${C.sand}">${label(key)}</td><td style="padding:8px 0;border-top:1px solid ${C.sand};font-family:${F.mono};font-size:13px;line-height:1.45;color:${C.ink};word-break:break-word">${e(value)}</td></tr>`
    )
    .join('')}</table>`
  return {
    html,
    text: rows.map(([key, value]) => `${key}: ${value}`).join('\n')
  }
}

export function paragraph(text: string): EmailBlock {
  return {
    html: `<p style="margin:0;font-family:${F.body};font-size:16px;line-height:1.55;color:${C.body}">${e(text)}</p>`,
    text
  }
}

/**
 * A faixa-ticker (estática: e-mail não anima). `lead` sai em papel antes dos
 * itens; os itens se separam por bola vermelha (`dot`) ou ponto médio.
 */
export function band(
  items: string[],
  options: { separator?: 'dot' | 'middot'; lead?: string } = {}
): string {
  const separator =
    options.separator === 'middot'
      ? ' &nbsp;·&nbsp; '
      : ` &nbsp;<span style="color:${C.red}">●</span>&nbsp; `
  const lead = options.lead
    ? `<span style="color:${C.paper}">${e(options.lead)}</span>${separator}`
    : ''
  return `${lead}${items.map(e).join(separator)}`
}

function stepRows(items: string[], numbered: boolean) {
  if (numbered) {
    return `<table ${T}>${items
      .map(
        (step, i) =>
          `<tr><td valign="top" width="34" style="padding:0 0 12px;width:34px"><table ${TI}><tr><td width="24" height="24" align="center" bgcolor="${C.ink}" style="width:24px;height:24px;background:${C.ink};border-radius:999px;font-family:${F.mono};font-size:12px;font-weight:600;color:${C.acid};line-height:24px">${i + 1}</td></tr></table></td><td valign="top" style="padding:2px 0 12px;font-family:${F.body};font-size:15.5px;line-height:1.5;color:${C.body}">${e(step)}</td></tr>`
      )
      .join('')}</table>`
  }
  return `<table ${T}>${items
    .map(
      (step) =>
        `<tr><td style="padding:11px 0;border-top:1px solid ${C.sand};font-family:${F.body};font-size:15.5px;line-height:1.5;color:${C.body}">${e(step)}</td></tr>`
    )
    .join('')}</table>`
}

function button(text: string, url: string, tone: 'primary' | 'secondary') {
  const [background, color, shadow] =
    tone === 'primary' ? [C.acid, C.ink, C.drop] : [C.ink, C.paper, '#000000']
  return `<table ${TI}><tr><td bgcolor="${background}" style="background:${background};border-radius:999px;border-bottom:4px solid ${shadow};mso-padding-alt:17px 28px"><a href="${e(url)}" style="display:inline-block;padding:17px 28px;font-family:${F.body};font-size:16px;font-weight:700;line-height:1;color:${color};text-decoration:none;border-radius:999px">${e(text)}&nbsp;&rarr;</a></td></tr></table>`
}

export function createOnsideEmailTemplate({
  heading,
  headingAccent,
  tag,
  band: bandHtml,
  intro,
  blocks = [],
  steps,
  numberedSteps = false,
  action,
  actionUrl,
  actionTone = 'primary',
  linkFallback = true,
  note,
  noteLabel,
  reason,
  optOut
}: OnsideEmailInput): { html: string; text: string } {
  const title = headingAccent ? `${heading} ${headingAccent}` : heading
  const cta = action && actionUrl ? { action, url: actionUrl } : null
  const row = (padding: string, content: string) =>
    `<tr><td bgcolor="${C.card}" style="background:${C.card};padding:${padding}">${content}</td></tr>`

  const text = [
    tag ? `ONSIDE · ${tag}` : 'ONSIDE',
    title,
    intro,
    ...blocks.map((block) => block.text).filter(Boolean),
    ...(steps.length
      ? [
          steps
            .map((step, i) => `${numberedSteps ? `${i + 1}.` : '•'} ${step}`)
            .join('\n')
        ]
      : []),
    ...(cta ? [`${cta.action}:\n${cta.url}`] : []),
    ...(note ? [note] : []),
    [
      '--',
      'Onside · O jogo começa aqui.',
      reason,
      ...(optOut ? [`${optOut.label}: ${optOut.url}`] : [])
    ].join('\n')
  ].join('\n\n')

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<link href="${EMAIL_FONTS_URL}" rel="stylesheet">
<title>${e(title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};color:${C.ink}">
<table ${T} bgcolor="${C.paper}"><tr><td align="center" style="padding:24px 12px 32px">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;table-layout:fixed">
<tr><td bgcolor="${C.ink}" style="background:${C.ink};border-radius:24px 24px 0 0;padding:22px 28px">
<table ${T}><tr><td valign="middle"><img src="${EMAIL_LOGO_URL}" width="${LOGO_WIDTH}" height="${LOGO_HEIGHT}" alt="Onside" style="display:block;width:${LOGO_WIDTH}px;height:${LOGO_HEIGHT}px;border:0"></td>${tag ? `<td valign="middle" align="right">${label(tag, C.softInk)}</td>` : ''}</tr></table>
</td></tr>
${bandHtml ? `<tr><td bgcolor="${C.raised}" style="background:${C.raised};border-top:1px solid ${C.line};padding:11px 28px"><div style="white-space:nowrap;overflow:hidden;font-family:${F.mono};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.acid}">${bandHtml}</div></td></tr>` : ''}
${row('36px 28px 0', `<h1 style="margin:0;font-family:${F.display};font-size:46px;font-weight:400;line-height:1;letter-spacing:-.005em;text-transform:uppercase;color:${C.ink}">${e(heading)}${headingAccent ? `<br><span style="color:${C.red}">${e(headingAccent)}</span>` : ''}</h1>`)}
${row('18px 28px 0', `<p style="margin:0;font-family:${F.body};font-size:17px;line-height:1.55;color:${C.body}">${e(intro)}</p>`)}
${blocks.map((block) => row('24px 28px 0', block.html)).join('\n')}
${steps.length ? row('24px 28px 0', stepRows(steps, numberedSteps)) : ''}
${cta ? row('28px 28px 0', button(cta.action, cta.url, actionTone)) : ''}
${cta && linkFallback ? row('18px 28px 0', `<p style="margin:0;font-family:${F.body};font-size:13px;line-height:1.55;color:${C.muted}">Se o botão não abrir, copie este endereço no navegador:<br><a href="${e(cta.url)}" style="font-family:${F.mono};font-size:12.5px;color:${C.ink};word-break:break-all">${e(cta.url)}</a></p>`) : ''}
${note ? row('24px 28px 0', `<table ${T}><tr><td style="padding-top:18px;border-top:1px solid ${C.sand}">${noteLabel ? label(noteLabel) : ''}<p style="margin:${noteLabel ? '6px' : '0'} 0 0;font-family:${F.body};font-size:14px;line-height:1.55;color:${C.muted}">${e(note)}</p></td></tr></table>`) : ''}
<tr><td bgcolor="${C.card}" style="background:${C.card};padding:28px 28px 26px;border-radius:0 0 24px 24px;border-bottom:3px solid ${C.sand}">
<table ${T}><tr><td style="padding-top:16px;border-top:1px solid ${C.sand};font-family:${F.body};font-size:12.5px;line-height:1.6;color:${C.muted}">${e(reason)}${optOut ? `<br><a href="${e(optOut.url)}" style="display:inline-block;margin-top:8px;font-family:${F.mono};font-size:12px;font-weight:600;letter-spacing:.04em;color:${C.ink};text-decoration:underline">${e(optOut.label)}&nbsp;&rarr;</a>` : ''}</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:20px 28px 0;font-family:${F.mono};font-size:11px;font-weight:600;letter-spacing:.1em;color:${C.muted}">ONSIDE · O JOGO COMEÇA AQUI · <a href="${SITE_URL}" style="color:${C.muted}">ONSIDE.SH</a></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body>
</html>`

  return { html, text }
}
