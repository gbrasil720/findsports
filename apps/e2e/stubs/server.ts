import { SAO_PAULO, STUB_PORT, STUB_URL } from '../env'

/**
 * Dublês HTTP que o servidor (LocationIQ, Stripe) e o navegador (tiles do mapa)
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
 * API do Stripe em `/v1/*` (o app aponta o SDK para cá por
 * `STRIPE_API_BASE_URL`), com respostas fixas e válidas para o SDK:
 * - `GET /v1/customers/search`: nunca acha ninguém, então o plugin cria o
 *   cliente em `POST /v1/customers` (`cus_e2e_` + hash do e-mail);
 * - `GET` e `POST /v1/customers/{id}`: cliente sem endereço — o checkout
 *   manda o do cadastro do bar, e os nomes (WEB-328);
 * - `GET /v1/prices?lookup_keys[]=`: um preço mensal com a lookup key pedida;
 * - `GET /v1/subscriptions?customer=`: as assinaturas semeadas daquele
 *   cliente — vazia para quem ainda não passou pelo checkout;
 * - `GET /v1/subscriptions/{id}`: o que o teste semeou em
 *   `POST /stripe/subscriptions`, ou 404 — é o que o webhook lê. Com
 *   `expand[]=customer`, o cliente vem como objeto, com o `balance` semeado
 *   em `POST /stripe/balances` (`{ customer, balance, nextAmountDue }`, em
 *   centavos; crédito é saldo negativo) ou zero (WEB-350);
 * - `POST /v1/invoices/create_preview`: a prévia da próxima fatura da
 *   assinatura semeada, com `amount_due` = `nextAmountDue`; 404 sem ela;
 * - `GET /v1/coupons/{id}`: cupom válido, menos o id `esgotado`;
 * - `POST /v1/checkout/sessions`: `url` em `/stripe/checkout/{id}`, uma página
 *   do stub — o teste espera o redirect para lá;
 * - `POST /v1/billing_portal/sessions`: `url` em `/stripe/portal/{customer}`.
 *
 * `GET /stripe/calls` devolve as chamadas recebidas (`path` sem o `/v1`, com
 * `query` e `body` — o corpo é formulário, com as chaves como o SDK manda:
 * `line_items[0][price]`). Filtre pelo cliente ou e-mail do seu teste.
 */

const calls: {
  street: string
  city: string
  state: string | null
  at: string
}[] = []

type StripeCall = {
  method: string
  path: string
  query: Record<string, string>
  body: Record<string, string>
  at: string
}
const stripeCalls: StripeCall[] = []
/** Assinaturas semeadas pelos testes, por id. É o "estado atual no Stripe". */
const stripeSubscriptions = new Map<string, unknown>()
/** Saldo e valor da próxima fatura semeados, por cliente, em centavos. */
const stripeBalances = new Map<
  string,
  { balance: number; nextAmountDue: number }
>()

function customerIdFor(email: string) {
  return `cus_e2e_${Bun.hash(email).toString(36)}`
}

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

    if (url.pathname.startsWith('/v1/')) return stripe(request, url)
    if (url.pathname === '/stripe/calls') return Response.json(stripeCalls)
    if (url.pathname === '/stripe/subscriptions' && request.method === 'POST') {
      const subscription = (await request.json()) as { id: string }
      stripeSubscriptions.set(subscription.id, subscription)
      return Response.json({ ok: true })
    }
    if (url.pathname === '/stripe/balances' && request.method === 'POST') {
      const { customer, ...seeded } = (await request.json()) as {
        customer: string
        balance: number
        nextAmountDue: number
      }
      stripeBalances.set(customer, seeded)
      return Response.json({ ok: true })
    }
    if (
      url.pathname.startsWith('/stripe/checkout/') ||
      url.pathname.startsWith('/stripe/portal/')
    ) {
      return new Response('<!doctype html><title>Stripe (stub)</title>', {
        headers: { 'content-type': 'text/html' }
      })
    }

    if (url.pathname === '/tiles.json') {
      return Response.json(
        {
          tilejson: '3.0.0',
          tiles: [`${STUB_URL}/tiles/{z}/{x}/{y}.mvt`],
          minzoom: 0,
          maxzoom: 15,
          bounds: [-74.1, -33.9, -34.7, 5.4]
        },
        { headers: { ...cors, 'content-type': 'application/json' } }
      )
    }

    if (/^\/tiles\/\d+\/\d+\/\d+\.mvt$/.test(url.pathname)) {
      return new Response(null, { status: 204, headers: cors })
    }

    return new Response('not found', { status: 404 })
  }
})

function stripeError(status: number, message: string) {
  return Response.json(
    { error: { type: 'invalid_request_error', message } },
    { status }
  )
}

async function stripe(request: Request, url: URL) {
  const path = url.pathname.slice('/v1'.length)
  const query = Object.fromEntries(url.searchParams)
  const body = Object.fromEntries(new URLSearchParams(await request.text()))
  stripeCalls.push({
    method: request.method,
    path,
    query,
    body,
    at: new Date().toISOString()
  })
  const list = (data: unknown[]) =>
    Response.json({ object: 'list', data, has_more: false, url: path })

  if (request.method === 'GET' && path === '/customers/search') {
    return Response.json({
      object: 'search_result',
      data: [],
      has_more: false,
      url: path
    })
  }

  if (request.method === 'POST' && path === '/customers') {
    const email = body.email ?? ''
    return Response.json({
      id: customerIdFor(email),
      object: 'customer',
      email,
      name: body.name ?? null,
      metadata: { userId: body['metadata[userId]'] ?? '' }
    })
  }

  // Cliente lido e atualizado com os dados do cadastro: sempre "sem
  // endereço", para o app mandar o do bar.
  const customer = /^\/customers\/(cus_[^/]+)$/.exec(path)
  if (customer) {
    return Response.json({ id: customer[1], object: 'customer', address: null })
  }

  if (request.method === 'GET' && path === '/subscriptions') {
    return list(
      [...stripeSubscriptions.values()].filter(
        (item) => (item as { customer?: string }).customer === query.customer
      )
    )
  }

  const subscription = /^\/subscriptions\/([^/]+)$/.exec(path)
  if (request.method === 'GET' && subscription) {
    const found = stripeSubscriptions.get(subscription[1] ?? '') as
      | { customer: string }
      | undefined
    if (!found) {
      return stripeError(404, `No such subscription: ${subscription[1]}`)
    }
    return Response.json(
      query['expand[0]'] === 'customer'
        ? {
            ...found,
            customer: {
              id: found.customer,
              object: 'customer',
              balance: stripeBalances.get(found.customer)?.balance ?? 0
            }
          }
        : found
    )
  }

  if (request.method === 'POST' && path === '/invoices/create_preview') {
    const found = stripeSubscriptions.get(body.subscription ?? '') as
      | { customer: string }
      | undefined
    if (!found) {
      return stripeError(404, `No such subscription: ${body.subscription}`)
    }
    return Response.json({
      id: 'upcoming_in_e2e',
      object: 'invoice',
      currency: 'brl',
      customer: found.customer,
      amount_due: stripeBalances.get(found.customer)?.nextAmountDue ?? 0
    })
  }

  if (request.method === 'GET' && path === '/prices') {
    const lookupKey =
      Object.entries(query).find(([key]) =>
        key.startsWith('lookup_keys')
      )?.[1] ?? ''
    return list([
      {
        id: `price_e2e_${lookupKey}`,
        object: 'price',
        active: true,
        currency: 'brl',
        lookup_key: lookupKey,
        recurring: { interval: 'month', usage_type: 'licensed' }
      }
    ])
  }

  const coupon = /^\/coupons\/([^/]+)$/.exec(path)
  if (request.method === 'GET' && coupon) {
    return Response.json({
      id: coupon[1],
      object: 'coupon',
      valid: coupon[1] !== 'esgotado'
    })
  }

  if (request.method === 'POST' && path === '/checkout/sessions') {
    const id = `cs_e2e_${crypto.randomUUID()}`
    return Response.json({
      id,
      object: 'checkout.session',
      url: `${STUB_URL}/stripe/checkout/${id}`
    })
  }

  if (request.method === 'POST' && path === '/billing_portal/sessions') {
    return Response.json({
      id: `bps_e2e_${crypto.randomUUID()}`,
      object: 'billing_portal.session',
      url: `${STUB_URL}/stripe/portal/${body.customer}`
    })
  }

  return stripeError(
    404,
    `Unrecognized request URL (${request.method}: ${path})`
  )
}

console.log(`[e2e stub] ouvindo em 127.0.0.1:${STUB_PORT}`)
