/**
 * Service worker mínimo do PWA (WEB-72).
 *
 * Ele existe por um motivo só: o Chrome no Android não oferece "Instalar app"
 * sem um service worker registrado que responda a `fetch` e sirva algo quando
 * a rede cai. Não é cache offline de verdade, e não deve virar um sem
 * decisão explícita.
 *
 * A estratégia é deliberadamente conservadora:
 *
 * - **Navegação: rede primeiro, sempre.** HTML nunca sai do cache no caminho
 *   feliz. Um SW que serve HTML de cache entrega a versão anterior do app
 *   depois de um deploy, e o usuário instalado fica preso numa build velha
 *   sem ter como saber. Só quando a rede falha é que a página offline
 *   aparece.
 * - **Asset versionado: cache primeiro.** `/assets/*` é gerado pelo Vite com
 *   hash no nome, então um arquivo em cache nunca é a versão errada — o nome
 *   muda quando o conteúdo muda.
 * - **Nada mais é interceptado.** API, tRPC, mapa e imagem externa passam
 *   direto.
 *
 * `skipWaiting` + `clients.claim` fazem o SW novo assumir na primeira visita
 * depois do deploy, em vez de esperar todas as abas fecharem.
 */

const VERSAO = 'v1'
const CACHE_ASSETS = `onside-assets-${VERSAO}`
const CACHE_SHELL = `onside-shell-${VERSAO}`
const PAGINA_OFFLINE = '/offline.html'

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.add(PAGINA_OFFLINE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves
            .filter((chave) => !chave.endsWith(VERSAO))
            .map((chave) => caches.delete(chave))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (evento) => {
  const requisicao = evento.request
  if (requisicao.method !== 'GET') return

  const url = new URL(requisicao.url)
  if (url.origin !== self.location.origin) return

  if (requisicao.mode === 'navigate') {
    evento.respondWith(
      fetch(requisicao).catch(() =>
        caches.match(PAGINA_OFFLINE).then(
          (resposta) =>
            resposta ??
            new Response('Sem conexão.', {
              status: 503,
              headers: { 'content-type': 'text/plain; charset=utf-8' }
            })
        )
      )
    )
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    evento.respondWith(
      caches.match(requisicao).then(
        (emCache) =>
          emCache ??
          fetch(requisicao).then((resposta) => {
            if (resposta.ok) {
              const copia = resposta.clone()
              void caches
                .open(CACHE_ASSETS)
                .then((cache) => cache.put(requisicao, copia))
            }
            return resposta
          })
      )
    )
  }
})
