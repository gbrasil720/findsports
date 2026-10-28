import { describe, expect, it } from 'bun:test'
import { EMAIL_LOGO_URL } from '@findsports_oficial/config/site'
import { createOnsideEmailTemplate, type EmailBlock } from './email-layout'

const input = {
  heading: 'Confirme seu e-mail',
  intro: 'Olá, Ana. Falta um passo.',
  steps: ['Primeiro passo.', 'Segundo passo.'],
  action: 'Confirmar meu e-mail',
  actionUrl: 'https://www.onside.sh/verify?token=abc',
  note: 'Se não foi você, ignore.',
  reason: 'Você recebeu este e-mail porque se cadastrou.'
}

const visible = (html: string) =>
  html
    .slice(html.indexOf('<body'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// O Outlook mandava os e-mails para o lixo eletrônico com SPF/DKIM/DMARC
// passando: o que estes testes travam é o conteúdo que sai do filtro.
describe('layout dos e-mails Onside', () => {
  it('leva só o wordmark de imagem, sem preheader escondido nem <style>', () => {
    const { html } = createOnsideEmailTemplate(input)
    const images = html.match(/<img [^>]*>/g) ?? []
    expect(images).toHaveLength(1)
    expect(images[0]).toContain(`src="${EMAIL_LOGO_URL}"`)
    expect(images[0]).toContain('alt="Onside"')
    expect(images[0]).toContain('width="112" height="34"')
    expect(html).not.toContain('display:none')
    expect(html).not.toContain('<style')
    expect(html).not.toContain('<link')
  })

  it('tem um só botão, com o mesmo link em texto embaixo', () => {
    const { html } = createOnsideEmailTemplate(input)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      'https://www.onside.sh/verify?token=abc',
      'https://www.onside.sh/verify?token=abc'
    ])
    expect(html).toContain('Se o botão não funcionar, copie e cole')
  })

  it('abre com etiqueta, título e a introdução, que a caixa de entrada usa de prévia', () => {
    const { html } = createOnsideEmailTemplate({
      ...input,
      tag: 'CONTA',
      heading: 'Confirme seu',
      headingAccent: 'e-mail'
    })
    expect(visible(html)).toStartWith(
      'CONTA Confirme seu e-mail Olá, Ana. Falta um passo.'
    )
    expect(html).toContain('<title>Confirme seu e-mail</title>')
  })

  it('manda em texto puro a mesma copy do HTML', () => {
    const { text } = createOnsideEmailTemplate(input)
    expect(text).toBe(
      [
        'ONSIDE',
        'Confirme seu e-mail',
        'Olá, Ana. Falta um passo.',
        '1. Primeiro passo.\n2. Segundo passo.',
        'Confirmar meu e-mail:\nhttps://www.onside.sh/verify?token=abc',
        'SEGURANÇA\nSe não foi você, ignore.',
        '--\nOnside · O jogo começa aqui.\nVocê recebeu este e-mail porque se cadastrou.'
      ].join('\n\n')
    )
    expect(text).not.toContain('<')
  })

  it('omite os passos quando não há', () => {
    const { html, text } = createOnsideEmailTemplate({ ...input, steps: [] })
    expect(html).not.toContain('>1</td>')
    expect(text).not.toContain('1. ')
  })

  it('sem os campos novos, sai sem etiqueta, linha de cima, destaque nem desligar', () => {
    const { html } = createOnsideEmailTemplate(input)
    expect(html).not.toContain('#c92b0c">Confirme') // destaque vermelho
    expect(html).toContain('max-width:566px')
    expect(html.match(/<a /g)).toHaveLength(2)
    // Sombra acid por padrão.
    expect(html).toContain('width="6" bgcolor="#c9f135"')
  })

  it('sombra escura, etiqueta do fecho e link para desligar', () => {
    const { html, text } = createOnsideEmailTemplate({
      ...input,
      shadow: 'ink',
      noteTag: 'AVISOS',
      optOut: {
        label: 'Desligar em Configurações › Avisos',
        url: 'https://www.onside.sh/admin/configuracoes#avisos'
      }
    })
    expect(html).toContain('width="6" bgcolor="#12120f"')
    expect(html).toContain('>AVISOS</div>')
    expect(html).toContain(
      'href="https://www.onside.sh/admin/configuracoes#avisos"'
    )
    expect(text).toContain('AVISOS\nSe não foi você, ignore.')
    expect(text).toEndWith(
      'Desligar em Configurações › Avisos: https://www.onside.sh/admin/configuracoes#avisos'
    )
  })

  it('blocos saem na ordem, no HTML e em linhas no texto', () => {
    const blocks: EmailBlock[] = [
      { kind: 'chips', items: [{ label: 'USO ÚNICO', strong: true }] },
      { kind: 'stats', items: [{ value: '486', label: 'pessoas foram' }] },
      {
        kind: 'games',
        label: 'NESTA SEMANA',
        items: [
          {
            weekday: 'QUA',
            day: '28/10',
            title: 'Corinthians × Palmeiras',
            detail: '21:30 · Brasileirão'
          }
        ],
        more: 'e mais 1 outro jogo.'
      },
      {
        kind: 'ticket',
        tag: 'NO SEU BAR',
        title: 'Grêmio × Inter',
        when: 'QUI., 29/10, 19:00',
        number: '20+',
        label: 'pessoas vão'
      },
      {
        kind: 'week',
        label: 'SEMANA',
        days: [{ weekday: 'SEG', day: '26' }],
        note: 'Nenhum jogo.'
      },
      { kind: 'file', name: 'dados.json', detail: 'JSON' }
    ]
    const { html, text } = createOnsideEmailTemplate({
      ...input,
      steps: [],
      blocks
    })
    const order = [
      'USO ÚNICO',
      '486',
      'Corinthians × Palmeiras',
      'Grêmio × Inter',
      'Nenhum jogo.',
      'dados.json'
    ]
    const at = order.map((piece) => html.indexOf(piece))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(text).toContain(
      [
        '[USO ÚNICO]',
        '486 pessoas foram',
        'NESTA SEMANA\nQUA 28/10 · Corinthians × Palmeiras · 21:30 · Brasileirão\ne mais 1 outro jogo.',
        'NO SEU BAR\nGrêmio × Inter\nQUI., 29/10, 19:00\n20+ pessoas vão',
        'SEMANA\nNenhum jogo.',
        'Anexo: dados.json (JSON)'
      ].join('\n\n')
    )
    // Cada bloco segue a regra: tabela, sem imagem nova.
    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).not.toContain('<style')
  })

  it('escapa tudo que vem de fora, inclusive dentro dos blocos', () => {
    const evil = '<script>"x"&\''
    const { html } = createOnsideEmailTemplate({
      ...input,
      tag: evil,
      eyebrow: evil,
      heading: evil,
      headingAccent: evil,
      intro: evil,
      steps: [evil],
      note: evil,
      noteTag: evil,
      reason: evil,
      optOut: { label: evil, url: 'https://x.test/?a=1&b="2"' },
      blocks: [
        { kind: 'chips', items: [{ label: evil }] },
        { kind: 'stats', items: [{ value: evil, label: evil }] },
        {
          kind: 'games',
          label: evil,
          items: [{ weekday: evil, day: evil, title: evil, detail: evil }],
          more: evil
        },
        {
          kind: 'ticket',
          tag: evil,
          title: evil,
          when: evil,
          number: evil,
          label: evil
        },
        {
          kind: 'week',
          label: evil,
          days: [{ weekday: evil, day: evil }],
          note: evil
        },
        { kind: 'file', name: evil, detail: evil }
      ]
    })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('"x"')
    expect(html).toContain('&lt;script&gt;&quot;x&quot;&amp;&#39;')
    expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"')
  })
})
