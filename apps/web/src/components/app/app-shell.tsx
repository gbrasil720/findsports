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
import { Link } from '@tanstack/react-router'
import { type ReactNode, useRef, useState } from 'react'
import ArrowUpRight from 'reicon-react/icons/ArrowUpRight'
import Chat from 'reicon-react/icons/Chat'
import ChevronDown from 'reicon-react/icons/ChevronDown'
import CreditCard from 'reicon-react/icons/CreditCard'
import Logout from 'reicon-react/icons/Logout'
import Settings from 'reicon-react/icons/Settings'
import Ticket from 'reicon-react/icons/Ticket'
import User from 'reicon-react/icons/User'
import { OnsideBrand } from '@/components/brand/onside-brand'
import type { ShellVariant } from '@/domain/viewer'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { FeedbackDialog } from './feedback-dialog'
import { ProductFrame } from './product-frame'

type Props = {
  variant: ShellVariant
  userMeta?: string
  children: ReactNode
}

const accountMenuItemClass =
  'w-full gap-2.5 rounded-none px-4 py-2.5 font-medium text-sm'

export function AppShell({ variant, userMeta, children }: Props) {
  const signOut = useSignOut()
  const session = useSession()
  const hasUser = Boolean(session?.user)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const accountMenuButton = useRef<HTMLButtonElement>(null)
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

  const menuLabel = name ? `Menu da conta de ${name}` : 'Menu da conta'

  const header = (
    <>
      <Link
        to={
          variant === 'fan' ? '/dashboard' : variant === 'pub' ? '/admin' : '/'
        }
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

      {variant === 'public' && !hasUser ? (
        <div className="ml-auto flex items-center gap-2">
          <Link to="/login" className="onside-btn onside-btn-ghost">
            Entrar
          </Link>
          <Link to="/signup" className="onside-btn onside-btn-acid">
            Criar conta
          </Link>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                ref={accountMenuButton}
                type="button"
                aria-label={menuLabel}
                className="relative ml-auto flex min-h-11 items-center gap-2.5 border border-[var(--onside-ink)] bg-[var(--onside-paper)] py-1.5 pr-3 pl-2"
              />
            }
          >
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
            <div className="hidden min-w-0 leading-tight text-left sm:block">
              {/* O chip do cabeçalho é estreito de propósito; o nome inteiro
                  aparece no cabeçalho do menu, que tem largura para ele. */}
              <div
                className="max-w-[140px] truncate font-bold text-xs"
                title={name || undefined}
              >
                {name || '…'}
              </div>
              <div className="max-w-[140px] truncate font-[family-name:var(--onside-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--onside-muted)]">
                {userMeta ?? accountLabel}
              </div>
            </div>
            <ChevronDown
              size={14}
              className="text-[var(--onside-muted)]"
              aria-hidden="true"
            />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            className="onside-menu w-64 overflow-hidden p-0"
          >
            <div className="border-[var(--onside-line)] border-b px-4 py-3">
              <div className="break-words font-bold text-[var(--onside-ink)] text-sm">
                {name || '…'}
              </div>
              <div className="break-all text-[var(--onside-muted)] text-xs">
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
                  className={accountMenuItemClass}
                  render={<Link to="/dashboard/profile" />}
                >
                  <User
                    size={16}
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Perfil e configurações
                </DropdownMenuItem>
              ) : null}

              {variant === 'fan' ? (
                <DropdownMenuItem
                  className={accountMenuItemClass}
                  render={<Link to="/dashboard/games" />}
                >
                  <Ticket
                    size={16}
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Meus jogos
                </DropdownMenuItem>
              ) : null}

              {variant === 'pub' ? (
                <>
                  <DropdownMenuItem
                    className={accountMenuItemClass}
                    render={<Link to="/admin" />}
                  >
                    <Settings
                      size={16}
                      className="text-[var(--onside-muted)]"
                      aria-hidden="true"
                    />
                    Painel do bar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={accountMenuItemClass}
                    render={<Link to="/admin/validate" />}
                  >
                    <Ticket
                      size={16}
                      className="text-[var(--onside-muted)]"
                      aria-hidden="true"
                    />
                    Validar código
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={accountMenuItemClass}
                    render={<Link to="/admin/billing" />}
                  >
                    <CreditCard
                      size={16}
                      className="text-[var(--onside-muted)]"
                      aria-hidden="true"
                    />
                    Assinatura e pagamentos
                  </DropdownMenuItem>
                </>
              ) : null}

              {variant === 'public' && hasUser ? (
                <DropdownMenuItem
                  className={accountMenuItemClass}
                  render={<Link to="/dashboard" />}
                >
                  <User
                    size={16}
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Ir para o app
                </DropdownMenuItem>
              ) : null}

              {hasUser ? (
                <DropdownMenuItem
                  className={accountMenuItemClass}
                  render={<Link to="/" search={{ public: '1' }} />}
                >
                  <ArrowUpRight
                    size={16}
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Ver a landing
                </DropdownMenuItem>
              ) : null}

              {hasUser ? (
                <DropdownMenuItem
                  onClick={() => setFeedbackOpen(true)}
                  className={accountMenuItemClass}
                >
                  <Chat
                    size={16}
                    className="text-[var(--onside-muted)]"
                    aria-hidden="true"
                  />
                  Enviar feedback
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>

            {hasUser ? (
              <>
                <DropdownMenuSeparator className="my-0 bg-[var(--onside-line)]" />
                <DropdownMenuGroup className="py-1">
                  <DropdownMenuItem
                    onClick={() => void signOut()}
                    className="onside-menu-destructive w-full gap-2.5 rounded-none px-4 py-2.5 font-medium text-sm"
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

  return (
    <ProductFrame header={header}>
      {children}
      {/* O item do menu some quando o menu fecha: o foco volta ao botão da conta. */}
      <FeedbackDialog
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        returnFocus={accountMenuButton}
      />
    </ProductFrame>
  )
}
