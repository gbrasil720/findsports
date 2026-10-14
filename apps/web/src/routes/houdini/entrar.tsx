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
        <HatIcon size={64} />
      </span>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'center'
        }}
      >
        <h1
          style={{
            margin: 0,
            fontWeight: 700,
            fontSize: 40,
            letterSpacing: '-0.03em'
          }}
        >
          Houdini
        </h1>
        <p style={{ margin: 0, fontSize: 16, color: 'var(--hd-muted)' }}>
          Está e não está.
        </p>
      </div>
      <a href={loginHref} className="hd-btn hd-btn-primary">
        Entrar com a conta Onside
      </a>
      <p className="hd-mono hd-small" style={{ margin: 0 }}>
        só role admin com 2FA · o resto recebe 404 do servidor
      </p>
    </main>
  )
}
