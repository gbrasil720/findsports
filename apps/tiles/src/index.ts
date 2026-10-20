/**
 * Worker ZXY + TileJSON a partir de arquivos `.pmtiles` no R2 (WEB-218).
 *
 * Baseado no template oficial:
 * https://docs.protomaps.com/deploy/cloudflare
 */
import {
  Compression,
  EtagMismatch,
  PMTiles,
  type RangeResponse,
  ResolvedValueCache,
  type Source,
  TileType,
  tileTypeExt
} from 'pmtiles'
import { chaveDeCache, podeGravarNoCache } from './cache-policy'
import { lerComRetry } from './r2-read'
import { pmtiles_path, tile_path } from './tile-path'

interface Env {
  ALLOWED_ORIGINS?: string
  BUCKET: R2Bucket
  CACHE_CONTROL?: string
  PMTILES_PATH?: string
  PUBLIC_HOSTNAME?: string
}

class KeyNotFoundError extends Error {}

async function nativeDecompress(
  buf: ArrayBuffer,
  compression: Compression
): Promise<ArrayBuffer> {
  if (compression === Compression.None || compression === Compression.Unknown) {
    return buf
  }
  if (compression === Compression.Gzip) {
    const stream = new Response(buf).body
    const result = stream?.pipeThrough(new DecompressionStream('gzip'))
    return new Response(result).arrayBuffer()
  }
  throw new Error('Compression method not supported')
}

const HEADER_CACHE = new ResolvedValueCache(25, undefined, nativeDecompress)

class R2Source implements Source {
  env: Env
  archiveName: string
  /** Para o log do miss: quantas leituras e quanto tempo no R2. */
  leituras = 0
  msNoR2 = 0

  constructor(env: Env, archiveName: string) {
    this.env = env
    this.archiveName = archiveName
  }

  getKey() {
    return this.archiveName
  }

  async getBytes(
    offset: number,
    length: number,
    _signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    const inicio = Date.now()
    this.leituras++
    const lido = await lerComRetry(async () => {
      const resp = await this.env.BUCKET.get(
        pmtiles_path(this.archiveName, this.env.PMTILES_PATH),
        {
          range: { offset, length },
          onlyIf: { etagMatches: etag }
        }
      )
      const o = resp as R2ObjectBody | null
      // O corpo também é lido dentro do prazo: é onde uma leitura lenta trava.
      return o?.body ? { o, data: await o.arrayBuffer() } : { o, data: null }
    }).finally(() => {
      this.msNoR2 += Date.now() - inicio
    })

    const { o, data } = lido
    if (!o) {
      throw new KeyNotFoundError('Archive not found')
    }
    if (!data) {
      throw new EtagMismatch()
    }

    return {
      data,
      etag: o.etag,
      cacheControl: o.httpMetadata?.cacheControl,
      expires: o.httpMetadata?.cacheExpiry?.toISOString()
    }
  }
}

function origemPermitida(env: Env, request: Request): string {
  if (typeof env.ALLOWED_ORIGINS === 'undefined') {
    return ''
  }
  let allowedOrigin = ''
  for (const o of env.ALLOWED_ORIGINS.split(',')) {
    const candidato = o.trim()
    if (candidato === request.headers.get('Origin') || candidato === '*') {
      allowedOrigin = candidato
    }
  }
  return allowedOrigin
}

/** Segundos que o cliente espera antes de pedir de novo um tile que falhou. */
const ESPERA_APOS_FALHA_S = '2'

function indisponivel(allowedOrigin: string): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Retry-After': ESPERA_APOS_FALHA_S,
    Vary: 'Origin'
  })
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin)
  }
  return new Response('Tile temporariamente indisponível', {
    headers,
    status: 503
  })
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method.toUpperCase() === 'POST') {
      return new Response(undefined, { status: 405 })
    }

    const url = new URL(request.url)
    const { ok, name, tile, ext } = tile_path(url.pathname)

    const cache = caches.default
    const cacheKey = chaveDeCache(request.url)

    if (!ok) {
      return new Response('Invalid URL', { status: 404 })
    }

    const allowedOrigin = origemPermitida(env, request)

    const cached = await cache.match(cacheKey)
    if (cached) {
      const respHeaders = new Headers(cached.headers)
      if (allowedOrigin) {
        respHeaders.set('Access-Control-Allow-Origin', allowedOrigin)
      }
      respHeaders.set('Vary', 'Origin')

      return new Response(cached.body, {
        headers: respHeaders,
        status: cached.status
      })
    }

    const cacheableResponse = (
      body: ArrayBuffer | string | undefined,
      cacheableHeaders: Headers,
      status: number
    ) => {
      cacheableHeaders.set(
        'Cache-Control',
        env.CACHE_CONTROL || 'public, max-age=86400'
      )

      const cacheable = new Response(body, {
        headers: cacheableHeaders,
        status
      })

      if (podeGravarNoCache(status)) {
        ctx.waitUntil(cache.put(cacheKey, cacheable))
      }

      const respHeaders = new Headers(cacheableHeaders)
      if (allowedOrigin) {
        respHeaders.set('Access-Control-Allow-Origin', allowedOrigin)
      }
      respHeaders.set('Vary', 'Origin')
      return new Response(body, { headers: respHeaders, status })
    }

    const cacheableHeaders = new Headers()
    const source = new R2Source(env, name)
    const p = new PMTiles(source, HEADER_CACHE, nativeDecompress)
    const gerar = async (): Promise<Response> => {
      try {
        const pHeader = await p.getHeader()

        if (!tile) {
          cacheableHeaders.set('Content-Type', 'application/json')
          const t = await p.getTileJson(
            `https://${env.PUBLIC_HOSTNAME || url.hostname}/${name}`
          )
          return cacheableResponse(JSON.stringify(t), cacheableHeaders, 200)
        }

        if (tile[0] < pHeader.minZoom || tile[0] > pHeader.maxZoom) {
          return cacheableResponse(undefined, cacheableHeaders, 404)
        }

        const extToType: Record<string, TileType> = {
          mvt: TileType.Mvt,
          pbf: TileType.Mvt,
          png: TileType.Png,
          jpg: TileType.Jpeg,
          webp: TileType.Webp,
          avif: TileType.Avif
        }

        const expectedType = extToType[ext]
        if (
          pHeader.tileType !== expectedType &&
          tileTypeExt(pHeader.tileType) !== ''
        ) {
          return cacheableResponse(
            `Bad request: requested .${ext} but archive has type ${tileTypeExt(
              pHeader.tileType
            )}`,
            cacheableHeaders,
            400
          )
        }

        const tiledata = await p.getZxy(tile[0], tile[1], tile[2])

        switch (pHeader.tileType) {
          case TileType.Mvt:
            cacheableHeaders.set('Content-Type', 'application/x-protobuf')
            break
          case TileType.Png:
            cacheableHeaders.set('Content-Type', 'image/png')
            break
          case TileType.Jpeg:
            cacheableHeaders.set('Content-Type', 'image/jpeg')
            break
          case TileType.Webp:
            cacheableHeaders.set('Content-Type', 'image/webp')
            break
        }

        if (tiledata) {
          return cacheableResponse(tiledata.data, cacheableHeaders, 200)
        }
        return cacheableResponse(undefined, cacheableHeaders, 204)
      } catch (e) {
        if (e instanceof KeyNotFoundError) {
          return cacheableResponse('Archive not found', cacheableHeaders, 404)
        }
        throw e
      }
    }

    // Daqui para baixo é sempre cache miss: o log diz quanto do tempo foi R2.
    const inicio = Date.now()
    let resposta: Response
    let erro: string | undefined
    try {
      resposta = await gerar()
    } catch (e) {
      // R2 fora ou lento depois das novas tentativas. Sem isto a exceção vira
      // 500 opaco (erro 1101) e nada diz ao cliente que pode tentar de novo.
      erro = e instanceof Error ? e.message : String(e)
      resposta = indisponivel(allowedOrigin)
    }

    const registro = {
      evento: 'tiles.miss',
      caminho: url.pathname,
      status: resposta.status,
      ms: Date.now() - inicio,
      leiturasR2: source.leituras,
      msNoR2: source.msNoR2,
      ...(erro ? { erro } : {})
    }
    if (erro) {
      console.error(JSON.stringify(registro))
    } else {
      console.log(JSON.stringify(registro))
    }
    return resposta
  }
}
