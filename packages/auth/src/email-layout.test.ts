import { describe, expect, it } from 'bun:test'
import { EMAIL_LOGO_URL, SITE_URL } from '@findsports_oficial/config/site'
import {
  agenda,
  band,
  createOnsideEmailTemplate,
  EMAIL_FONTS_URL,
  fileCard,
  scoreboard,
  ticket,
  weekGame
} from './email-layout'

const input = {
  heading: 'Confirme seu',
  headingAccent: 'e-mail',
  tag: 'CONTA',
  intro: 'Olá, Ana. Falta um passo.',
  steps: ['Primeiro passo.', 'Segundo passo.'],
  action: 'Confirmar meu e-mail',
  actionUrl: 'https://www.onside.sh/verify?token=abc',
  note: 'Se não foi você, ignore.',
  noteLabel: 'Não foi você?',
  reason: 'Você recebeu este e-mail porque se cadastrou.'
}

const visible = (html: string) =>
  html
    .slice(html.indexOf('<body'))
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// O Outlook mandava os e-mails para o lixo eletrônico com SPF/DKIM/DMARC
// passando: o que estes testes travam é o conteúdo que sai do filtro.
describe('layout dos e-mails Onside', () => {
  it('leva só o wordmark de imagem, sem preheader escondido', () => {
    const { html } = createOnsideEmailTemplate(input)
    const images = html.match(/<img [^>]*>/g) ?? []
    expect(images).toHaveLength(1)
    expect(images[0]).toContain(`src="${EMAIL_LOGO_URL}"`)
    expect(images[0]).toContain('alt="Onside"')
    expect(images[0]).toContain('width="119" height="36"')
    expect(html).not.toContain('display:none')
    expect(html).not.toContain('<style')
    expect(html).toContain('content="light only"')
  })

  it('tem um só botão, com o mesmo link em texto embaixo', () => {
    const { html } = createOnsideEmailTemplate(input)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual([
      EMAIL_FONTS_URL,
      'https://www.onside.sh/verify?token=abc',
      'https://www.onside.sh/verify?token=abc',
      SITE_URL
    ])
    expect(html).toContain('Se o botão não abrir, copie este endereço')
  })

  it('sem linkFallback, o link não se repete; sem ação, não há botão', () => {
    const semFallback = createOnsideEmailTemplate({
      ...input,
      linkFallback: false
    })
    expect(semFallback.html.split(input.actionUrl)).toHaveLength(2)
    expect(semFallback.html).not.toContain('Se o botão não abrir')

    const semBotao = createOnsideEmailTemplate({
      ...input,
      action: undefined,
      actionUrl: undefined
    })
    expect(semBotao.html).not.toContain(input.actionUrl)
    expect(semBotao.text).not.toContain(input.actionUrl)
  })

  it('abre com a etiqueta, o título em duas linhas e a introdução', () => {
    const { html } = createOnsideEmailTemplate(input)
    expect(visible(html)).toStartWith(
      'CONTA Confirme seu e-mail Olá, Ana. Falta um passo.'
    )
    expect(html).toContain(
      'Confirme seu<br><span style="color:#e8320c">e-mail</span>'
    )
    expect(html).toContain('<title>Confirme seu e-mail</title>')
  })

  it('manda em texto puro a mesma copy do HTML', () => {
    const { text } = createOnsideEmailTemplate(input)
    expect(text).toBe(
      [
        'ONSIDE · CONTA',
        'Confirme seu e-mail',
        'Olá, Ana. Falta um passo.',
        '• Primeiro passo.\n• Segundo passo.',
        'Confirmar meu e-mail:\nhttps://www.onside.sh/verify?token=abc',
        'Se não foi você, ignore.',
        '--\nOnside · O jogo começa aqui.\nVocê recebeu este e-mail porque se cadastrou.'
      ].join('\n\n')
    )
    expect(text).not.toContain('<')
  })

  it('numera os passos quando são uma ordem', () => {
    const { text } = createOnsideEmailTemplate({
      ...input,
      numberedSteps: true
    })
    expect(text).toContain('1. Primeiro passo.\n2. Segundo passo.')
  })

  it('omite a lista quando não há passos', () => {
    const { html, text } = createOnsideEmailTemplate({ ...input, steps: [] })
    expect(html).not.toContain('Primeiro passo')
    expect(text).not.toContain('•')
  })

  it('põe o link de desligar no rodapé, nas duas versões', () => {
    const { html, text } = createOnsideEmailTemplate({
      ...input,
      optOut: {
        label: 'Desligar em Configurações › Avisos',
        url: 'https://www.onside.sh/admin/configuracoes'
      }
    })
    expect(html).toContain('Desligar em Configurações › Avisos&nbsp;&rarr;')
    expect(text).toContain(
      'Desligar em Configurações › Avisos: https://www.onside.sh/admin/configuracoes'
    )
  })

  it('as peças escapam o que recebem e dizem o mesmo em texto', () => {
    const { html, text } = createOnsideEmailTemplate({
      ...input,
      band: band(['<b>QUA 11</b>']),
      blocks: [
        fileCard('<x>.json', 'JSON'),
        scoreboard('Bar', [['1', '<i>vez</i>']]),
        agenda('Na sua agenda', [
          { weekday: 'QUA', day: '11/11', title: 'A × <B>', detail: '21:30' }
        ]),
        ticket({
          tag: 'NO SEU BAR',
          title: 'A × B',
          when: 'QUA',
          number: '20+',
          label: 'pessoas'
        })
      ]
    })
    expect(html).not.toMatch(/<(b|x|i|B)>/)
    expect(html).toContain('&lt;b&gt;QUA 11&lt;/b&gt;')
    expect(text).toContain('Anexo: <x>.json (JSON)')
    expect(text).toContain('Bar\n1 <i>vez</i>')
    expect(text).toContain('• QUA 11/11 · A × <B> · 21:30')
    expect(text).toContain('20+ pessoas')
  })

  it('jogo da semana: "Seu time" em acid e "Clássico" em vermelho', () => {
    const { html } = weekGame({
      head: 'Pra sua semana',
      when: 'QUA 18/11 · 21:30',
      tags: [{ text: 'Seu time' }, { text: 'Clássico', red: true }],
      championship: 'Brasileirão',
      title: 'Corinthians × Palmeiras',
      cells: [],
      action: 'Publicar',
      url: 'https://onside.sh/admin/jogos'
    })
    expect(html).toMatch(/background:#c9f135[^>]*>SEU TIME</)
    expect(html).toMatch(/background:#e8320c[^>]*>CLÁSSICO</)
  })
})
