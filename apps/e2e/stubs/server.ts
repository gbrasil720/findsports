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
 * - `GET`, `POST` e `DELETE /v1/customers/{id}/tax_ids[/{txi}]`: os
 *   documentos do cliente, guardados aqui (o CNPJ dos dados da nota, WEB-444).
 *   `99.999.999/0001-91` (dígito certo) é recusado com 400, como o Stripe
 *   recusa o documento que não aceita;
 * - `GET /v1/prices?lookup_keys[]=`: um preço para cada lookup key pedida,
 *   mensal; as `*_yearly` (WEB-442) são anuais e só existem depois de
 *   `POST /stripe/annual` com `{ available: true }` — como na conta de
 *   verdade, onde o dono ainda vai criá-las —, junto com o cupom
 *   `fundador_anual` (R$ 280 por fatura, para sempre);
 * - `GET /v1/subscriptions?customer=`: as assinaturas semeadas daquele
 *   cliente — vazia para quem ainda não passou pelo checkout;
 * - `GET /v1/subscriptions/{id}`: o que o teste semeou em
 *   `POST /stripe/subscriptions`, ou 404 — é o que o webhook lê. Com
 *   `expand[]=customer…`, o cliente vem como objeto, com o `balance` semeado
 *   em `POST /stripe/balances` (`{ customer, balance, nextAmountDue }`, em
 *   centavos; crédito é saldo negativo) ou zero (WEB-350). A forma de
 *   pagamento semeada (`default_payment_method`) só vem como objeto com
 *   `expand[]=default_payment_method`; sem ele, só o id, como no Stripe;
 * - `POST /v1/subscriptions/{id}`: só `cancellation_details` (o motivo do
 *   cancelamento, WEB-445), gravado na assinatura semeada, ou 404;
 * - `DELETE /v1/subscriptions/{id}`: encerra a assinatura semeada (passa a
 *   `canceled`, que é o que as leituras seguintes devolvem), ou 404 — é o que
 *   a exclusão da conta chama (WEB-336);
 * - `POST /v1/invoices/create_preview`: a prévia da próxima fatura da
 *   assinatura semeada, com `amount_due` = `nextAmountDue`; 404 sem ela;
 * - `GET /v1/invoices?subscription=` e `GET /v1/charges?customer=`: faturas e
 *   cobranças semeadas em `POST /stripe/invoices` (`{ subscription, customer,
 *   invoices, charges }`), ou lista vazia (WEB-443);
 * - `GET /v1/coupons/{id}`: cupom válido. `POST /stripe/coupon` com
 *   `{ state }` troca a resposta para todo cupom: `exhausted` (`valid: false`,
 *   teto de usos batido), `missing` (404, cupom que não existe nesta conta)
 *   ou `slow` (o Stripe sem responder: segura a resposta por 30 s, além do
 *   teto de 5 s do app; WEB-534); `valid` desfaz. Fora de `valid`, a sessão de checkout que mandar cupom é
 *   recusada com 400, como no Stripe;
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
  postalcode: string | null
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

/** Faturas semeadas, por assinatura, e cobranças, por cliente (WEB-443). */
const stripeInvoices = new Map<string, unknown[]>()
const stripeCharges = new Map<string, unknown[]>()

/** Documentos (`tax_ids`) de cada cliente (WEB-444). */
const stripeTaxIds = new Map<
  string,
  { id: string; object: 'tax_id'; type: string; value: string }[]
>()

/**
 * AbacatePay (WEB-536): assinaturas Pix semeadas por `POST /abacatepay/subscriptions`
 * e o que o app pediu, em `GET /abacatepay/calls`. A API responde em `/v2/*`
 * como a de verdade: `{ data, error }`.
 */
const abacateSubscriptions = new Map<
  string,
  { id: string; status: string; currentPeriodEnd: string; createdAt: string }
>()
const abacateCalls: { method: string; path: string; body: unknown }[] = []

function abacatepay(path: string, body: unknown, url: URL) {
  const reply = (status: number, data: unknown, error: string | null = null) =>
    Response.json({ data, error }, { status })
  if (path === '/subscriptions/get') {
    const sub = abacateSubscriptions.get(url.searchParams.get('id') ?? '')
    return sub ? reply(200, sub) : reply(404, null, 'Subscription not found')
  }
  if (path === '/subscriptions/cancel') {
    const sub = abacateSubscriptions.get((body as { id?: string })?.id ?? '')
    if (!sub) return reply(404, null, 'Subscription not found')
    if (sub.status !== 'ACTIVE') {
      return reply(400, null, 'Subscription is not active')
    }
    sub.status = 'CANCELLED'
    return reply(200, sub)
  }
  return reply(404, null, `rota não dublada: ${path}`)
}

/** Preços anuais na conta (WEB-442). Global: só teste serial liga. */
let annualPrices = false

/** O que o "Stripe" diz do cupom de fundador. Global: só teste serial troca. */
let couponState: 'valid' | 'exhausted' | 'missing' | 'slow' = 'valid'

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
      const postalcode = url.searchParams.get('postalcode')
      calls.push({
        street,
        city,
        state,
        postalcode,
        at: new Date().toISOString()
      })
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
    if (url.pathname.startsWith('/v2/')) {
      const path = url.pathname.slice('/v2'.length)
      const body = request.method === 'POST' ? await request.json() : null
      abacateCalls.push({ method: request.method, path, body })
      return abacatepay(path, body, url)
    }
    if (url.pathname === '/abacatepay/calls') return Response.json(abacateCalls)
    if (
      url.pathname === '/abacatepay/subscriptions' &&
      request.method === 'POST'
    ) {
      const sub = (await request.json()) as {
        id: string
        currentPeriodEnd: string
      }
      abacateSubscriptions.set(sub.id, {
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        ...sub
      })
      return Response.json({ ok: true })
    }
    if (url.pathname === '/stripe/calls') return Response.json(stripeCalls)
    if (url.pathname === '/stripe/subscriptions' && request.method === 'POST') {
      const subscription = (await request.json()) as { id: string }
      stripeSubscriptions.set(subscription.id, subscription)
      return Response.json({ ok: true })
    }
    if (url.pathname === '/stripe/annual' && request.method === 'POST') {
      annualPrices = ((await request.json()) as { available: boolean })
        .available
      return Response.json({ ok: true })
    }
    if (url.pathname === '/stripe/coupon' && request.method === 'POST') {
      couponState = ((await request.json()) as { state: typeof couponState })
        .state
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
    if (url.pathname === '/stripe/invoices' && request.method === 'POST') {
      const seeded = (await request.json()) as {
        subscription: string
        customer: string
        invoices: unknown[]
        charges: unknown[]
      }
      stripeInvoices.set(seeded.subscription, seeded.invoices)
      stripeCharges.set(seeded.customer, seeded.charges)
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

  const taxIds = /^\/customers\/(cus_[^/]+)\/tax_ids(?:\/([^/]+))?$/.exec(path)
  if (taxIds) {
    const [, owner = '', taxId] = taxIds
    const current = stripeTaxIds.get(owner) ?? []
    if (request.method === 'GET') return list(current)
    if (request.method === 'POST') {
      if (body.value === '99.999.999/0001-91') {
        return stripeError(400, 'Invalid value for br_cnpj.')
      }
      const created = {
        id: `txi_e2e_${crypto.randomUUID()}`,
        object: 'tax_id' as const,
        type: body.type ?? '',
        value: body.value ?? ''
      }
      stripeTaxIds.set(owner, [...current, created])
      return Response.json(created)
    }
    stripeTaxIds.set(
      owner,
      current.filter((item) => item.id !== taxId)
    )
    return Response.json({ id: taxId, object: 'tax_id', deleted: true })
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
  if (request.method === 'DELETE' && subscription) {
    const found = stripeSubscriptions.get(subscription[1] ?? '')
    if (!found) {
      return stripeError(404, `No such subscription: ${subscription[1]}`)
    }
    const canceled = { ...found, status: 'canceled' }
    stripeSubscriptions.set(subscription[1] ?? '', canceled)
    return Response.json(canceled)
  }
  if (request.method === 'POST' && subscription) {
    const found = stripeSubscriptions.get(subscription[1] ?? '')
    if (!found) {
      return stripeError(404, `No such subscription: ${subscription[1]}`)
    }
    const updated = {
      ...found,
      cancellation_details: {
        reason: null,
        feedback: body['cancellation_details[feedback]'] ?? null,
        comment: body['cancellation_details[comment]'] ?? null
      }
    }
    stripeSubscriptions.set(subscription[1] ?? '', updated)
    return Response.json(updated)
  }
  if (request.method === 'GET' && subscription) {
    const found = stripeSubscriptions.get(subscription[1] ?? '') as
      | { customer: string; default_payment_method?: { id: string } | null }
      | undefined
    if (!found) {
      return stripeError(404, `No such subscription: ${subscription[1]}`)
    }
    const expand = Object.entries(query)
      .filter(([key]) => key.startsWith('expand['))
      .map(([, value]) => value)
    return Response.json({
      ...found,
      default_payment_method: expand.includes('default_payment_method')
        ? (found.default_payment_method ?? null)
        : (found.default_payment_method?.id ?? null),
      customer: expand.some((path) => path.split('.')[0] === 'customer')
        ? {
            id: found.customer,
            object: 'customer',
            balance: stripeBalances.get(found.customer)?.balance ?? 0,
            invoice_settings: { default_payment_method: null }
          }
        : found.customer
    })
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

  if (request.method === 'GET' && path === '/invoices') {
    return list(stripeInvoices.get(query.subscription ?? '') ?? [])
  }
  // Fatura avulsa da subida do Pix para o cartão (WEB-536): criada,
  // recebe o item, é finalizada e paga. O teste lê em `/stripe/calls`.
  if (request.method === 'POST' && path === '/invoices') {
    return Response.json({
      id: `in_e2e_${crypto.randomUUID().slice(0, 8)}`,
      object: 'invoice',
      status: 'draft',
      customer: body.customer
    })
  }
  if (request.method === 'POST' && path === '/invoiceitems') {
    return Response.json({
      id: `ii_e2e_${crypto.randomUUID().slice(0, 8)}`,
      object: 'invoiceitem',
      invoice: body.invoice,
      amount: Number(body.amount)
    })
  }
  const invoiceAction = path.match(/^\/invoices\/([^/]+)\/(finalize|pay)$/)
  if (request.method === 'POST' && invoiceAction) {
    return Response.json({
      id: invoiceAction[1],
      object: 'invoice',
      status: invoiceAction[2] === 'pay' ? 'paid' : 'open'
    })
  }
  if (request.method === 'GET' && path === '/charges') {
    return list(stripeCharges.get(query.customer ?? '') ?? [])
  }

  if (request.method === 'GET' && path === '/prices') {
    const lookupKeys = Object.entries(query)
      .filter(([key]) => key.startsWith('lookup_keys'))
      .map(([, value]) => value)
    return list(
      lookupKeys
        .filter((key) => annualPrices || !key.endsWith('_yearly'))
        .map((lookupKey) => ({
          id: `price_e2e_${lookupKey}`,
          object: 'price',
          active: true,
          currency: 'brl',
          lookup_key: lookupKey,
          recurring: {
            interval: lookupKey.endsWith('_yearly') ? 'year' : 'month',
            usage_type: 'licensed'
          }
        }))
    )
  }

  const coupon = /^\/coupons\/([^/]+)$/.exec(path)
  if (request.method === 'GET' && coupon) {
    if (couponState === 'missing') {
      return stripeError(404, `No such coupon: ${coupon[1]}`)
    }
    // O de fundador do anual (WEB-442) existe junto com os preços anuais.
    const annualCoupon = coupon[1] === 'fundador_anual'
    if (annualCoupon && !annualPrices) {
      return stripeError(404, `No such coupon: ${coupon[1]}`)
    }
    if (couponState === 'slow') await Bun.sleep(30_000)
    return Response.json({
      id: coupon[1],
      object: 'coupon',
      valid: couponState === 'valid',
      amount_off: annualCoupon ? 28000 : 2800,
      currency: 'brl',
      duration: 'forever',
      times_redeemed: 0
    })
  }

  if (request.method === 'POST' && path === '/checkout/sessions') {
    if (body['discounts[0][coupon]'] && couponState !== 'valid') {
      return stripeError(400, `No such coupon: ${body['discounts[0][coupon]']}`)
    }
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
