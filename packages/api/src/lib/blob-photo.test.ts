import { describe, expect, it } from 'bun:test'

import { isOwnPhotoPathname, isOwnPhotoUrl, photoPathname } from './blob-photo'

const BAR = 'bar-123'
const OUTRO = 'bar-999'
const HOST = 'https://loja123.public.blob.vercel-storage.com'

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
    expect(isOwnPhotoUrl(`${HOST}/bars/${BAR}/photo`, BAR)).toBe(true)
  })

  it('aceita sufixo acrescentado pelo armazenamento', () => {
    expect(isOwnPhotoUrl(`${HOST}/bars/${BAR}/photo-A1b2C3`, BAR)).toBe(true)
  })

  it('recusa URL de outro bar', () => {
    expect(isOwnPhotoUrl(`${HOST}/bars/${OUTRO}/photo`, BAR)).toBe(false)
  })

  it('recusa host que não é o do armazenamento', () => {
    expect(isOwnPhotoUrl(`https://exemplo.com/bars/${BAR}/photo`, BAR)).toBe(
      false
    )
  })

  it('recusa host que apenas contém o sufixo no meio', () => {
    expect(
      isOwnPhotoUrl(
        `https://x.public.blob.vercel-storage.com.exemplo.com/bars/${BAR}/photo`,
        BAR
      )
    ).toBe(false)
  })

  it('recusa http sem TLS', () => {
    expect(
      isOwnPhotoUrl(
        `http://loja123.public.blob.vercel-storage.com/bars/${BAR}/photo`,
        BAR
      )
    ).toBe(false)
  })

  it('recusa string que não é URL', () => {
    expect(isOwnPhotoUrl('não é uma url', BAR)).toBe(false)
    expect(isOwnPhotoUrl('', BAR)).toBe(false)
  })

  it('recusa javascript: e data:', () => {
    expect(isOwnPhotoUrl('javascript:alert(1)', BAR)).toBe(false)
    expect(isOwnPhotoUrl('data:image/png;base64,AAA', BAR)).toBe(false)
  })
})
