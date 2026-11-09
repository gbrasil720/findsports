import { describe, expect, test } from 'bun:test'

import { createDataExportEmail } from './account'

describe('e-mail de "Baixar meus dados"', () => {
  test('mostra no corpo o nome do arquivo anexado, nas duas versões', () => {
    const email = createDataExportEmail({
      name: 'Ana',
      role: 'fan',
      filename: 'onside-meus-dados-2026-11-06.json'
    })
    expect(email.subject).toBe('Seus dados da Onside')
    expect(email.html).toContain('onside-meus-dados-2026-11-06.json')
    expect(email.html).toContain('PRIVACIDADE')
    expect(email.text).toContain(
      'Anexo: onside-meus-dados-2026-11-06.json (JSON · anexado a este e-mail)'
    )
    // A política é página pública: o link não se repete em texto no HTML.
    expect(email.html).not.toContain('Se o botão não abrir')
  })

  test('para bar, diz o que vem do bar e que de torcedor não vem nada', () => {
    const email = createDataExportEmail({
      name: 'José',
      role: 'pub',
      filename: 'x.json'
    })
    expect(email.text).toContain('Ele traz a conta, o bar, o plano')
  })

  test('escapa o nome do arquivo', () => {
    const email = createDataExportEmail({
      name: 'Ana',
      role: 'fan',
      filename: '<b>.json'
    })
    expect(email.html).toContain('&lt;b&gt;.json')
  })
})
