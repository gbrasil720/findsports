import {
  Avatar,
  AvatarFallback,
  AvatarImage
} from '@findsports_oficial/ui/components/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@findsports_oficial/ui/components/dropdown-menu'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import ChevronDown from 'reicon-react/icons/ChevronDown'
import CreditCard from 'reicon-react/icons/CreditCard'
import Logout from 'reicon-react/icons/Logout'
import Settings from 'reicon-react/icons/Settings'
import User from 'reicon-react/icons/User'
import { OnsideBrand } from '@/components/brand/onside-brand'
import type { ShellVariant } from '@/domain/viewer'
import { useSignOut } from '@/hooks/use-sign-out'
import { authClient } from '@/lib/auth-client'
import { ProductFrame } from './product-frame'

type Props = {
  variant: ShellVariant
  userMeta?: string
  children: ReactNode
}

export function AppShell({ variant, userMeta, children }: Props) {
  const signOut = useSignOut()
  const { data: session, isPending } = authClient.useSession()
  const hasUser = Boolean(session?.user)
  const accountLabel =
    variant === 'fan' ? 'Torcedor' : variant === 'pub' ? 'Bar' : 'Conta'

  const name = session?.user?.name ?? ''
  const initials = name
    ? name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '…'

  const menuLabel = name
    ? `Menu da conta de ${name}`
    : isPending
      ? 'Carregando conta'
      : 'Menu da conta'

  const header = (
    <>
      <Link
        to="/"
        className="onside-brand-link shrink-0"
        aria-label="Onside — página inicial"
      >
        <OnsideBrand />
      </Link>

      {variant === 'pub' && (
        <p className="onside-kicker hidden min-w-0 truncate md:block">
          Onside para bares
        </p>
      )}

      {variant === 'public' && !hasUser && !isPending ? (
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/login"
            className="onside-btn onside-btn-ghost min-h-11 px-3 text-xs"
          >
            Entrar
          </Link>
          <Link
            to="/signup"
            className="onside-btn onside-btn-acid min-h-11 px-3 text-xs"
          >
            Criar conta
          </Link>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={menuLabel}
                className="ml-auto flex min-h-11 items-center gap-2.5 border border-[var(--onside-ink)] bg-[var(--onside-paper)] py-1.5 pr-3 pl-2 transition-[transform,box-shadow] duration-150 hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0_var(--onside-ink)]"
              />
            }
          >
            {isPending ? (
              <Skeleton className="size-8 rounded-none" />
            ) : (
              <Avatar className="size-8 shrink-0 rounded-none">
                {session?.user?.image && (
                  <AvatarImage
                    src={session.user.image}
                    alt=""
                    className="rounded-none"
                  />
                )}
                <AvatarFallback className="rounded-none bg-[var(--onside-ink)] font-bold text-[var(--onside-paper)] text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="hidden min-w-0 leading-tight text-left sm:block">
              <div className="max-w-[140px] truncate font-bold text-xs">
                {name || '…'}
              </div>
              <div className="max-w-[140px] truncate font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
                {userMeta ?? accountLabel}
              </div>
            </div>
            <ChevronDown
              size={14}
              color="currentColor"
              className="text-[var(--onside-muted)]"
              aria-hidden="true"
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="onside-menu w-64 overflow-hidden p-0"
          >
            <div className="border-[var(--onside-line)] border-b px-4 py-3">
              <div className="truncate font-bold text-[var(--onside-ink)] text-sm">
                {name || '…'}
              </div>
              <div className="truncate text-[var(--onside-muted)] text-xs">
                {session?.user?.email}
              </div>
              {userMeta && (
                <div className="mt-1 font-[family-name:var(--onside-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--onside-muted)]">
                  {userMeta}
                </div>
              )}
            </div>

            <DropdownMenuGroup className="py-1">
              {variant === 'fan' ? (
                <DropdownMenuItem
                  className="rounded-none px-0 py-0 focus:bg-[var(--onside-stone)]"
                  render={
                    <Link
                      to="/dashboard/profile"
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 font-medium text-[var(--onside-ink)] text-sm"
                    />
                  }
                >
                  <User
                    size={16}
                    color="currentColor"
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Perfil e configurações
                </DropdownMenuItem>
              ) : null}

              {variant === 'pub' ? (
                <>
                  <DropdownMenuItem
                    className="rounded-none px-0 py-0 focus:bg-[var(--onside-stone)]"
                    render={
                      <Link
                        to="/admin"
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 font-medium text-[var(--onside-ink)] text-sm"
                      />
                    }
                  >
                    <Settings
                      size={16}
                      color="currentColor"
                      className="text-[var(--onside-muted)]"
                      aria-hidden="true"
                    />
                    Painel do bar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-none px-0 py-0 focus:bg-[var(--onside-stone)]"
                    render={
                      <Link
                        to="/admin/billing"
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 font-medium text-[var(--onside-ink)] text-sm"
                      />
                    }
                  >
                    <CreditCard
                      size={16}
                      color="currentColor"
                      className="text-[var(--onside-muted)]"
                      aria-hidden="true"
                    />
                    Assinatura e pagamentos
                  </DropdownMenuItem>
                </>
              ) : null}

              {variant === 'public' && hasUser ? (
                <DropdownMenuItem
                  className="rounded-none px-0 py-0 focus:bg-[var(--onside-stone)]"
                  render={
                    <Link
                      to="/dashboard"
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 font-medium text-[var(--onside-ink)] text-sm"
                    />
                  }
                >
                  <User
                    size={16}
                    color="currentColor"
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Ir para o app
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>

            {hasUser ? (
              <>
                <DropdownMenuSeparator className="my-0 bg-[var(--onside-line)]" />
                <DropdownMenuGroup className="py-1">
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => void signOut()}
                    className="flex items-center gap-2.5 rounded-none px-4 py-2.5 font-medium text-sm focus:bg-[color-mix(in_srgb,var(--onside-live)_10%,var(--onside-paper))]"
                  >
                    <Logout size={16} color="currentColor" aria-hidden="true" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )

  return <ProductFrame header={header}>{children}</ProductFrame>
}
