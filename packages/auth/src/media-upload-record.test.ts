import { describe, expect, it } from 'bun:test'
import { bytesMatchContentType, sniffImage } from './media-upload-record'

const bytes = (...b: number[]) => new Uint8Array(b)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)
const WEBP = new Uint8Array([
  ...new TextEncoder().encode('RIFF'),
  0x24,
  0x00,
  0x00,
  0x00,
  ...new TextEncoder().encode('WEBPVP8 ')
])

describe('formato pelos primeiros bytes', () => {
  it('reconhece JPG, PNG e WebP', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg')
    expect(sniffImage(PNG)).toBe('image/png')
    expect(sniffImage(WEBP)).toBe('image/webp')
  })

  it('recusa o resto', () => {
    const text = (s: string) => new TextEncoder().encode(s)
    expect(sniffImage(text('GIF89a'))).toBeNull()
    expect(
      sniffImage(text('<svg xmlns="http://www.w3.org/2000/svg">'))
    ).toBeNull()
    expect(sniffImage(text('<html><script>alert(1)'))).toBeNull()
    expect(sniffImage(text('%PDF-1.7'))).toBeNull()
    // RIFF que não é WebP (WAV, AVI).
    expect(sniffImage(text('RIFF\x24\x00\x00\x00WAVEfmt '))).toBeNull()
    expect(sniffImage(bytes())).toBeNull()
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull()
  })

  it('os bytes têm de bater com o content-type guardado', () => {
    expect(bytesMatchContentType(PNG, 'image/png')).toBe(true)
    expect(bytesMatchContentType(JPEG, 'IMAGE/JPEG; charset=binary')).toBe(true)
    expect(bytesMatchContentType(JPEG, 'image/png')).toBe(false)
    expect(bytesMatchContentType(WEBP, 'image/jpeg')).toBe(false)
    expect(bytesMatchContentType(PNG, null)).toBe(false)
    expect(bytesMatchContentType(PNG, 'text/html')).toBe(false)
  })
})
