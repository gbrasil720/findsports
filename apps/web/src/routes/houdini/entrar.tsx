import { createFileRoute, redirect } from '@tanstack/react-router'

import { HatIcon } from '@/components/houdini/icons'

export const Route = createFileRoute('/houdini/entrar')({
  beforeLoad: ({ context }) => {
    // Quem já tem sessão de admin não precisa da Entrada.
    if (context.gate.kind !== 'visitor') throw redirect({ to: '/houdini' })
    return { loginHref: context.gate.loginHref }
  },
  component: Entrada
})

function Entrada() {
  const { loginHref } = Route.useRouteContext()
  return (
    <main className="hd-center">
      <span className="hd-hat-tile">
        <HatIcon size={68} />
      </span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center'
        }}
      >
        <h1 className="hd-h1" style={{ fontSize: 72 }}>
          Houdini
        </h1>
        <p className="hd-lead">Está e não está.</p>
      </div>
      <a
        href={loginHref}
        className="hd-btn hd-btn-primary is-lg"
        style={{ minWidth: 'min(300px, 100%)' }}
      >
        Entrar com a conta Onside
      </a>
      <p className="hd-mono hd-small" style={{ margin: 0 }}>
        só admin com 2FA · o resto recebe 404 do servidor
      </p>
    </main>
  )
}
