/**
 * Teste de carga da busca por proximidade (ESC-18).
 *
 * A busca é a métrica que define se o produto é usável, e todo o ESC-01 foi
 * medido em consulta isolada. Isto exercita o caminho inteiro — função,
 * sessão, banco — sob concorrência.
 *
 * Requer o k6 (https://k6.io). Rodar:
 *
 *   BASE_URL=http://localhost:3001 \
 *   LOAD_EMAIL=... LOAD_PASSWORD=... \
 *   k6 run apps/web/scripts/load-test.k6.js
 *
 * NUNCA aponte para produção sem combinar antes: o script autentica e gera
 * carga real, e a busca escreve nada mas o login escreve sessão.
 */
import { check, sleep } from 'k6'
import http from 'k6/http'
import { Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001'
const EMAIL = __ENV.LOAD_EMAIL
const PASSWORD = __ENV.LOAD_PASSWORD

const buscaDuracao = new Trend('busca_duracao_ms', true)

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    // O alvo declarado no relatório: p95 abaixo de 300 ms.
    busca_duracao_ms: ['p(95)<300'],
    http_req_failed: ['rate<0.01']
  }
}

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Defina LOAD_EMAIL e LOAD_PASSWORD')
  }
  const res = http.post(
    `${BASE_URL}/api/auth/sign-in/email`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  check(res, { 'login ok': (r) => r.status === 200 })
  // Devolve os cookies para as VUs reaproveitarem a mesma sessão.
  return { cookies: res.cookies }
}

export default function (data) {
  const jar = http.cookieJar()
  for (const nome of Object.keys(data.cookies)) {
    jar.set(BASE_URL, nome, data.cookies[nome][0].value)
  }

  // Coordenadas variadas: um ponto fixo esconderia o custo do índice
  // espacial, porque o mesmo plano e as mesmas páginas ficariam em cache.
  const lat = -23.55 + (Math.random() - 0.5) * 0.2
  const lng = -46.63 + (Math.random() - 0.5) * 0.2
  const input = encodeURIComponent(
    JSON.stringify({ lat, lng, radiusKm: 3, limit: 20 })
  )

  const res = http.get(`${BASE_URL}/api/trpc/pubs.search?input=${input}`)
  buscaDuracao.add(res.timings.duration)
  check(res, {
    'busca respondeu 200': (r) => r.status === 200,
    'busca devolveu bares': (r) => r.body.includes('bars')
  })

  sleep(1)
}
