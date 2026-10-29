import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  spyOn
} from 'bun:test'

import worker from './index'

/**
 * Archive PMTiles v3 mínimo: um tile só (z0/0/0), sem compressão, MVT.
 * Header de 127 bytes, diretório raiz logo depois, dados do tile no fim.
 */
function archiveMinimo(tile: string): ArrayBuffer {
  const dados = new TextEncoder().encode(tile)
  // Diretório raiz: 1 entrada; tileId 0, runLength 1, length, offset + 1.
  const raiz = Uint8Array.from([1, 0, 1, dados.length, 1])
  const buf = new ArrayBuffer(127 + raiz.length + dados.length)
  const v = new DataView(buf)
  new Uint8Array(buf).set(new TextEncoder().encode('PMTiles'), 0)
  v.setUint8(7, 3)
  v.setBigUint64(8, 127n, true) // diretório raiz
  v.setBigUint64(16, BigInt(raiz.length), true)
  v.setBigUint64(56, BigInt(127 + raiz.length), true) // dados dos tiles
  v.setBigUint64(64, BigInt(dados.length), true)
  v.setUint8(97, 1) // compressão interna: nenhuma
  v.setUint8(98, 1) // compressão dos tiles: nenhuma
  v.setUint8(99, 1) // MVT
  v.setUint8(100, 0) // minZoom
  v.setUint8(101, 0) // maxZoom
  new Uint8Array(buf).set(raiz, 127)
  new Uint8Array(buf).set(dados, 127 + raiz.length)
  return buf
}

/** Binding R2 de mentira: as `falhas` primeiras leituras lançam erro. */
function bucket(arquivos: Record<string, ArrayBuffer>, falhas = 0) {
  const estado = { leituras: 0 }
  const get = async (
    key: string,
    opcoes: { range: { offset: number; length: number } }
  ) => {
    estado.leituras++
    if (estado.leituras <= falhas) {
      throw new Error('We encountered an internal error. Please try again.')
    }
    const arquivo = arquivos[key]
    if (!arquivo) {
      return null
    }
    const { offset, length } = opcoes.range
    const data = arquivo.slice(offset, offset + length)
    return {
      body: {},
      etag: 'etag-1',
      httpMetadata: {},
      arrayBuffer: async () => data
    }
  }
  return { estado, BUCKET: { get } }
}

function env(BUCKET: unknown) {
  return {
    ALLOWED_ORIGINS: 'https://www.onside.sh',
    BUCKET,
    CACHE_CONTROL: 'public, max-age=31536000, immutable',
    PMTILES_PATH: 'maps/{name}.pmtiles',
    PUBLIC_HOSTNAME: 'tiles.onside.sh'
  } as never
}

const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as never

function pedir(caminho: string) {
  return new Request(`https://tiles.onside.sh${caminho}`, {
    headers: { Origin: 'https://www.onside.sh' }
  })
}

beforeAll(() => {
  // Cache API sempre em miss: é o caminho que lê o R2.
  ;(globalThis as { caches?: unknown }).caches = {
    default: { match: async () => undefined, put: async () => {} }
  }
})

afterEach(() => {
  mock.restore()
})

describe('worker de tiles em cache miss', () => {
  it('serve o tile lido do R2 e registra o miss', async () => {
    const log = spyOn(console, 'log').mockImplementation(() => {})
    const { BUCKET } = bucket({
      'maps/ok.pmtiles': archiveMinimo('tile!')
    })
    const resp = await worker.fetch(pedir('/ok/0/0/0.mvt'), env(BUCKET), ctx)
    expect(resp.status).toBe(200)
    expect(await resp.text()).toBe('tile!')

    const registro = JSON.parse(String(log.mock.calls.at(-1)?.[0]))
    expect(registro).toMatchObject({
      evento: 'tiles.miss',
      caminho: '/ok/0/0/0.mvt',
      status: 200,
      leiturasR2: 2
    })
  })

  it('erro passageiro do R2 não chega ao navegador', async () => {
    spyOn(console, 'log').mockImplementation(() => {})
    const { BUCKET, estado } = bucket(
      { 'maps/passageiro.pmtiles': archiveMinimo('tile!') },
      1
    )
    const resp = await worker.fetch(
      pedir('/passageiro/0/0/0.mvt'),
      env(BUCKET),
      ctx
    )
    expect(resp.status).toBe(200)
    expect(await resp.text()).toBe('tile!')
    // header (falha + nova tentativa) e tile
    expect(estado.leituras).toBe(3)
  })

  it('http://localhost:* libera qualquer porta do localhost, e só ela', async () => {
    const { BUCKET } = bucket({ 'maps/fora.pmtiles': archiveMinimo('tile!') })
    const local = {
      ...(env(BUCKET) as object),
      ALLOWED_ORIGINS: 'http://localhost:*'
    } as never
    const cors = async (origem: string) =>
      (
        await worker.fetch(
          new Request('https://tiles.onside.sh/fora/0/0/0.mvt', {
            headers: { Origin: origem }
          }),
          local,
          ctx
        )
      ).headers.get('Access-Control-Allow-Origin')

    expect(await cors('http://localhost:4056')).toBe('http://localhost:4056')
    expect(await cors('http://localhost:3001')).toBe('http://localhost:3001')
    expect(await cors('http://localhost.evil.com:4056')).toBeNull()
    expect(await cors('http://localhost:4056.evil.com')).toBeNull()
    expect(await cors('https://localhost:4056')).toBeNull()
  })

  it('R2 fora responde 503 com Retry-After, sem cache e com CORS', async () => {
    const erroLog = spyOn(console, 'error').mockImplementation(() => {})
    const { BUCKET } = bucket(
      { 'maps/fora.pmtiles': archiveMinimo('tile!') },
      Number.POSITIVE_INFINITY
    )
    const resp = await worker.fetch(pedir('/fora/0/0/0.mvt'), env(BUCKET), ctx)
    expect(resp.status).toBe(503)
    expect(resp.headers.get('Retry-After')).toBe('2')
    expect(resp.headers.get('Cache-Control')).toBe('no-store')
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://www.onside.sh'
    )

    const registro = JSON.parse(String(erroLog.mock.calls.at(-1)?.[0]))
    expect(registro).toMatchObject({
      evento: 'tiles.miss',
      caminho: '/fora/0/0/0.mvt',
      status: 503
    })
    expect(registro.erro).toContain('R2 falhou 3 vezes')
  })

  it('archive inexistente continua 404, sem novas tentativas', async () => {
    spyOn(console, 'log').mockImplementation(() => {})
    const { BUCKET, estado } = bucket({})
    const resp = await worker.fetch(pedir('/nada/0/0/0.mvt'), env(BUCKET), ctx)
    expect(resp.status).toBe(404)
    expect(estado.leituras).toBe(1)
  })
})
