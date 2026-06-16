import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@findsports_oficial/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@findsports_oficial/ui/components/dropdown-menu'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import {
  ArrowDownBigIcon,
  CogIcon,
  CreditCardIcon,
  Logout01Icon,
  UserIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Logo } from '@/components/landing/logo'
import { authClient } from '@/lib/auth-client'

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

  const handleLogout = () => {
    authClient.signOut({
      fetchOptions: { onSuccess: () => navigate({ to: '/' }) }
    })
  }

  const name = session?.user?.name ?? ''
  const initials = name
    ? name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  return (
    <div className="min-h-dvh bg-zinc-50 text-foreground">
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-black/5">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <Logo className="size-8" />
            <span className="font-heading text-lg font-bold tracking-tight">
              FindSports
            </span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className={`flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full bg-white ring-1 ${accentRing} hover:ring-2 transition-all`}
                />
              }
            >
              {isPending ? (
                <Skeleton className="size-8 rounded-full" />
              ) : (
                <Avatar className="size-8 shrink-0">
                  {session?.user?.image && (
                    <AvatarImage
                      src={session.user.image}
                      alt={name || 'Avatar'}
                    />
                  )}
                  <AvatarFallback
                    className={`rounded-full ${accent} text-white font-heading font-bold text-sm`}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="hidden sm:block leading-tight text-left">
                <div className="text-xs font-bold truncate max-w-[120px]">
                  {name || '...'}
                </div>
                <div
                  className={`text-[10px] uppercase tracking-wider ${accentText} truncate max-w-[120px]`}
                >
                  {userMeta ?? (isFan ? 'Torcedor' : 'Bar')}
                </div>
              </div>
              <HugeiconsIcon
                icon={ArrowDownBigIcon}
                size={14}
                color="currentColor"
                strokeWidth={1.5}
                className="text-zinc-400 transition-transform duration-150"
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="w-64 rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden p-0 bg-white"
            >
              <div className="px-4 py-3 border-b border-zinc-100">
                <div className="font-bold text-sm text-zinc-900 truncate">
                  {name}
                </div>
                <div className="text-xs text-zinc-500 truncate">
                  {session?.user?.email}
                </div>
                {userMeta && (
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider mt-0.5 ${accentText}`}
                  >
                    {userMeta}
                  </div>
                )}
              </div>

              <div className="py-1">
                {isFan ? (
                  // Fan — link para perfil/configurações
                  <DropdownMenuItem className="rounded-none px-0 py-0 focus:bg-zinc-50">
                    <Link
                      to="/dashboard/profile"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 w-full"
                    >
                      <HugeiconsIcon
                        icon={UserIcon}
                        size={16}
                        color="currentColor"
                        strokeWidth={1.5}
                        className="text-zinc-400"
                      />
                      Perfil e configurações
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  // Bar — links para painel e billing
                  <>
                    <DropdownMenuItem className="rounded-none px-0 py-0 focus:bg-zinc-50">
                      <Link
                        to="/admin"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 w-full"
                      >
                        <HugeiconsIcon
                          icon={CogIcon}
                          size={16}
                          color="currentColor"
                          strokeWidth={1.5}
                          className="text-zinc-400"
                        />
                        Painel do bar
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-none px-0 py-0 focus:bg-zinc-50">
                      <Link
                        to="/admin/billing"
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-zinc-700 w-full"
                      >
                        <HugeiconsIcon
                          icon={CreditCardIcon}
                          size={16}
                          color="currentColor"
                          strokeWidth={1.5}
                          className="text-zinc-400"
                        />
                        Assinatura e billing
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
              </div>

              <DropdownMenuSeparator className="my-0 bg-zinc-100" />

              <div className="py-1">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleLogout}
                  className="rounded-none px-4 py-2.5 text-sm font-medium flex items-center gap-2.5 focus:bg-red-50"
                >
                  <HugeiconsIcon
                    icon={Logout01Icon}
                    size={16}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  Sair
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
