import { describe, expect, test } from 'bun:test'
import { isMicrosoftConsumerEmail } from './microsoft-mail'

describe('isMicrosoftConsumerEmail', () => {
  test('reconhece os domínios de consumidor da Microsoft', () => {
    for (const domain of [
      'outlook.com',
      'outlook.com.br',
      'hotmail.com',
      'hotmail.com.br',
      'live.com',
      'live.com.br',
      'msn.com',
      'windowslive.com',
      'passport.com'
    ])
      expect(isMicrosoftConsumerEmail(`ana@${domain}`)).toBe(true)
  })

  test('ignora caixa e espaço no fim', () => {
    expect(isMicrosoftConsumerEmail('Ana@HotMail.COM ')).toBe(true)
  })

  test('outros domínios e parecidos não contam', () => {
    for (const email of [
      'ana@gmail.com',
      'ana@onside.sh',
      'ana@hotmail.co',
      'ana@mail.hotmail.com',
      'ana@outlook.company.com',
      'hotmail.com',
      ''
    ])
      expect(isMicrosoftConsumerEmail(email)).toBe(false)
  })
})
