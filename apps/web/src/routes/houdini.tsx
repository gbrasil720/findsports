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
 * WEB-383: raiz do Houdini. O portão (`getHoudiniGate`) roda no servidor a
 * cada navegação; o que não for admin com 2FA não passa daqui. O 404 é o de
 * verdade, com status 404: a Cortina no host do Houdini, a página comum no
 * domínio público.
 */
export const Route = createFileRoute('/houdini')({
  head: () => ({
    meta: [
      { title: 'Houdini' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'theme-color', content: '#0C0B10' }
    ],
    links: [{ rel: 'stylesheet', href: houdiniCss }]
  }),
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
export function Cortina() {
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
