import { Link } from '@tanstack/react-router'
import { authClient } from '@/lib/auth-client'
import { Logo } from './logo'

export function Nav() {
  const { data: session } = authClient.useSession()
  const isAdmin = session?.user?.role === 'admin'

  return (
    <nav className="sticky top-0 z-40 border-black/5 border-b bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo className="size-9" />
          <span className="font-bold font-heading text-xl tracking-tight">
            FindSports
          </span>
        </a>
        <div className="hidden items-center gap-8 font-semibold text-sm uppercase tracking-wider md:flex">
          <a
            href="#torcedores"
            className="transition-colors hover:text-brand-orange"
          >
            Para Torcedores
          </a>
          <a href="#bares" className="transition-colors hover:text-brand-blue">
            Para Bares
          </a>
          {isAdmin && (
            <Link
              to="/admin/waitlist"
              className="rounded-full bg-brand-orange px-5 py-2.5 text-white normal-case tracking-normal transition-colors hover:bg-brand-orange/80"
            >
              Admin
            </Link>
          )}
          <Link
            to="/login"
            className="normal-case tracking-normal text-zinc-600 transition-colors hover:text-black"
          >
            Entrar
          </Link>
          <Link
            to="/signup"
            className="rounded-full bg-black px-5 py-2.5 text-white normal-case tracking-normal transition-colors hover:bg-brand-orange"
          >
            Criar conta
          </Link>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          {isAdmin && (
            <Link
              to="/admin/waitlist"
              className="rounded-full bg-brand-orange px-4 py-3 font-bold text-white text-xs transition-colors hover:bg-brand-orange/80 min-h-[44px] inline-flex items-center"
            >
              Admin
            </Link>
          )}
          <Link
            to="/login"
            className="rounded-full border border-zinc-200 px-4 py-3 font-bold text-black text-xs min-h-[44px] inline-flex items-center"
          >
            Entrar
          </Link>
          <Link
            to="/signup"
            className="rounded-full bg-black px-4 py-3 font-bold text-white text-xs min-h-[44px] inline-flex items-center"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </nav>
  )
}
