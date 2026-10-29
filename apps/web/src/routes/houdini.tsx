import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  rootRouteId
} from '@tanstack/react-router'

import houdiniCss from '@/components/houdini/houdini.css?url'
import { getHoudiniGate } from '@/functions/houdini-gate'

/**
 * O Houdini instala como app (a cartola na tela inicial). Só quem passou do
 * portão recebe manifest e ícones: a Cortina continua um 404 qualquer, sem
 * "Instalar Houdini" na barra do navegador.
 */
const HOUDINI_APP_META = [
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'mobile-web-app-capable', content: 'yes' },
  {
    name: 'apple-mobile-web-app-status-bar-style',
    content: 'black-translucent'
  },
  { name: 'apple-mobile-web-app-title', content: 'Houdini' }
]

const HOUDINI_APP_LINKS = [
  { rel: 'manifest', href: '/houdini.webmanifest' },
  {
    rel: 'icon',
    href: '/icons/houdini-32.png',
    type: 'image/png',
    sizes: '32x32'
  },
  {
    rel: 'apple-touch-icon',
    href: '/icons/houdini-apple-touch.png',
    sizes: '180x180'
  }
]

/**
 * WEB-383: raiz do Houdini. O portão (`getHoudiniGate`) roda no servidor a
 * cada navegação; o que não for admin com 2FA não passa daqui. O 404 é o de
 * verdade, com status 404: a Cortina no host do Houdini, a página comum no
 * domínio público.
 */
export const Route = createFileRoute('/houdini')({
  beforeLoad: async ({ location }) => {
    const gate = await getHoudiniGate()
    if (gate.kind === 'blocked') {
      if (gate.redirectTo) throw redirect({ href: gate.redirectTo })
      throw notFound({ routeId: rootRouteId })
    }
    const entrada = location.pathname === '/houdini/entrar'
    if (gate.kind === 'hidden') throw notFound()
    if (gate.kind === 'visitor' && !entrada) throw notFound()
    return { gate }
  },
  // Depois do `beforeLoad`: o TypeScript infere o contexto na ordem.
  head: ({ match }) => {
    const app = match.context.gate?.kind === 'ok'
    return {
      meta: [
        { title: 'Houdini' },
        { name: 'robots', content: 'noindex, nofollow' },
        // `viewport-fit=cover` desenha sob o notch (a casca devolve com
        // `env(safe-area-inset-*)`); `resizes-content` faz o teclado do Android
        // encolher a tela como no iOS.
        {
          name: 'viewport',
          content:
            'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'
        },
        // O tema segue o sistema (`houdini.css`); a barra do navegador junto.
        {
          name: 'theme-color',
          content: '#12120F',
          media: '(prefers-color-scheme: dark)'
        },
        {
          name: 'theme-color',
          content: '#F1EEE6',
          media: '(prefers-color-scheme: light)'
        },
        { name: 'color-scheme', content: 'dark light' },
        ...(app ? HOUDINI_APP_META : [])
      ],
      links: [
        { rel: 'stylesheet', href: houdiniCss },
        ...(app ? HOUDINI_APP_LINKS : [])
      ]
    }
  },
  notFoundComponent: Cortina,
  component: HoudiniRoot
})

function HoudiniRoot() {
  return (
    <div className="houdini">
      <Outlet />
    </div>
  )
}

/**
 * O 404 do host do Houdini: o mesmo para todo mundo que não é admin. O ponto
 * final leva à Entrada; é só cenografia, o portão é que decide.
 */
function Cortina() {
  return (
    <main className="houdini hd-cortina">
      <p style={{ margin: 0 }}>
        404 · nada por aqui
        <Link to="/houdini/entrar" aria-label="Entrar">
          .
        </Link>
      </p>
    </main>
  )
}
