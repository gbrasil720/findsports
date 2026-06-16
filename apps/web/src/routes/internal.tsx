import {
  Logout01Icon,
  Settings01Icon,
  UserMultipleIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter
} from '@tanstack/react-router'
import { Logo } from '@/components/landing/logo'
import { getUser } from '@/functions/get-user'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/internal')({
  head: () => ({
    meta: [
      { title: 'Admin Hall — FindSports' },
      {
        name: 'description',
        content: 'Painel administrativo FindSports.'
      }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }) => {
    if (!context.session) {
      throw redirect({ to: '/login' })
    }
    if (context.session.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  component: InternalHallPage
})

function InternalHallPage() {
  const router = useRouter()

  async function handleLogout() {
    await authClient.signOut()
    router.navigate({ to: '/login' })
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-body text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-black/5 border-b bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 md:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <Logo className="size-8" />
            <span className="font-bold font-heading text-lg tracking-tight">
              FindSports
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-orange px-2 py-1 font-bold text-[10px] text-white uppercase tracking-[0.2em]">
              Admin
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 font-medium text-sm text-zinc-600 transition-colors hover:border-black/20 hover:text-zinc-900"
            >
              <HugeiconsIcon icon={Logout01Icon} className="size-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-12 md:px-8">
        {/* Title */}
        <div>
          <h1 className="font-bold font-heading text-3xl tracking-tight">
            Admin Hall
          </h1>
          <p className="mt-1.5 text-muted-foreground text-sm">
            Escolha uma área para gerenciar.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 max-w-2xl">
          {/* Waitlist */}
          <Link
            to="/internal/waitlist"
            className="group flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-8 shadow-sm transition-all hover:border-brand-orange/40 hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-orange/10">
              <HugeiconsIcon
                icon={UserMultipleIcon}
                className="size-7 text-brand-orange"
              />
            </div>
            <div>
              <h2 className="font-bold font-heading text-xl tracking-tight group-hover:text-brand-orange transition-colors">
                Lista de Espera
              </h2>
              <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                Visualize e exporte os inscritos na lista de espera — torcedores
                e bares.
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-orange opacity-0 group-hover:opacity-100 transition-opacity">
              Acessar →
            </span>
          </Link>

          {/* Manage Users */}
          <Link
            to="/internal/manage-users"
            className="group flex flex-col gap-5 rounded-2xl border border-black/5 bg-white p-8 shadow-sm transition-all hover:border-brand-blue/40 hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="grid size-14 place-items-center rounded-2xl bg-brand-blue/10">
              <HugeiconsIcon
                icon={Settings01Icon}
                className="size-7 text-brand-blue"
              />
            </div>
            <div>
              <h2 className="font-bold font-heading text-xl tracking-tight group-hover:text-brand-blue transition-colors">
                Gerenciar Usuários
              </h2>
              <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                Impersone, bana, desbane e altere roles de usuários da
                plataforma.
              </p>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity">
              Acessar →
            </span>
          </Link>
        </div>
      </main>
    </div>
  )
}
