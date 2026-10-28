import { describe, expect, it } from 'bun:test'
import {
  assertCanAddPhoto,
  barPhotoKey,
  byCategoryThenPosition,
  GALLERY_MAX_PHOTOS,
  galleryPhotoPathname,
  isOwnGalleryPhotoUrl,
  occupiedSlots,
  resolvePublicGallery
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
    expect(barPhotoKey(`${foto}?v=1`, BAR, HOSTS)).toBe(
      `bars/${BAR}/gallery/${FOTO}`
    )
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

describe('fotos do bar com revisão (WEB-462)', () => {
  const PRO = {
    plan: 'pro' as const,
    status: 'active' as const,
    currentPeriodEnd: new Date(Date.now() + 86_400_000)
  }
  const STARTER = { ...PRO, plan: 'starter' as const }

  it('a capa antiga também tem chave; foto de fora não tem', () => {
    expect(barPhotoKey(url(`bars/${BAR}/photo`), BAR, HOSTS)).toBe(
      `bars/${BAR}/photo`
    )
    expect(barPhotoKey(url('bars/bar-999/photo'), BAR, HOSTS)).toBeNull()
    expect(barPhotoKey('https://outro.host/x.jpg', BAR, HOSTS)).toBeNull()
  })

  it('recusada não ocupa lugar no teto de 12', () => {
    expect(GALLERY_MAX_PHOTOS).toBe(12)
    expect(
      occupiedSlots([
        { status: 'approved' },
        { status: 'pending' },
        { status: 'rejected' }
      ])
    ).toBe(2)
  })

  it('capa vale em todo plano; o resto da galeria pede Pro ou Elite', () => {
    expect(() => assertCanAddPhoto(STARTER, true)).not.toThrow()
    expect(() => assertCanAddPhoto(STARTER, false)).toThrow(
      'A galeria de fotos é dos planos Pro e Elite.'
    )
    expect(() => assertCanAddPhoto(PRO, false)).not.toThrow()
  })

  const fotos = [
    { id: 'c', category: 'comida', position: 0, status: 'approved' },
    { id: 't2', category: 'telao', position: 3, status: 'approved' },
    { id: 'p', category: 'telao', position: 1, status: 'pending' },
    { id: 'r', category: 'balcao', position: 2, status: 'rejected' },
    { id: 't1', category: 'telao', position: 4, status: 'approved' }
  ] as const

  it('o torcedor vê só as aprovadas, por categoria e na ordem do dono', () => {
    expect(resolvePublicGallery(fotos, PRO).map((f) => f.id)).toEqual([
      't2',
      't1',
      'c'
    ])
  })

  it('sem Pro ou Elite a galeria some (a capa fica em bar.photo_url)', () => {
    expect(resolvePublicGallery(fotos, STARTER)).toEqual([])
    expect(resolvePublicGallery(fotos, null)).toEqual([])
  })

  it('ordena por categoria do design e depois pela posição', () => {
    expect(byCategoryThenPosition(fotos).map((f) => f.id)).toEqual([
      'p',
      't2',
      't1',
      'r',
      'c'
    ])
  })
})
