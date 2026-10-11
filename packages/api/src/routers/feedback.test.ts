import { describe, expect, test } from 'bun:test'

import { PHOTO_MAX_BYTES } from '../lib/blob-photo'
import { FEEDBACK_MAX_LENGTH } from '../lib/feedback'
import { createFeedbackEmail, feedbackAttachments } from './feedback'
import { appRouter } from './index'
import { contextFor, refusal } from './integration-seed'

/**
 * O que `feedback.send` recusa antes de tocar o banco, e o e-mail que monta.
 * Envio, limite por usuário e anexos de ponta a ponta estão em
 * `feedback.integration.test.ts`.
 */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const WEBP = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]

/** Arquivo em base64 que começa com `head` e tem `size` bytes. */
function file(head: number[], size = 64): string {
  const bytes = Buffer.alloc(size)
  bytes.set(head)
  return bytes.toString('base64')
}

const fan = appRouter.createCaller(contextFor(crypto.randomUUID(), 'fan'))
const message = 'O mapa não carregou no meu celular.'
const pageUrl = 'https://www.onside.sh/dashboard'

describe('feedback.send recusa', () => {
  test('quem não tem sessão', async () => {
    const visitor = appRouter.createCaller({
      auth: null,
      session: null,
      clientIp: '127.0.0.1'
    })
    expect(
      (await refusal(visitor.feedback.send({ message, pageUrl }))).code
    ).toBe('UNAUTHORIZED')
  })

  test.each([
    ['curto demais depois de aparar', '   curto    '],
    ['longo demais', 'a'.repeat(FEEDBACK_MAX_LENGTH + 1)]
  ])('texto %s', async (_caso, text) => {
    expect(
      (await refusal(fan.feedback.send({ message: text, pageUrl }))).code
    ).toBe('BAD_REQUEST')
  })

  test('mais de três imagens', async () => {
    const { code, message: reason } = await refusal(
      fan.feedback.send({ message, pageUrl, images: Array(4).fill(file(PNG)) })
    )
    expect(code).toBe('PAYLOAD_TOO_LARGE')
    expect(reason).toBe('Envie no máximo 3 imagens por mensagem.')
  })

  test('imagem acima de 5 MB', async () => {
    const { code, message: reason } = await refusal(
      fan.feedback.send({
        message,
        pageUrl,
        images: [file(PNG), file(PNG, PHOTO_MAX_BYTES + 1)]
      })
    )
    expect(code).toBe('PAYLOAD_TOO_LARGE')
    expect(reason).toBe('A imagem 2 passa de 5 MB.')
  })

  test.each([
    [
      'texto com nome de imagem',
      Buffer.from('isto não é um PNG, só o nome era')
    ],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['GIF', Buffer.from('GIF89a................')],
    ['arquivo vazio', Buffer.alloc(0)]
  ])('%s no lugar de imagem', async (_caso, bytes) => {
    const { code, message: reason } = await refusal(
      fan.feedback.send({
        message,
        pageUrl,
        images: [bytes.toString('base64')]
      })
    )
    expect(code).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(reason).toBe('A imagem 1 não é JPEG, PNG nem WebP.')
  })

  test('base64 com lixo no meio, mesmo começando como PNG', async () => {
    const { code } = await refusal(
      fan.feedback.send({
        message,
        pageUrl,
        images: [`${file(PNG)}\n<script>`]
      })
    )
    expect(code).toBe('UNSUPPORTED_MEDIA_TYPE')
  })
})

describe('anexos do feedback', () => {
  test('nome e tipo saem dos bytes, na ordem de envio', () => {
    expect(
      feedbackAttachments([file(JPEG), file(PNG), file(WEBP)]).map(
        ({ filename, contentType }) => [filename, contentType]
      )
    ).toEqual([
      ['imagem-1.jpg', 'image/jpeg'],
      ['imagem-2.png', 'image/png'],
      ['imagem-3.webp', 'image/webp']
    ])
  })

  test('imagem de exatamente 5 MB passa', () => {
    expect(feedbackAttachments([file(PNG, PHOTO_MAX_BYTES)])).toHaveLength(1)
  })
})

describe('e-mail de feedback', () => {
  const base = {
    message,
    name: 'Ana Souza',
    email: 'ana@example.com',
    role: 'fan' as const,
    barName: null,
    pageUrl,
    userAgent: 'Mozilla/5.0 (iPhone)',
    sentAt: new Date('2026-10-11T15:04:00Z'),
    imageCount: 0
  }

  test('torcedor: assunto com o começo da mensagem e corpo com os dados', () => {
    const email = createFeedbackEmail(base)
    expect(email.subject).toBe(
      'Feedback de torcedor: O mapa não carregou no meu celular.'
    )
    expect(email.text).toBe(
      [
        message,
        '',
        '--',
        'Nome: Ana Souza',
        'E-mail: ana@example.com',
        'Papel: torcedor',
        'Página: https://www.onside.sh/dashboard',
        'Navegador: Mozilla/5.0 (iPhone)',
        'Enviado em: 11/10/2026, 12:04:00 (horário de Brasília)'
      ].join('\n')
    )
  })

  test('bar: assunto e corpo levam o nome do bar e a contagem de imagens', () => {
    const email = createFeedbackEmail({
      ...base,
      role: 'pub',
      barName: 'Bar do Zé',
      imageCount: 2
    })
    expect(email.subject).toBe(
      'Feedback de bar (Bar do Zé): O mapa não carregou no meu celular.'
    )
    expect(email.text).toContain('\nPapel: bar\nBar: Bar do Zé\n')
    expect(email.text).toEndWith('\nImagens anexadas: 2')
  })

  test('assunto fica em uma linha e corta em palavra inteira', () => {
    const { subject } = createFeedbackEmail({
      ...base,
      message: `Primeira linha\r\nBcc: alguem@example.com\n\t${'palavra '.repeat(20)}`
    })
    expect(subject).not.toMatch(/[\r\n\t]/)
    expect(subject).toBe(
      'Feedback de torcedor: Primeira linha Bcc: alguem@example.com palavra palavra…'
    )
  })

  test('HTML escapa o que a pessoa escreveu, na mensagem e no nome', () => {
    const { html, text } = createFeedbackEmail({
      ...base,
      message: 'Olha: <img src=x onerror=alert(1)> & <b>isto</b>',
      name: '<script>alert(1)</script>'
    })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &lt;b&gt;')
    expect(html).toContain('Nome: &lt;script&gt;alert(1)&lt;/script&gt;')
    // O texto simples vai como foi escrito.
    expect(text).toContain('<img src=x onerror=alert(1)>')
  })
})
