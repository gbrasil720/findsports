import { describe, expect, it } from 'bun:test'

import { isOwnPhotoUrl } from './blob-photo'

const BAR = 'bar-123'
const OUTRO = 'bar-999'
const MEDIA = 'https://media.onside.sh'
const OLD = 'https://loja-123.public.blob.vercel-storage.com'
const HOSTS = { MEDIA_PUBLIC_ORIGIN: MEDIA }

describe('URL da foto (ESC-15, WEB-202)', () => {
  it('aceita a foto do bar no domínio público do R2, com ou sem ?v=', () => {
    expect(isOwnPhotoUrl(`${MEDIA}/bars/${BAR}/photo`, BAR, HOSTS)).toBe(true)
    expect(
      isOwnPhotoUrl(`${MEDIA}/bars/${BAR}/photo?v=1759500000000`, BAR, HOSTS)
    ).toBe(true)
  })

  it('recusa a foto no store antigo do Vercel Blob, migrado no WEB-202', () => {
    expect(isOwnPhotoUrl(`${OLD}/bars/${BAR}/photo`, BAR, HOSTS)).toBe(false)
  })

  it('recusa sufixo acrescentado ao caminho exato', () => {
    expect(isOwnPhotoUrl(`${MEDIA}/bars/${BAR}/photo-A1b2C3`, BAR, HOSTS)).toBe(
      false
    )
  })

  it('recusa a foto de outro bar, inclusive por ../', () => {
    expect(isOwnPhotoUrl(`${MEDIA}/bars/${OUTRO}/photo`, BAR, HOSTS)).toBe(
      false
    )
    expect(
      isOwnPhotoUrl(`${MEDIA}/bars/${BAR}/../${OUTRO}/photo`, BAR, HOSTS)
    ).toBe(false)
  })

  it('recusa host de terceiro, mesmo com o caminho idêntico', () => {
    for (const url of [
      `https://outra.public.blob.vercel-storage.com/bars/${BAR}/photo`,
      `https://x.public.blob.vercel-storage.com.exemplo.com/bars/${BAR}/photo`,
      `https://media.onside.sh.exemplo.com/bars/${BAR}/photo`,
      `https://evil.example/bars/${BAR}/photo`,
      // O endpoint S3 do bucket não é o domínio público: não serve leitura.
      `https://conta.r2.cloudflarestorage.com/onside-media/bars/${BAR}/photo`
    ]) {
      expect(isOwnPhotoUrl(url, BAR, HOSTS)).toBe(false)
    }
  })

  it('recusa http sem TLS e porta alternativa', () => {
    expect(
      isOwnPhotoUrl(
        `${MEDIA.replace('https', 'http')}/bars/${BAR}/photo`,
        BAR,
        HOSTS
      )
    ).toBe(false)
    expect(isOwnPhotoUrl(`${MEDIA}:444/bars/${BAR}/photo`, BAR, HOSTS)).toBe(
      false
    )
  })

  it('recusa string que não é URL, javascript: e data:', () => {
    for (const url of [
      'não é uma url',
      '',
      'javascript:alert(1)',
      'data:image/png;base64,AAA'
    ]) {
      expect(isOwnPhotoUrl(url, BAR, HOSTS)).toBe(false)
    }
  })

  it('recusa tudo quando o host não está configurado', () => {
    expect(isOwnPhotoUrl(`${MEDIA}/bars/${BAR}/photo`, BAR, {})).toBe(false)
  })
})
