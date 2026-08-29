import { describe, expect, it } from 'bun:test'
import { isSafeUserImage } from './session-image'

describe('foto no user da sessão', () => {
  it('aceita URL https curta, nulo e string vazia', () => {
    expect(isSafeUserImage(null)).toBe(true)
    expect(isSafeUserImage(undefined)).toBe(true)
    expect(isSafeUserImage('')).toBe(true)
    expect(
      isSafeUserImage(
        'https://store.public.blob.vercel-storage.com/users/abc/avatar'
      )
    ).toBe(true)
  })

  it('recusa data URL, http, javascript e string longa demais', () => {
    expect(isSafeUserImage('data:image/jpeg;base64,/9j/AAAA')).toBe(false)
    expect(isSafeUserImage('http://onside.sh/foto.jpg')).toBe(false)
    expect(isSafeUserImage('javascript:alert(1)')).toBe(false)
    expect(isSafeUserImage(`https://onside.sh/${'a'.repeat(2100)}`)).toBe(false)
    expect(isSafeUserImage(12)).toBe(false)
  })
})
