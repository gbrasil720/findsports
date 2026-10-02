import { SAO_PAULO, STUB_PORT } from '../env'

/**
 * Dublês HTTP que o servidor (LocationIQ) e o navegador (tiles do mapa)
 * chamam fora do alcance do `page.route`. Sobe pelo `webServer` do Playwright.
 *
 * LocationIQ, decidido pelo endereço pedido — sem estado, então testes em
 * paralelo não se atrapalham:
 * - `street` com "falha-geocoding": 503, o app esgota as tentativas e responde
 *   SERVICE_UNAVAILABLE;
 * - `street` com "inexistente": 404, "endereço não encontrado";
 * - qualquer outro: um resultado no centro de São Paulo, com a rua e a cidade
 *   pedidas (passa na conferência de rua do `geocode-address.ts`).
 *
 * `GET /locationiq/calls` devolve as consultas recebidas, para o teste provar
 * que o geocoding foi (ou não) chamado. Filtre pela rua do seu teste.
 */

const calls: { street: string; city: string; at: string }[] = []

const EMPTY_PMTILES = emptyPmtiles()

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*'
}

Bun.serve({
  port: STUB_PORT,
  hostname: '127.0.0.1',
  fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (url.pathname === '/v1/search') {
      const street = url.searchParams.get('street') ?? ''
      const city = url.searchParams.get('city') ?? ''
      calls.push({ street, city, at: new Date().toISOString() })
      if (street.includes('falha-geocoding')) {
        return new Response('stub down', { status: 503 })
      }
      if (street.includes('inexistente')) {
        return Response.json({ error: 'Unable to geocode' }, { status: 404 })
      }
      return Response.json([
        {
          lat: String(SAO_PAULO.latitude),
          lon: String(SAO_PAULO.longitude),
          display_name: `${street}, ${city}`,
          address: { road: street, city }
        }
      ])
    }

    if (url.pathname === '/locationiq/calls') return Response.json(calls)

    if (url.pathname === '/tiles.pmtiles') {
      return new Response(EMPTY_PMTILES, {
        headers: { ...cors, 'content-type': 'application/octet-stream' }
      })
    }

    return new Response('not found', { status: 404 })
  }
})

/**
 * PMTiles v3 válido e sem nenhum tile: o MapLibre lê o cabeçalho, monta o
 * mapa e pinta fundo vazio, sem rede externa. Os marcadores são DOM e
 * aparecem normalmente. Spec: github.com/protomaps/PMTiles/blob/main/spec/v3.
 */
function emptyPmtiles(): Uint8Array {
  const rootDirectory = new Uint8Array([0]) // varint: zero entradas
  const metadata = new TextEncoder().encode('{}')
  const header = new DataView(new ArrayBuffer(127))
  new Uint8Array(header.buffer).set(new TextEncoder().encode('PMTiles'), 0)
  header.setUint8(7, 3)
  const rootOffset = 127
  const metadataOffset = rootOffset + rootDirectory.length
  const end = metadataOffset + metadata.length
  const u64 = (at: number, value: number) =>
    header.setBigUint64(at, BigInt(value), true)
  u64(8, rootOffset)
  u64(16, rootDirectory.length)
  u64(24, metadataOffset)
  u64(32, metadata.length)
  u64(40, end) // diretórios-folha: nenhum
  u64(56, end) // dados dos tiles: nenhum
  header.setUint8(96, 1) // clustered
  header.setUint8(97, 1) // compressão interna: nenhuma
  header.setUint8(98, 1) // compressão dos tiles: nenhuma
  header.setUint8(99, 1) // MVT
  header.setUint8(101, 15) // zoom máximo
  // bbox do Brasil, em graus * 1e7
  header.setInt32(102, -74.1e7, true)
  header.setInt32(106, -33.9e7, true)
  header.setInt32(110, -34.7e7, true)
  header.setInt32(114, 5.4e7, true)

  const file = new Uint8Array(end)
  file.set(new Uint8Array(header.buffer), 0)
  file.set(rootDirectory, rootOffset)
  file.set(metadata, metadataOffset)
  return file
}

console.log(`[e2e stub] ouvindo em 127.0.0.1:${STUB_PORT}`)
