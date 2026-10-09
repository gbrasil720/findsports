import { SAO_PAULO, STUB_PORT, STUB_URL } from '../env'

/**
 * Dublês HTTP que o servidor (LocationIQ, Dodo) e o navegador (tiles do mapa)
 * chamam fora do alcance do `page.route`. Sobe pelo `webServer` do Playwright.
 *
 * LocationIQ, decidido pelo endereço pedido — sem estado, então testes em
 * paralelo não se atrapalham:
 * - `street` com "falha-geocoding": 503, o app esgota as tentativas e responde
 *   SERVICE_UNAVAILABLE;
 * - `street` com "inexistente": 404, "endereço não encontrado";
 * - qualquer outro: um resultado no centro de São Paulo, com a rua, a cidade e
 *   o estado pedidos (passa nas conferências do `geocode-address.ts`).
 *
 * `GET /locationiq/calls` devolve as consultas recebidas, para o teste provar
 * que o geocoding foi (ou não) chamado. Filtre pela rua do seu teste. `state`
 * é o estado por extenso, ou `null` quando o bar não tem UF (WEB-270).
 *
 * API da Dodo em `/dodo/*` (o `dodo-api.mjs` desvia o servidor para cá), com
 * respostas fixas e válidas para o SDK:
 * - `GET /customers?email=`: sempre acha um customer (`cus_e2e_` + hash do
 *   e-mail), então o plugin nunca cria um;
 * - `POST /customers/{id}/customer-portal/session`: link `/dodo/portal/{id}`;
 * - `GET /payments`: um pagamento `succeeded` de R$ 99,00 do customer pedido;
 * - `POST /checkouts`: `checkout_url` em `/dodo/checkout/{session_id}`, uma
 *   página do stub — o teste espera o redirect para lá.
 *
 * `GET /dodo/calls` devolve as chamadas recebidas (`path` sem o `/dodo`, com
 * `query` e `body`). Filtre pelo e-mail ou customer do seu teste.
 */

const calls: {
  street: string
  city: string
  state: string | null
  at: string
}[] = []

type DodoCall = {
  method: string
  path: string
  query: Record<string, string>
  body: unknown
  at: string
}
const dodoCalls: DodoCall[] = []

function customerIdFor(email: string) {
  return `cus_e2e_${Bun.hash(email).toString(36)}`
}

const EMPTY_PMTILES = emptyPmtiles()

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-expose-headers': '*'
}

Bun.serve({
  port: STUB_PORT,
  hostname: '127.0.0.1',
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    if (url.pathname === '/v1/search') {
      const street = url.searchParams.get('street') ?? ''
      const city = url.searchParams.get('city') ?? ''
      const state = url.searchParams.get('state')
      calls.push({ street, city, state, at: new Date().toISOString() })
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
          address: { road: street, city, ...(state && { state }) }
        }
      ])
    }

    if (url.pathname === '/locationiq/calls') return Response.json(calls)

    if (url.pathname === '/dodo/calls') return Response.json(dodoCalls)
    if (url.pathname.startsWith('/dodo/')) return dodo(request, url)

    if (url.pathname === '/tiles.pmtiles') {
      return new Response(EMPTY_PMTILES, {
        headers: { ...cors, 'content-type': 'application/octet-stream' }
      })
    }

    return new Response('not found', { status: 404 })
  }
})

async function dodo(request: Request, url: URL) {
  const path = url.pathname.slice('/dodo'.length)
  const query = Object.fromEntries(url.searchParams)
  const text = await request.text()
  const body = text ? JSON.parse(text) : null
  dodoCalls.push({
    method: request.method,
    path,
    query,
    body,
    at: new Date().toISOString()
  })
  const now = new Date().toISOString()

  if (request.method === 'GET' && path === '/customers') {
    const email = query.email ?? ''
    return Response.json({
      items: [
        {
          business_id: 'bus_e2e',
          customer_id: customerIdFor(email),
          email,
          name: email,
          created_at: now
        }
      ]
    })
  }

  const portal = /^\/customers\/([^/]+)\/customer-portal\/session$/.exec(path)
  if (request.method === 'POST' && portal) {
    return Response.json({ link: `${STUB_URL}/dodo/portal/${portal[1]}` })
  }

  if (request.method === 'GET' && path === '/payments') {
    const customerId = query.customer_id ?? 'cus_e2e'
    return Response.json({
      items: [
        {
          payment_id: `pay_e2e_${customerId}`,
          brand_id: 'brd_e2e',
          created_at: now,
          currency: 'BRL',
          customer: { customer_id: customerId, email: '', name: '' },
          digital_products_delivered: false,
          has_license_key: false,
          metadata: {},
          payment_provider: 'dodo',
          status: 'succeeded',
          total_amount: 9900
        }
      ]
    })
  }

  if (request.method === 'POST' && path === '/checkouts') {
    const sessionId = `cks_e2e_${crypto.randomUUID()}`
    return Response.json({
      session_id: sessionId,
      checkout_url: `${STUB_URL}/dodo/checkout/${sessionId}`
    })
  }

  if (path.startsWith('/checkout/') || path.startsWith('/portal/')) {
    return new Response('<!doctype html><title>Dodo (stub)</title>', {
      headers: { 'content-type': 'text/html' }
    })
  }

  return Response.json({ code: 'NOT_FOUND', message: path }, { status: 404 })
}

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
