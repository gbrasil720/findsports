import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { PHOTO_MAX_BYTES, photoPathname } from './blob-photo'
import { deleteAvatar, MediaUploadError, signMediaUpload } from './media-upload'

const CONFIG = {
  R2_MEDIA_ACCESS_KEY_ID: 'chave-falsa',
  R2_MEDIA_SECRET_ACCESS_KEY: 'segredo-falso',
  CF_ACCOUNT_ID: 'conta123',
  MEDIA_PUBLIC_ORIGIN: 'https://media.onside.sh'
}
const KEY = photoPathname('bar-123')

async function recusa(body: unknown, config = CONFIG) {
  try {
    await signMediaUpload(KEY, body, config)
  } catch (err) {
    if (err instanceof MediaUploadError) return err.status
    throw err
  }
  throw new Error('assinou o que devia recusar')
}

describe('assinatura do upload para o R2 (WEB-202)', () => {
  it('assina PUT na chave escolhida, com content-type e tamanho', async () => {
    const { uploadUrl, url } = await signMediaUpload(
      KEY,
      { contentType: 'image/png', size: 1234 },
      CONFIG
    )

    const signed = new URL(uploadUrl)
    expect(signed.origin).toBe('https://conta123.r2.cloudflarestorage.com')
    expect(signed.pathname).toBe(`/onside-media/${KEY}`)
    expect(signed.searchParams.get('X-Amz-Expires')).toBe('300')
    expect(signed.searchParams.get('X-Amz-SignedHeaders')).toBe(
      'content-length;content-type;host'
    )
    expect(signed.searchParams.get('X-Amz-Credential')).toStartWith(
      'chave-falsa/'
    )
    expect(uploadUrl).not.toContain('segredo-falso')
    expect(url).toMatch(
      /^https:\/\/media\.onside\.sh\/bars\/bar-123\/photo\?v=\d+$/
    )
  })

  it('o tamanho e o formato fazem parte da assinatura', async () => {
    const assinatura = async (contentType: string, size: number) =>
      new URL(
        (await signMediaUpload(KEY, { contentType, size }, CONFIG)).uploadUrl
      ).searchParams.get('X-Amz-Signature')

    const base = await assinatura('image/png', 1000)
    expect(await assinatura('image/png', 1001)).not.toBe(base)
    expect(await assinatura('image/jpeg', 1000)).not.toBe(base)
  })

  it('recusa formato fora da lista e tamanho acima de 5 MB ou inválido', async () => {
    expect(await recusa({ contentType: 'text/html', size: 10 })).toBe(415)
    expect(await recusa({ contentType: 'image/gif', size: 10 })).toBe(415)
    expect(await recusa({ size: 10 })).toBe(415)
    expect(
      await recusa({ contentType: 'image/png', size: PHOTO_MAX_BYTES + 1 })
    ).toBe(413)
    for (const size of [0, -1, 1.5, '10', undefined]) {
      expect(await recusa({ contentType: 'image/png', size })).toBe(400)
    }
    expect(await recusa(null)).toBe(415)
  })

  it('aceita exatamente 5 MB', async () => {
    await signMediaUpload(
      KEY,
      { contentType: 'image/webp', size: PHOTO_MAX_BYTES },
      CONFIG
    )
  })

  it('sem as variáveis do R2, responde 503 em vez de derrubar o app', async () => {
    const body = { contentType: 'image/png', size: 10 }
    for (const falta of Object.keys(CONFIG)) {
      expect(await recusa(body, { ...CONFIG, [falta]: undefined })).toBe(503)
    }
  })
})

describe('remoção do avatar no R2 (WEB-320)', () => {
  const fetchOriginal = globalThis.fetch
  let pedidos: Request[] = []
  let resposta = () => new Response(null, { status: 204 })

  beforeEach(() => {
    pedidos = []
    resposta = () => new Response(null, { status: 204 })
    globalThis.fetch = (async (input: Request) => {
      pedidos.push(input)
      return resposta()
    }) as unknown as typeof fetch
  })
  afterEach(() => {
    globalThis.fetch = fetchOriginal
  })

  async function status(...args: Parameters<typeof deleteAvatar>) {
    try {
      await deleteAvatar(...args)
    } catch (err) {
      if (err instanceof MediaUploadError) return err.status
      throw err
    }
    return 204
  }

  it('sem sessão responde 401 e não toca no bucket', async () => {
    expect(await status(null, CONFIG)).toBe(401)
    expect(pedidos).toHaveLength(0)
  })

  it('apaga só o avatar de quem está na sessão, com DELETE assinado', async () => {
    expect(await status({ user: { id: 'user-123' } }, CONFIG)).toBe(204)

    expect(pedidos).toHaveLength(1)
    const [pedido] = pedidos as [Request]
    expect(pedido.method).toBe('DELETE')
    expect(pedido.url).toBe(
      'https://conta123.r2.cloudflarestorage.com/onside-media/users/user-123/avatar'
    )
    expect(pedido.headers.get('authorization')).toContain(
      'Credential=chave-falsa/'
    )
  })

  it('falha do R2 vira 502; sem as variáveis, 503 sem pedido', async () => {
    resposta = () => new Response(null, { status: 403 })
    expect(await status({ user: { id: 'user-123' } }, CONFIG)).toBe(502)

    pedidos = []
    expect(
      await status(
        { user: { id: 'user-123' } },
        { ...CONFIG, CF_ACCOUNT_ID: undefined }
      )
    ).toBe(503)
    expect(pedidos).toHaveLength(0)
  })
})
