import { hasEventEnded } from '@findsports_oficial/db/event-window'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@findsports_oficial/ui/components/dropdown-menu'
import { PortalProvider } from '@findsports_oficial/ui/components/portal'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useRef, useState } from 'react'
import {
  useMyBar,
  useMyEvents,
  useMySubscription,
  useShowsGoing
} from '@/components/admin/admin-queries'
import { FeedbackDialog } from '@/components/app/feedback-dialog'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { getPlan } from '@/lib/plan-catalog'
import { BAR_RESERVATIONS_QUERY } from '@/lib/query-cache'
import { useTRPC } from '@/utils/trpc'
import { Icone, type IconeNome } from './icone'
import { Avatar, Badge, IconeBotao, propsBotao } from './pecas'

type ItemNav = {
  to:
    | '/admin'
    | '/admin/jogos'
    | '/admin/desempenho'
    | '/admin/quem-vai'
    | '/admin/meu-espaco'
    | '/admin/billing'
    | '/admin/configuracoes'
  rotulo: string
  icone: IconeNome
  contador?: number
}

const menuItem = 'w-full gap-2.5 rounded-none px-4 py-2.5 font-medium text-sm'

/** Jogos que ainda não acabaram e quantas pessoas vão aos jogos em aberto. */
function useContadores(showsGoing: boolean) {
  const trpc = useTRPC()
  const events = useMyEvents()
  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    ...BAR_RESERVATIONS_QUERY,
    enabled: showsGoing,
    meta: { errorToast: false }
  })
  const now = Date.now()
  return {
    jogos: events.data?.filter((e) => !hasEventEnded(e, now)).length,
    quemVai: going.data?.reduce((total, game) => total + game.people.length, 0)
  }
}

/**
 * Shell do painel do bar (telas 1j/1k; trilho de ícones até 1180 px, 1l/1m):
 * barra lateral com o bar, a navegação e o dono, e o conteúdo da rota ao
 * lado. A raiz é `.onside-app` para os portais (menus, diálogos) herdarem os
 * tokens, como no `ProductFrame`.
 */
export function PainelShell({ children }: { children: ReactNode }) {
  const portal = useRef<HTMLDivElement>(null)
  const session = useSession()
  const signOut = useSignOut()
  const { data: bar } = useMyBar()
  const { data: subscription } = useMySubscription()
  const showsGoing = useShowsGoing() === true
  const contadores = useContadores(showsGoing)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const donoBotao = useRef<HTMLButtonElement>(null)

  const nomeBar = bar?.name ?? ''
  const dono = session?.user?.name ?? ''
  const plano = subscription?.currentPlan
    ? getPlan(subscription.currentPlan).name
    : null

  const nav: ItemNav[] = [
    { to: '/admin', rotulo: 'Hoje', icone: 'sun' },
    {
      to: '/admin/jogos',
      rotulo: 'Jogos',
      icone: 'cal',
      contador: contadores.jogos
    },
    { to: '/admin/desempenho', rotulo: 'Desempenho', icone: 'chart' },
    ...(showsGoing
      ? [
          {
            to: '/admin/quem-vai',
            rotulo: 'Quem vai',
            icone: 'people',
            contador: contadores.quemVai
          } as const
        ]
      : []),
    { to: '/admin/meu-espaco', rotulo: 'Meu espaço', icone: 'beer' },
    { to: '/admin/billing', rotulo: 'Plano e cobrança', icone: 'card' },
    { to: '/admin/configuracoes', rotulo: 'Configurações', icone: 'gear' }
  ]

  return (
    <PortalProvider container={portal}>
      <div ref={portal} className="onside-app painel">
        <a className="onside-skip-link" href="#main-content">
          Ir para o conteúdo
        </a>
        <aside className="painel-lateral">
          <Link to="/admin" className="painel-logo" aria-label="Onside — Hoje">
            <img
              className="painel-logo-marca"
              src="/onside-wordmark-paper.png"
              alt=""
              width={79}
              height={24}
            />
            <img
              className="painel-logo-icone"
              src="/onside-icone-preto.png"
              alt=""
              width={34}
              height={34}
            />
          </Link>

          <div className="painel-bar">
            <Avatar nome={nomeBar || '…'} ativo tamanho={40} />
            <div className="painel-bar-texto">
              <b>{nomeBar || '…'}</b>
              {bar?.neighborhood ? <span>{bar.neighborhood}</span> : null}
            </div>
            {plano ? <Badge tipo="acid">{plano}</Badge> : null}
          </div>

          <nav className="painel-nav" aria-label="Painel do bar">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === '/admin' }}
                title={item.rotulo}
              >
                <Icone
                  nome={item.icone}
                  tamanho={20}
                  base={0.32}
                  acento="var(--painel-acc-nav)"
                />
                <span>{item.rotulo}</span>
                {item.contador ? (
                  <span className="painel-nav-n">{item.contador}</span>
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="painel-lateral-pe">
            <Link
              to="/admin/validate"
              title="Validar código"
              {...propsBotao({ variante: 'acid' })}
            >
              <IconeBotao nome="code" variante="acid" />
              <span>Validar código</span>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    ref={donoBotao}
                    type="button"
                    className="painel-dono"
                    aria-label={
                      dono ? `Menu da conta de ${dono}` : 'Menu da conta'
                    }
                  />
                }
              >
                <Avatar nome={dono || '…'} tamanho={34} />
                <span className="painel-dono-texto">
                  <b>{dono || '…'}</b>
                  <span>{session?.user?.email}</span>
                </span>
                <Icone
                  nome="down"
                  tamanho={14}
                  className="painel-muted"
                  acento="currentColor"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                className="onside-menu w-64 overflow-hidden p-0"
              >
                <DropdownMenuGroup className="py-1">
                  {session?.user?.role === 'admin' ? (
                    <DropdownMenuItem
                      className={menuItem}
                      render={<Link to="/houdini" />}
                    >
                      Houdini
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    className={menuItem}
                    render={<Link to="/" search={{ public: '1' }} />}
                  >
                    Ver a landing
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={menuItem}
                    onClick={() => setFeedbackOpen(true)}
                  >
                    Enviar feedback
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="my-0 bg-[var(--onside-line)]" />
                <DropdownMenuGroup className="py-1">
                  <DropdownMenuItem
                    onClick={() => void signOut()}
                    className={`onside-menu-destructive ${menuItem}`}
                  >
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        <main id="main-content" className="painel-main">
          {children}
        </main>

        <FeedbackDialog
          open={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          returnFocus={donoBotao}
        />
      </div>
    </PortalProvider>
  )
}
