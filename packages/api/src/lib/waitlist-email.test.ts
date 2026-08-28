import { describe, expect, it } from 'bun:test'
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
