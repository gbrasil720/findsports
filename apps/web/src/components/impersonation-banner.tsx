import { Loading03Icon, UserSwitchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'

export function ImpersonationBanner() {
  const { data: session } = authClient.useSession()
  const [stopping, setStopping] = useState(false)

  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy

  if (!impersonatedBy) return null

  async function handleStop() {
    setStopping(true)
    try {
      await authClient.admin.stopImpersonating()
      window.location.href = '/internal/manage-users'
    } catch {
      setStopping(false)
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] font-body">
      <div className="flex items-center justify-between gap-4 bg-amber-500 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-600">
            <HugeiconsIcon
              icon={UserSwitchIcon}
              className="size-3.5 text-white"
            />
          </div>
          <span className="text-sm font-medium text-white">
            Modo de personificação ativo —{' '}
            <span className="font-bold">{session?.user?.name}</span>{' '}
            <span className="opacity-75 text-xs">({session?.user?.email})</span>
          </span>
        </div>
        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/30 disabled:opacity-60"
        >
          {stopping ? (
            <HugeiconsIcon icon={Loading03Icon} className="size-3 animate-spin" />
          ) : null}
          Encerrar sessão
        </button>
      </div>
    </div>
  )
}
