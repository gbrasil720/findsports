/**
 * PWA — cabeçalho, detecção de plataforma e memória de dispensa (WEB-72).
 *
 * O app instalável cobre só o produto logado: `/dashboard`, `/admin`, `/plan`
 * e subpáginas. A landing fica de fora de propósito — quem instala já é
 * usuário, e abrir o ícone da tela inicial para cair numa página de aquisição
 * seria um defeito com atalho permanente.
 *
 * O `scope` do manifest é `/` porque `scope` aceita um caminho só, e ele
 * precisa ser prefixo de `start_url` e da URL do manifest. `/dashboard` e
 * `/admin` são irmãos: o único prefixo comum é a raiz. O que restringe o
 * convite não é o `scope`, é **onde o `<link rel="manifest">` é declarado** —
 * e ele só é declarado nas rotas acima, nunca no `__root.tsx` e nunca em
 * `/internal/*`.
 */

/**
 * Fragmento de `head` das rotas dentro do recorte. Espalhe em `head()`:
 *
 * ```ts
 * head: () => ({ meta: [...PWA_META, ...], links: [...PWA_LINKS] })
 * ```
 */
export const PWA_LINKS = [
  { rel: 'manifest', href: '/manifest.webmanifest' }
] as const

export const PWA_META = [
  // Sem isto o atalho do iOS abre dentro do Safari, com barra de endereço, em
  // vez de abrir como app.
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  {
    name: 'apple-mobile-web-app-status-bar-style',
    content: 'black-translucent'
  },
  { name: 'apple-mobile-web-app-title', content: 'Onside' }
] as const

/** `true` quando a página já está rodando dentro do app instalado. */
export function estaInstalado(): boolean {
  if (typeof window === 'undefined') return false

  const comoApp = window.matchMedia?.('(display-mode: standalone)').matches
  // O iOS não implementa `display-mode: standalone` no matchMedia até hoje;
  // `navigator.standalone` é o único sinal lá.
  const comoAppIOS = (window.navigator as Navigator & { standalone?: boolean })
    .standalone

  return Boolean(comoApp || comoAppIOS)
}

/**
 * iOS e iPadOS. O iPad moderno se anuncia como Macintosh, e só a presença de
 * toque o separa de um Mac de verdade.
 */
export function ehIOS(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

/**
 * A dispensa é por usuário, não por aba: `sessionStorage` traria o convite de
 * volta na aba seguinte, que é exatamente o comportamento que faz um aviso
 * virar incômodo.
 */
export function chaveDeDispensa(userId: string): string {
  return `onside:pwa-install-dismissed:${userId}`
}

export function foiDispensado(userId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(chaveDeDispensa(userId)) === '1'
  } catch {
    // Safari em navegação privada lança ao ler `localStorage`. Um convite a
    // mais é melhor que uma tela quebrada.
    return false
  }
}

export function marcarDispensado(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(chaveDeDispensa(userId), '1')
  } catch {
    // Sem persistência, o convite volta na próxima navegação. Aceitável: o
    // caso é raro e a alternativa é derrubar a tela.
  }
}

/**
 * Registra o service worker com escopo de raiz.
 *
 * O arquivo mora em `/sw.js` justamente para poder reivindicar `/` — um SW
 * servido de `/dashboard/sw.js` só controlaria `/dashboard/`, e o app
 * instalado atravessa `/admin` e `/plan`.
 */
export function registrarServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return

  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
    // Instalabilidade é um extra: se o registro falhar, o app continua
    // funcionando como site.
  })
}
