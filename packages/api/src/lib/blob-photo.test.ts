import { describe, expect, it } from 'bun:test'

import { isOwnPhotoPathname, isOwnPhotoUrl, photoPathname } from './blob-photo'

const BAR = 'bar-123'
const OUTRO = 'bar-999'
const HOST = 'https://loja-123.public.blob.vercel-storage.com'
const STORE_ID = 'loja-123'

describe('caminho da foto (ESC-15)', () => {
  it('aceita o caminho do próprio bar', () => {
    expect(isOwnPhotoPathname(photoPathname(BAR), BAR)).toBe(true)
  })

  it('recusa o caminho de outro bar', () => {
    expect(isOwnPhotoPathname(photoPathname(OUTRO), BAR)).toBe(false)
  })

  it('recusa tentativa de subir para fora da própria pasta', () => {
    for (const caminho of [
      'bars/bar-123/../bar-999/photo',
      'bars/bar-123/photo/../../bar-999/photo',
      '../bars/bar-999/photo',
      'bars/bar-123/outro-arquivo',
      'bars/bar-123/photo/extra'
    ]) {
      expect(isOwnPhotoPathname(caminho, BAR)).toBe(false)
    }
  })

  it('recusa caminho que apenas começa igual', () => {
    // `bar-1234` começa com `bar-123`; comparação por prefixo deixaria passar.
    expect(isOwnPhotoPathname('bars/bar-1234/photo', BAR)).toBe(false)
  })
})

describe('URL da foto (ESC-15)', () => {
  it('aceita URL do nosso armazenamento na pasta do bar', () => {
    expect(isOwnPhotoUrl(`${HOST}/bars/${BAR}/photo`, BAR, STORE_ID)).toBe(true)
  })

  it('recusa sufixo acrescentado ao caminho exato', () => {
    expect(
      isOwnPhotoUrl(`${HOST}/bars/${BAR}/photo-A1b2C3`, BAR, STORE_ID)
    ).toBe(false)
  })

  it('recusa URL de outro bar', () => {
    expect(isOwnPhotoUrl(`${HOST}/bars/${OUTRO}/photo`, BAR, STORE_ID)).toBe(
      false
    )
  })

  it('recusa outra loja, mesmo com o caminho idêntico', () => {
    expect(
      isOwnPhotoUrl(
        `https://outra.public.blob.vercel-storage.com/bars/${BAR}/photo`,
        BAR,
        STORE_ID
      )
    ).toBe(false)
  })

  it('recusa host que apenas contém o sufixo no meio', () => {
    expect(
      isOwnPhotoUrl(
        `https://x.public.blob.vercel-storage.com.exemplo.com/bars/${BAR}/photo`,
        BAR,
        STORE_ID
      )
    ).toBe(false)
  })

  it('recusa http sem TLS', () => {
    expect(
      isOwnPhotoUrl(
        `http://loja-123.public.blob.vercel-storage.com/bars/${BAR}/photo`,
        BAR,
        STORE_ID
      )
    ).toBe(false)
  })

  it('recusa string que não é URL', () => {
    expect(isOwnPhotoUrl('não é uma url', BAR, STORE_ID)).toBe(false)
    expect(isOwnPhotoUrl('', BAR, STORE_ID)).toBe(false)
  })

  it('recusa javascript: e data:', () => {
    expect(isOwnPhotoUrl('javascript:alert(1)', BAR, STORE_ID)).toBe(false)
    expect(isOwnPhotoUrl('data:image/png;base64,AAA', BAR, STORE_ID)).toBe(
      false
    )
  })

  it('recusa porta alternativa e configuração ausente', () => {
    expect(isOwnPhotoUrl(`${HOST}:444/bars/${BAR}/photo`, BAR, STORE_ID)).toBe(
      false
    )
    expect(isOwnPhotoUrl(`${HOST}/bars/${BAR}/photo`, BAR, undefined)).toBe(
      false
    )
  })
})
