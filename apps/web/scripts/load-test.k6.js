/**
 * Navegação autenticada sob carga no ambiente local isolado.
 *
 * O servidor deve usar NODE_ENV=test + LOAD_TEST_DATABASE_URL apontando para
 * findsports_load_test. Este script também recusa qualquer BASE_URL que não
 * seja HTTP em loopback (ou host.docker.internal, quando o k6 roda no Docker).
 */
import { check, fail, sleep } from 'k6'
import http from 'k6/http'
import { Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://host.docker.internal:3101'
const EMAIL = __ENV.LOAD_EMAIL || 'load-fan@local.invalid'
const PASSWORD = __ENV.LOAD_PASSWORD
const BAR_ID = __ENV.LOAD_BAR_ID || '30000000-0000-4000-8000-000000000001'
const WORKLOAD = __ENV.WORKLOAD || 'browse'

const safeBaseUrlPattern =
  /^http:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal|\[::1\])(?::\d+)?\/?$/
if (!safeBaseUrlPattern.test(BASE_URL)) {
  throw new Error(`BASE_URL insegura: ${BASE_URL}. Use somente HTTP local.`)
}

function positiveInteger(name, fallback) {
  const value = Number(__ENV[name] || fallback)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} precisa ser um inteiro positivo`)
  }
  return value
}

const TARGET_VUS = positiveInteger('TARGET_VUS', 25)
const RAMP_DURATION = __ENV.RAMP_DURATION || '30s'
const HOLD_DURATION = __ENV.HOLD_DURATION || '1m'
const P95_MS = positiveInteger('P95_MS', 300)
const BAR_COUNT = positiveInteger('BAR_COUNT', 100_000)

if (!['browse', 'commercial-write', 'waitlist-write'].includes(WORKLOAD)) {
  throw new Error(
    'WORKLOAD precisa ser browse, commercial-write ou waitlist-write'
  )
}

const searchDuration = new Trend('search_duration_ms', true)
const locationDuration = new Trend('location_search_duration_ms', true)
const profileDuration = new Trend('bar_profile_duration_ms', true)
const catalogDuration = new Trend('catalog_duration_ms', true)
const featuredDuration = new Trend('featured_duration_ms', true)
const homeDuration = new Trend('home_duration_ms', true)
const commercialWriteDuration = new Trend('commercial_write_duration_ms', true)
const waitlistWriteDuration = new Trend('waitlist_write_duration_ms', true)

export const options = {
  stages: [
    { duration: RAMP_DURATION, target: TARGET_VUS },
    { duration: HOLD_DURATION, target: TARGET_VUS },
    { duration: RAMP_DURATION, target: 0 }
  ],
  thresholds: {
    search_duration_ms: [`p(95)<${P95_MS}`],
    location_search_duration_ms: [`p(95)<${P95_MS}`],
    bar_profile_duration_ms: [`p(95)<${P95_MS}`],
    commercial_write_duration_ms: [`p(95)<${P95_MS}`],
    waitlist_write_duration_ms: [`p(95)<${P95_MS}`],
    http_req_failed: ['rate<0.01']
  },
  userAgent: 'FindSportsLocalLoadTest/1.0'
}

function trpcUrl(path, input) {
  const query =
    input === undefined
      ? ''
      : `?input=${encodeURIComponent(JSON.stringify(input))}`
  return `${BASE_URL}/api/trpc/${path}${query}`
}

function responseOk(response) {
  return response.status === 200 && !response.body.includes('"error"')
}

export function setup() {
  const health = http.get(trpcUrl('healthCheck'), {
    tags: { name: 'GET /api/trpc/healthCheck' }
  })
  if (!check(health, { 'servidor local saudável': responseOk })) {
    fail(`Health check falhou com HTTP ${health.status}`)
  }

  if (WORKLOAD === 'waitlist-write') {
    return { runId: Date.now().toString(36) }
  }

  if (!PASSWORD) fail('Defina LOAD_PASSWORD para a conta local de carga')

  const login = http.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/auth/sign-in/email' }
    }
  )
  if (
    !check(login, {
      'login local funcionou': (response) => response.status === 200
    })
  ) {
    fail(`Login falhou com HTTP ${login.status}`)
  }

  const cookieHeader = Object.keys(login.cookies)
    .map((name) => `${name}=${login.cookies[name][0].value}`)
    .join('; ')
  const privateData = http.get(trpcUrl('privateData'), {
    headers: { Cookie: cookieHeader },
    tags: { name: 'GET /api/trpc/privateData' }
  })
  if (!check(privateData, { 'cookie autenticou no tRPC': responseOk })) {
    fail(`Cookie de sessão falhou com HTTP ${privateData.status}`)
  }

  return { cookieHeader, runId: Date.now().toString(36) }
}

function getTrpc(
  path,
  input,
  metric,
  name,
  cookieHeader,
  validate = responseOk
) {
  const response = http.get(trpcUrl(path, input), {
    headers: { Cookie: cookieHeader },
    tags: { name }
  })
  metric.add(response.timings.duration)
  check(response, { [`${path} respondeu corretamente`]: validate })
}

export default function (data) {
  if (WORKLOAD === 'commercial-write') {
    const barNumber = Math.floor(Math.random() * BAR_COUNT) + 1
    const pubId = `30000000-0000-4000-8000-${String(barNumber).padStart(12, '0')}`
    const response = http.post(
      `${BASE_URL}/api/bar/commercial-event`,
      JSON.stringify({ pubId, type: 'profile_view' }),
      {
        headers: {
          Cookie: data.cookieHeader,
          'Content-Type': 'application/json'
        },
        tags: { name: 'POST /api/bar/commercial-event' }
      }
    )
    commercialWriteDuration.add(response.timings.duration)
    check(response, {
      'evento comercial gravado': (result) => result.status === 200
    })
    sleep(0.5 + Math.random())
    return
  }

  if (WORKLOAD === 'waitlist-write') {
    const email = `load-${data.runId}-${__VU}-${__ITER}@load.invalid`
    const response = http.post(
      trpcUrl('waitlist.join'),
      JSON.stringify({ email, city: 'São Paulo', role: 'fan' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'POST /api/trpc/waitlist.join' }
      }
    )
    waitlistWriteDuration.add(response.timings.duration)
    check(response, {
      'waitlist gravou entrada única': responseOk
    })
    sleep(0.5 + Math.random())
    return
  }

  const roll = Math.random()
  if (roll < 0.4) {
    const lat = -23.55 + (Math.random() - 0.5) * 0.12
    const lng = -46.63 + (Math.random() - 0.5) * 0.12
    getTrpc(
      'pubs.search',
      { lat, lng, radiusKm: 3, limit: 20 },
      searchDuration,
      'GET /api/trpc/pubs.search',
      data.cookieHeader,
      (response) => responseOk(response) && response.body.includes('"bars"')
    )
  } else if (roll < 0.6) {
    const lat = -23.55 + (Math.random() - 0.5) * 0.12
    const lng = -46.63 + (Math.random() - 0.5) * 0.12
    getTrpc(
      'pubs.searchByLocation',
      { lat, lng, radiusKm: 3, limit: 20 },
      locationDuration,
      'GET /api/trpc/pubs.searchByLocation',
      data.cookieHeader,
      (response) => responseOk(response) && response.body.includes('"bars"')
    )
  } else if (roll < 0.75) {
    getTrpc(
      'pubs.getById',
      { id: BAR_ID },
      profileDuration,
      'GET /api/trpc/pubs.getById',
      data.cookieHeader
    )
  } else if (roll < 0.85) {
    getTrpc(
      'pubs.getSports',
      undefined,
      catalogDuration,
      'GET /api/trpc/pubs.getSports',
      data.cookieHeader
    )
  } else if (roll < 0.95) {
    getTrpc(
      'pubs.getEliteEvents',
      undefined,
      featuredDuration,
      'GET /api/trpc/pubs.getEliteEvents',
      data.cookieHeader
    )
  } else {
    const response = http.get(`${BASE_URL}/`, {
      tags: { name: 'GET /' }
    })
    homeDuration.add(response.timings.duration)
    check(response, {
      'landing respondeu 200': (result) => result.status === 200
    })
  }

  sleep(0.5 + Math.random())
}
