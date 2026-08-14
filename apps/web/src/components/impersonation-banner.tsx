import { useCallback, useEffect, useRef, useState } from 'react'
import AlertTriangle from 'reicon-react/icons/AlertTriangle'
import Loader from 'reicon-react/icons/Loader'
import Users from 'reicon-react/icons/Users'
import { authClient } from '@/lib/auth-client'

export function ImpersonationBanner() {
  const { data: session } = authClient.useSession()
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bannerRef = useRef<HTMLDivElement>(null)

  const impersonatedBy = (
    session?.session as { impersonatedBy?: string | null } | undefined
  )?.impersonatedBy

  const measure = useCallback(() => {
    const el = bannerRef.current
    if (!el) return
    const h = el.offsetHeight
    document.documentElement.style.setProperty('--onside-banner-h', `${h}px`)
  }, [])

  useEffect(() => {
    if (!impersonatedBy) {
      document.documentElement.style.setProperty('--onside-banner-h', '0px')
      return
    }
    measure()
    const el = bannerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.setProperty('--onside-banner-h', '0px')
    }
  }, [impersonatedBy, measure])

  if (!impersonatedBy) return null

  async function handleStop() {
    setStopping(true)
    setError(null)
    try {
      await authClient.admin.stopImpersonating()
      window.location.href = '/internal/manage-users'
    } catch {
      setStopping(false)
      setError('Não foi possível encerrar a personificação. Tente novamente.')
    }
  }

  return (
    <div
      ref={bannerRef}
      className="fixed top-0 right-0 left-0 z-[60] border-b border-[var(--onside-ink)] bg-[var(--onside-acid)] font-[family-name:var(--onside-body)] text-[var(--onside-ink)]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="mx-auto flex min-h-11 w-full max-w-[var(--onside-max)] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:items-center">
          <div className="mt-0.5 grid size-7 shrink-0 place-items-center border border-[var(--onside-ink)] bg-[var(--onside-ink)] sm:mt-0">
            <Users size={14} color="var(--onside-paper)" aria-hidden="true" />
          </div>
          <div className="min-w-0 text-sm leading-snug">
            <span className="font-medium">Modo de personificação ativo — </span>
            <span className="font-bold break-words">
              {session?.user?.name || '…'}
            </span>{' '}
            <span className="break-all font-[family-name:var(--onside-mono)] text-xs text-[var(--onside-ink)] opacity-80">
              ({session?.user?.email})
            </span>
            {error ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs font-semibold text-[var(--onside-live-text)]">
                <AlertTriangle
                  size={14}
                  color="currentColor"
                  className="mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={handleStop}
          disabled={stopping}
          className="inline-flex min-h-11 min-w-[44px] shrink-0 items-center justify-center gap-1.5 border border-[var(--onside-ink)] bg-[var(--onside-ink)] px-4 py-2 text-xs font-bold uppercase tracking-wider text-[var(--onside-paper)] transition-[opacity] duration-150 hover:opacity-90 disabled:opacity-60"
        >
          {stopping ? (
            <Loader
              size={14}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {stopping
            ? 'Encerrando…'
            : error
              ? 'Tentar novamente'
              : 'Encerrar sessão'}
        </button>
      </div>
    </div>
  )
}
