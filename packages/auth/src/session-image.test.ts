import { describe, expect, it } from 'bun:test'
import { isSafeUserImage } from './session-image'

const USER = 'user-123'
const HOSTS = { MEDIA_PUBLIC_ORIGIN: 'https://media.onside.sh' }
const OWN = `https://media.onside.sh/users/${USER}/avatar`
const OLD = `https://loja-123.public.blob.vercel-storage.com/users/${USER}/avatar`

describe('foto no user da sessão', () => {
  it('aceita limpar o campo e o avatar do próprio usuário no nosso host', () => {
    expect(isSafeUserImage(null, USER, HOSTS)).toBe(true)
    expect(isSafeUserImage(undefined, USER, HOSTS)).toBe(true)
    expect(isSafeUserImage('', USER, HOSTS)).toBe(true)
    expect(isSafeUserImage(OWN, USER, HOSTS)).toBe(true)
    expect(isSafeUserImage(`${OWN}?v=1759500000000`, USER, HOSTS)).toBe(true)
  })

  it('recusa o store antigo do Vercel Blob, migrado no WEB-202', () => {
    expect(isSafeUserImage(OLD, USER, HOSTS)).toBe(false)
  })

  it('recusa host de terceiro, mesmo https e com o mesmo caminho', () => {
    for (const image of [
      `https://evil.example/users/${USER}/avatar`,
      `https://outra.public.blob.vercel-storage.com/users/${USER}/avatar`,
      `https://media.onside.sh.evil.example/users/${USER}/avatar`,
      `https://x.media.onside.sh/users/${USER}/avatar`,
      `https://e2e.r2.cloudflarestorage.com/onside-media/users/${USER}/avatar`
    ]) {
      expect(isSafeUserImage(image, USER, HOSTS)).toBe(false)
    }
  })

  it('recusa avatar de outro usuário, sem usuário ou sem host configurado', () => {
    expect(isSafeUserImage(OWN, 'user-999', HOSTS)).toBe(false)
    expect(isSafeUserImage(OWN, undefined, HOSTS)).toBe(false)
    expect(isSafeUserImage(OWN, USER, {})).toBe(false)
  })

  it('recusa data URL, http, porta, javascript e não-string', () => {
    expect(
      isSafeUserImage('data:image/jpeg;base64,/9j/AAAA', USER, HOSTS)
    ).toBe(false)
    expect(isSafeUserImage(OWN.replace('https', 'http'), USER, HOSTS)).toBe(
      false
    )
    expect(isSafeUserImage(OWN.replace('.sh/', '.sh:444/'), USER, HOSTS)).toBe(
      false
    )
    expect(isSafeUserImage('javascript:alert(1)', USER, HOSTS)).toBe(false)
    expect(isSafeUserImage(12, USER, HOSTS)).toBe(false)
    expect(isSafeUserImage(`${OWN}?${'a'.repeat(2100)}`, USER, HOSTS)).toBe(
      false
    )
  })
})
