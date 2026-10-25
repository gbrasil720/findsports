import { describe, expect, it } from 'bun:test'
import {
  galleryPhotoKey,
  galleryPhotoPathname,
  isOwnGalleryPhotoUrl
} from './bar-gallery'

const BAR = 'bar-123'
const FOTO = '0b8e1c52-3f4a-4c1e-9d2b-7a6f5e4d3c2b'
const MEDIA = 'https://media.onside.sh'
const HOSTS = { MEDIA_PUBLIC_ORIGIN: MEDIA }
const url = (path: string) => `${MEDIA}/${path}`

describe('URL da foto da galeria (WEB-439)', () => {
  it('aceita a foto da galeria deste bar no R2, com ou sem ?v=', () => {
    const foto = url(galleryPhotoPathname(BAR, FOTO))
    expect(isOwnGalleryPhotoUrl(foto, BAR, HOSTS)).toBe(true)
    expect(isOwnGalleryPhotoUrl(`${foto}?v=1`, BAR, HOSTS)).toBe(true)
    expect(galleryPhotoKey(`${foto}?v=1`)).toBe(`bars/${BAR}/gallery/${FOTO}`)
  })

  it('recusa foto de outro bar, a capa, id que não é uuid e outro host', () => {
    expect(
      isOwnGalleryPhotoUrl(url(`bars/bar-999/gallery/${FOTO}`), BAR, HOSTS)
    ).toBe(false)
    expect(isOwnGalleryPhotoUrl(url(`bars/${BAR}/photo`), BAR, HOSTS)).toBe(
      false
    )
    expect(
      isOwnGalleryPhotoUrl(url(`bars/${BAR}/gallery/qualquer`), BAR, HOSTS)
    ).toBe(false)
    expect(
      isOwnGalleryPhotoUrl(
        url(`bars/${BAR}/gallery/../../bar-999/gallery/${FOTO}`),
        BAR,
        HOSTS
      )
    ).toBe(false)
    expect(
      isOwnGalleryPhotoUrl(
        `https://outro.host/bars/${BAR}/gallery/${FOTO}`,
        BAR,
        HOSTS
      )
    ).toBe(false)
    expect(isOwnGalleryPhotoUrl('não é url', BAR, HOSTS)).toBe(false)
    expect(
      isOwnGalleryPhotoUrl(url(galleryPhotoPathname(BAR, FOTO)), BAR, {})
    ).toBe(false)
  })
})
