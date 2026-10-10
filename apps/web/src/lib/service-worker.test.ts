import { afterAll, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const fonte = readFileSync(
  new URL('../../public/sw.js', import.meta.url),
  'utf8'
)

// O Workers assets (produção e `vite preview --mode cloudflare`) responde
// `/offline.html` com 307 para `/offline`. O `vite dev` não, e por isso o E2E
// não vê este caso.
const servidor = Bun.serve({
  port: 0,
  fetch(requisicao) {
    const { pathname } = new URL(requisicao.url)
    if (pathname === '/offline.html') {
      return new Response(null, {
        status: 307,
        headers: { location: '/offline' }
      })
    }
    if (pathname === '/offline') {
      return new Response('<h1>Sem conexão</h1>', {
        headers: { 'content-type': 'text/html' }
      })
    }
    return new Response(null, { status: 404 })
  }
})
afterAll(() => servidor.stop(true))

type Evento = {
  request?: { method: string; url: string; mode: string }
  waitUntil?: (promessa: Promise<unknown>) => void
  respondWith?: (resposta: Promise<Response>) => void
}

test('WEB-269: sem rede, a navegação recebe a página offline sem a marca de redirecionada', async () => {
  const origem = servidor.url.origin
  const ouvintes = new Map<string, (evento: Evento) => void>()
  const guardado = new Map<string, Response>()
  let semRede = false
  const buscar = (alvo: string | { url: string }) =>
    semRede
      ? Promise.reject(new TypeError('Failed to fetch'))
      : fetch(new URL(typeof alvo === 'string' ? alvo : alvo.url, origem))
  const cache = {
    // Como o `cache.add` de verdade: guarda a resposta do jeito que chegou.
    add: async (chave: string) => void guardado.set(chave, await buscar(chave)),
    put: async (chave: string, resposta: Response) =>
      void guardado.set(chave, resposta)
  }

  new Function('self', 'caches', 'fetch', fonte)(
    {
      addEventListener: (tipo: string, ouvinte: (evento: Evento) => void) =>
        ouvintes.set(tipo, ouvinte),
      skipWaiting: async () => {},
      location: { origin: origem }
    },
    {
      open: async () => cache,
      match: async (chave: string) => guardado.get(chave)
    },
    buscar
  )

  let instalado: Promise<unknown> = Promise.resolve()
  ouvintes.get('install')?.({
    waitUntil: (promessa) => {
      instalado = promessa
    }
  })
  await instalado

  semRede = true
  let respondido: Promise<Response> | undefined
  ouvintes.get('fetch')?.({
    request: {
      method: 'GET',
      url: `${origem}/dashboard/profile`,
      mode: 'navigate'
    },
    respondWith: (resposta) => {
      respondido = resposta
    }
  })
  const resposta = await respondido

  // O navegador recusa resposta redirecionada numa navegação: `ERR_FAILED`.
  expect(resposta?.redirected).toBe(false)
  expect(resposta?.status).toBe(200)
  expect(resposta?.headers.get('content-type')).toBe('text/html')
  expect(await resposta?.text()).toContain('Sem conexão')
})
