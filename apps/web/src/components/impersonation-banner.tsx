import type { ImpersonationMode } from '@findsports_oficial/auth/impersonation-mode'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HatIcon } from '@/components/houdini/icons'
import { setImpersonationMode } from '@/functions/impersonation-mode'
import { authClient } from '@/lib/auth-client'
import { houdiniHref } from '@/lib/houdini-host'
import { getUserFacingError } from '@/lib/user-facing-error'

const MODES: { value: ImpersonationMode; label: string }[] = [
  { value: 'look', label: 'Só olhar' },
  { value: 'act', label: 'Pode agir' }
]

function elapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/*
 * Quem está sendo personificado vem da sessão do servidor, pelo contexto da
 * rota (`__root.tsx`), e não de `authClient.useSession()`: no SSR o hook não
 * tem sessão e o banner sairia vazio do HTML, enquanto o cliente — hidratando
 * depois do `lazy` — já tinha a sessão e o desenhava (WEB-196).
 *
 * WEB-390: a faixa só mostra e troca o modo; quem recusa a escrita em "Só
 * olhar" é o servidor (`@findsports_oficial/auth/impersonation-mode`).
 */
export function ImpersonationBanner({
  user,
  mode: initialMode,
  startedAt
}: {
  user: { name: string; email: string; role?: string | null }
  mode: ImpersonationMode
  startedAt: Date | string
}) {
  const [mode, setMode] = useState(initialMode)
  const [switching, setSwitching] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Só no cliente: o relógio do SSR não bate com o da hidratação.
  const [now, setNow] = useState<number | null>(null)
  const bannerRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    const el = bannerRef.current
    if (!el) return
    const h = el.offsetHeight
    document.documentElement.style.setProperty('--onside-banner-h', `${h}px`)
  }, [])

  useEffect(() => {
    measure()
    const el = bannerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => {
      ro.disconnect()
      document.documentElement.style.setProperty('--onside-banner-h', '0px')
    }
  }, [measure])

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  async function pick(next: ImpersonationMode) {
    if (next === mode || switching) return
    setSwitching(true)
    setError(null)
    try {
      setMode(await setImpersonationMode({ data: next }))
    } catch (reason) {
      setError(
        getUserFacingError(reason, 'Não foi possível trocar o modo.').message
      )
    } finally {
      setSwitching(false)
    }
  }

  async function handleStop() {
    setStopping(true)
    setError(null)
    try {
      const result = await authClient.admin.stopImpersonating()
      if (result.error) {
        setStopping(false)
        setError(
          getUserFacingError(
            result.error,
            'Não foi possível tirar a pele. Tente novamente.'
          ).message
        )
        return
      }
      window.location.href = houdiniHref(
        '/houdini/pessoas',
        new URL(window.location.href)
      )
    } catch (reason) {
      setStopping(false)
      setError(
        getUserFacingError(
          reason,
          'Não foi possível tirar a pele. Tente novamente.'
        ).message
      )
    }
  }

  /*
   * `sticky`, não `fixed`: fixo o banner sai do fluxo e, ao rolar, passa por
   * cima do conteúdo em qualquer tela sem cabeçalho grudado — perfil e
   * detalhe do bar. Grudado, ele ocupa a própria altura no fluxo e nunca
   * cobre nada.
   */
  return (
    <div
      ref={bannerRef}
      className="onside-pele"
      role="status"
      aria-live="polite"
    >
      <div className="onside-pele-row">
        <span className="onside-pele-hat">
          <HatIcon size={20} />
        </span>
        <span className="onside-pele-who">
          Você está na pele de <strong>{user.name || '…'}</strong>{' '}
          <span className="onside-pele-mono">
            <span className="onside-pele-dot">· </span>
            {user.email}
            {user.role ? ` · ${user.role}` : null}
          </span>
        </span>
        <fieldset className="onside-pele-seg" aria-label="Modo">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              disabled={switching}
              onClick={() => pick(m.value)}
            >
              {m.label}
            </button>
          ))}
        </fieldset>
        {/* `timer` não é anunciado a cada segundo dentro do `status`. */}
        <span
          className="onside-pele-clock"
          role="timer"
          aria-live="off"
          aria-label="Tempo na pele"
        >
          {now === null
            ? '--:--'
            : elapsed(now - new Date(startedAt).getTime())}
        </span>
        <button
          type="button"
          className="onside-pele-stop"
          onClick={handleStop}
          disabled={stopping}
        >
          {stopping ? 'Tirando…' : 'Tirar a pele'}
        </button>
      </div>
      {error ? (
        <p className="onside-pele-error" role="alert">
          {error}
        </p>
      ) : null}
      {mode === 'look' ? (
        <p className="onside-pele-note">
          Só olhando: botões que gravam ficam travados. Troque para “Pode agir”
          se precisar mexer como essa conta.
        </p>
      ) : null}
    </div>
  )
}
