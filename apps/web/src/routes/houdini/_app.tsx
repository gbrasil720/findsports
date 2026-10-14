import { createFileRoute, Outlet, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { TwoFactorSettings } from '@/components/account/two-factor-settings'
import { HatIcon } from '@/components/houdini/icons'
import type { HoudiniEnv } from '@/functions/houdini-gate'
import { authClient } from '@/lib/auth-client'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/**
 * WEB-383: tudo que fica atrás do portão. Daqui para dentro a sessão é de
 * admin; o que falta resolver antes da casca é a impersonação em andamento e o
 * 2FA obrigatório.
 */
export const Route = createFileRoute('/houdini/_app')({
  beforeLoad: ({ context }) => {
    const { gate, session } = context
    const env: HoudiniEnv =
      gate.kind === 'ok' || gate.kind === 'needs2fa' ? gate.env : 'local'
    return {
      env,
      admin: { id: session?.user.id ?? '', name: session?.user.name ?? '' }
    }
  },
  component: HoudiniApp
})

function HoudiniApp() {
  const { gate } = Route.useRouteContext()
  if (gate.kind === 'impersonating') {
    return <NaPeleAqui name={gate.name} email={gate.email} />
  }
  if (gate.kind === 'needs2fa') return <DoisFatores />
  return <Outlet />
}

/** Admin com a sessão de outra conta: o Houdini só oferece sair da pele. */
function NaPeleAqui({ name, email }: { name: string; email: string }) {
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function stop() {
    setStopping(true)
    setError(null)
    const result = await authClient.admin.stopImpersonating()
    if (result.error) {
      setStopping(false)
      setError(
        getUserFacingMessage(result.error, 'Não foi possível tirar a pele.')
      )
      return
    }
    window.location.reload()
  }

  return (
    <main className="hd-center">
      <span className="hd-hat-tile">
        <HatIcon size={56} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="hd-h1">Você está na pele de {name}</h1>
        <p className="hd-mono hd-small" style={{ margin: 0 }}>
          {email}
        </p>
      </div>
      <p className="hd-lead">
        O Houdini só abre com a sua própria sessão. Tire a pele para voltar.
      </p>
      <button
        type="button"
        className="hd-btn hd-btn-primary"
        onClick={stop}
        disabled={stopping}
      >
        {stopping ? 'Tirando…' : 'Tirar a pele'}
      </button>
      {error ? (
        <p role="alert" style={{ margin: 0, color: 'var(--hd-bad)' }}>
          {error}
        </p>
      ) : null}
    </main>
  )
}

/** WEB-383: 2FA é obrigatório para entrar no Houdini. */
function DoisFatores() {
  const router = useRouter()
  return (
    <main className="hd-center" style={{ gap: 24 }}>
      <span className="hd-hat-tile">
        <HatIcon size={56} />
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 className="hd-h1">Antes do truque, o 2FA</h1>
        <p className="hd-lead">
          O Houdini entra na pele de contas, bane e tira bar do ar. Por isso só
          abre para admin com autenticação em dois fatores ligada.
        </p>
      </div>
      <div style={{ width: '100%', maxWidth: 560, textAlign: 'left' }}>
        <TwoFactorSettings />
      </div>
      <button
        type="button"
        className="hd-btn"
        onClick={() => void router.invalidate()}
      >
        Já ativei, continuar
      </button>
    </main>
  )
}
