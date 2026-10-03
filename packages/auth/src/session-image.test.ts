import { describe, expect, it } from 'bun:test'
import { isSafeUserImage } from './session-image'

const USER = 'user-123'
const STORE = 'loja-123'
const OWN = `https://${STORE}.public.blob.vercel-storage.com/users/${USER}/avatar`

describe('foto no user da sessão', () => {
  it('aceita limpar o campo e o avatar do próprio usuário no nosso store', () => {
    expect(isSafeUserImage(null, USER, STORE)).toBe(true)
    expect(isSafeUserImage(undefined, USER, STORE)).toBe(true)
    expect(isSafeUserImage('', USER, STORE)).toBe(true)
    expect(isSafeUserImage(OWN, USER, STORE)).toBe(true)
  })

  it('recusa host de terceiro, mesmo https e com o mesmo caminho', () => {
    expect(
      isSafeUserImage(`https://evil.example/users/${USER}/avatar`, USER, STORE)
    ).toBe(false)
    expect(
      isSafeUserImage(
        `https://outra.public.blob.vercel-storage.com/users/${USER}/avatar`,
        USER,
        STORE
      )
    ).toBe(false)
  })

  it('recusa avatar de outro usuário, sem usuário ou sem store', () => {
    expect(isSafeUserImage(OWN, 'user-999', STORE)).toBe(false)
    expect(isSafeUserImage(OWN, undefined, STORE)).toBe(false)
    expect(isSafeUserImage(OWN, USER, undefined)).toBe(false)
  })

  it('recusa data URL, http, porta, javascript e não-string', () => {
    expect(
      isSafeUserImage('data:image/jpeg;base64,/9j/AAAA', USER, STORE)
    ).toBe(false)
    expect(isSafeUserImage(OWN.replace('https', 'http'), USER, STORE)).toBe(
      false
    )
    expect(
      isSafeUserImage(OWN.replace('.com/', '.com:444/'), USER, STORE)
    ).toBe(false)
    expect(isSafeUserImage('javascript:alert(1)', USER, STORE)).toBe(false)
    expect(isSafeUserImage(12, USER, STORE)).toBe(false)
  })
})
