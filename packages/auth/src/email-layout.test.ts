import { describe, expect, it } from 'bun:test'
import { EMAIL_LOGO_URL } from '@findsports_oficial/config/site'
import { createOnsideEmailTemplate } from './email-layout'

const input = {
  heading: 'Confirme seu e-mail',
  intro: 'Olá, Ana. Falta um passo.',
  steps: ['Primeiro passo.', 'Segundo passo.'],
  action: 'Confirmar meu e-mail',
  actionUrl: 'https://www.onside.sh/verify?token=abc',
  note: 'Se não foi você, ignore.',
  reason: 'Você recebeu este e-mail porque se cadastrou.'
}

// O Outlook mandava os e-mails para o lixo eletrônico com SPF/DKIM/DMARC
// passando: o que estes testes travam é o conteúdo que sai do filtro.
describe('layout dos e-mails Onside', () => {
  it('leva só o wordmark de imagem, sem preheader escondido', () => {
    const { html } = createOnsideEmailTemplate(input)
    const images = html.match(/<img [^>]*>/g) ?? []
    expect(images).toHaveLength(1)
    expect(images[0]).toContain(`src="${EMAIL_LOGO_URL}"`)
    expect(images[0]).toContain('alt="Onside"')
    expect(images[0]).toContain('width="132" height="40"')
    expect(html).not.toContain('display:none')
    expect(html).not.toContain('<style')
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

  it('abre com a introdução visível, que a caixa de entrada usa de prévia', () => {
    const { html } = createOnsideEmailTemplate(input)
    const body = html.slice(html.indexOf('<body'))
    const visibleText = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(visibleText.trim()).toStartWith(
      'Confirme seu e-mail Olá, Ana. Falta um passo.'
    )
  })

  it('manda em texto puro a mesma copy do HTML', () => {
    const { text } = createOnsideEmailTemplate(input)
    expect(text).toBe(
      [
        'ONSIDE',
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

  it('omite a lista quando não há passos', () => {
    const { html, text } = createOnsideEmailTemplate({ ...input, steps: [] })
    expect(html).not.toContain('<ul')
    expect(text).not.toContain('•')
  })
})
