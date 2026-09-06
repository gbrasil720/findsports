import { describe, expect, it } from 'bun:test'
import {
  EMAIL_HERO_IMAGE_URL,
  EMAIL_LOGO_URL
} from '@findsports_oficial/config/site'
import { createWaitlistEmail } from './waitlist-email'

const baseInput = {
  url: 'https://onside.app/action?token=abc&role=fan',
  logoUrl: 'https://onside.app/onside-wordmark-paper.png',
  heroImageUrl: 'https://onside.app/og-image.jpg'
}

describe('e-mails da waitlist Onside', () => {
  it.each([
    ['confirm', 'Confirmar meu e-mail', 'inscrição só fica ativa'],
    ['joined', 'Sair da waitlist', 'Não precisa fazer nada'],
    ['invite', 'Ativar minha conta', 'reservado por 7 dias'],
    ['approved-existing', 'Entrar na Onside', 'mesmo e-mail e a senha'],
    ['launch', 'Criar minha conta', 'Torcedores encontram bares']
  ] as const)('mantém propósito e contexto no modelo %s', (kind, action, detail) => {
    const email = createWaitlistEmail({ ...baseInput, kind })

    expect(email.subject).not.toBeEmpty()
    expect(email.html).toContain('onside-wordmark-paper.png')
    expect(email.html).toContain('og-image.jpg')
    expect(email.html).toContain(action)
    expect(email.html).toContain(detail)
    expect(email.html).toContain('O que acontece agora')
    expect(email.html).toContain('token=abc&amp;role=fan')
    expect(email.text).toContain(baseInput.url)
  })
})

describe('assets de imagem dos e-mails', () => {
  it('apontam para URL pública e estável, nunca localhost nem host de deploy', () => {
    for (const assetUrl of [EMAIL_LOGO_URL, EMAIL_HERO_IMAGE_URL]) {
      const url = new URL(assetUrl) // relativa lança TypeError
      expect(url.protocol).toBe('https:')
      expect(url.hostname).toBe('www.onside.sh')
      expect(url.search).toContain('v=')
    }
  })

  it('embute as URL canônicas no HTML enviado', () => {
    const email = createWaitlistEmail({
      ...baseInput,
      kind: 'invite',
      logoUrl: EMAIL_LOGO_URL,
      heroImageUrl: EMAIL_HERO_IMAGE_URL
    })
    expect(email.html).toContain(`src="${EMAIL_LOGO_URL}"`)
    expect(email.html).toContain(`src="${EMAIL_HERO_IMAGE_URL}"`)
  })
})
