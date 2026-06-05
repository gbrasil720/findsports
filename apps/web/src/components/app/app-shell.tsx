import { Link, useNavigate } from '@tanstack/react-router'
import { ChevronDown, LogOut, Settings } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/landing/logo'

type Props = {
  role: 'fan' | 'pub'
  userMeta?: string
  children: ReactNode
}

export function AppShell({ role, userMeta, children }: Props) {
  const navigate = useNavigate()
  const isFan = role === 'fan'
  const accent = isFan ? 'bg-brand-orange' : 'bg-brand-blue'
  const accentText = isFan ? 'text-brand-orange' : 'text-brand-blue'
  const accentRing = isFan ? 'ring-brand-orange/30' : 'ring-brand-blue/30'

  const { data: session, isPending } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = () => {
    authClient.signOut({
      fetchOptions: { onSuccess: () => navigate({ to: '/' }) }
    })
  }

  const name = session?.user?.name ?? ''
  const initials = name
    ? name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className="min-h-screen bg-zinc-50 text-foreground">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-black/5">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <Logo className="size-8" />
            <span className="font-heading text-lg font-bold tracking-tight">
              FindSports
            </span>
          </Link>

          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className={`flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-white ring-1 ${accentRing} hover:ring-2 transition-all`}
            >
              {isPending ? (
                <div className="size-8 rounded-full bg-zinc-100 animate-pulse" />
              ) : (
                <div
                  className={`size-8 rounded-full ${accent} text-white grid place-items-center font-heading font-bold text-sm shrink-0`}
                >
                  {initials}
                </div>
              )}
              <div className="hidden sm:block leading-tight text-left">
                <div className="text-xs font-bold truncate max-w-[120px]">
                  {name || '...'}
                </div>
                <div className={`text-[10px] uppercase tracking-wider ${accentText} truncate max-w-[120px]`}>
                  {userMeta ?? (isFan ? 'Torcedor' : 'Bar')}
                </div>
              </div>
              <ChevronDown
                className={`size-3.5 text-zinc-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
              />
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-zinc-100">
                  <div className="font-bold text-sm text-zinc-900 truncate">{name}</div>
                  <div className="text-xs text-zinc-500 truncate">{session?.user?.email}</div>
                  {userMeta && (
                    <div className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${accentText}`}>
                      {userMeta}
                    </div>
                  )}
                </div>

                <div className="py-1">
                  <Link
                    to="/admin"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    <Settings className="size-4 text-zinc-400" />
                    Configurações
                  </Link>
                </div>

                <div className="border-t border-zinc-100 py-1">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="size-4" />
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
