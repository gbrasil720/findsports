import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  formatDate,
  formatDateTime,
  initials
} from '@/components/houdini/format'
import { GrimorioRow } from '@/components/houdini/grimorio'
import { HatIcon, Icon } from '@/components/houdini/icons'
import { HoudiniShell } from '@/components/houdini/shell'
import { authClient } from '@/lib/auth-client'
import { appHref } from '@/lib/houdini-host'
import { type AppRole, roleLabel } from '@/lib/roles'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { FAN_HOME } from '@/utils/auth-guards'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/houdini/_app/pessoas_/$userId')({
  head: () => ({ meta: [{ title: 'Ficha — Houdini' }] }),
  component: FichaPage
})

type Ficha = inferRouterOutputs<AppRouter>['adminUsers']['ficha']

const CRUMBS = [{ label: 'Pessoas', to: '/houdini/pessoas' }] as const

function FichaPage() {
  const { env, admin } = Route.useRouteContext()
  const { userId } = Route.useParams()
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.adminUsers.ficha.queryOptions({ userId }),
    meta: { errorToast: false }
  })

  if (!query.data) {
    return (
      <HoudiniShell title="Ficha" crumbs={CRUMBS} env={env} user={admin}>
        <div className="hd-page">
          {query.isError ? (
            <div className="hd-card" role="alert" style={{ gap: 12 }}>
              <p style={{ margin: 0 }}>
                {query.error.data?.code === 'NOT_FOUND'
                  ? 'Essa pessoa não existe ou a conta foi apagada.'
                  : getUserFacingMessage(
                      query.error,
                      'Não foi possível abrir a ficha.'
                    )}
              </p>
              <Link
                to="/houdini/pessoas"
                className="hd-btn"
                style={{ alignSelf: 'flex-start' }}
              >
                Voltar para Pessoas
              </Link>
            </div>
          ) : (
            <div className="hd-skeleton" style={{ height: 320 }} />
          )}
        </div>
      </HoudiniShell>
    )
  }

  return (
    <HoudiniShell
      title={query.data.account.name}
      crumbs={CRUMBS}
      env={env}
      user={admin}
    >
      <FichaBody ficha={query.data} isSelf={userId === admin.id} />
    </HoudiniShell>
  )
}

function FichaBody({ ficha, isSelf }: { ficha: Ficha; isSelf: boolean }) {
  const { account, bar, sessions } = ficha
  const trpc = useTRPC()
  const [entering, setEntering] = useState(false)
  const grimorio = useQuery({
    ...trpc.grimorio.list.queryOptions({
      targetType: 'user',
      targetId: account.id,
      limit: 20
    }),
    meta: { errorToast: false }
  })

  async function entrarNaPele() {
    setEntering(true)
    const res = await authClient.admin.impersonateUser({ userId: account.id })
    if (res.error || !res.data) {
      setEntering(false)
      toast.error(
        getUserFacingMessage(res.error, 'Não foi possível entrar na pele.')
      )
      return
    }
    // Recarga inteira: o próximo pedido já leva o cookie da outra conta.
    window.location.href = appHref(
      account.role === 'pub' ? '/admin' : FAN_HOME,
      new URL(window.location.href)
    )
  }

  return (
    <div className="hd-page" style={{ gap: 24 }}>
      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 20,
          alignItems: 'flex-start',
          justifyContent: 'space-between'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            minWidth: 0
          }}
        >
          <span
            className="hd-avatar"
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              fontSize: 22,
              background: 'var(--hd-roxo-tint)'
            }}
          >
            {initials(account.name)}
          </span>
          <div
            style={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}
          >
            <h1 className="hd-h1" style={{ fontSize: 28 }}>
              {account.name}
            </h1>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                alignItems: 'center'
              }}
            >
              {account.banned ? (
                <span className="hd-pill" data-tone="bad">
                  sumiu
                </span>
              ) : (
                <span className="hd-pill" data-tone="ok">
                  presente
                </span>
              )}
              <span className="hd-pill" data-tone="roxo">
                {roleLabel(account.role as AppRole)}
              </span>
              {account.emailVerified ? null : (
                <span className="hd-pill" data-tone="warn">
                  e-mail não verificado
                </span>
              )}
              <span className="hd-small">
                desde {formatDate(account.createdAt)}
              </span>
            </div>
            <span
              className="hd-mono hd-small"
              style={{ overflowWrap: 'anywhere' }}
            >
              {account.email} · id {account.id}
            </span>
          </div>
        </div>
        {isSelf ? (
          <p className="hd-small" style={{ margin: 0 }}>
            É você. Não dá para entrar na própria pele.
          </p>
        ) : (
          <button
            type="button"
            className="hd-btn hd-btn-primary"
            onClick={entrarNaPele}
            disabled={entering || account.banned === true}
          >
            <HatIcon size={16} sparkle={false} />
            {entering ? 'Entrando…' : 'Entrar na pele'}
          </button>
        )}
      </section>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-start'
        }}
      >
        <div
          style={{
            flex: '3 1 480px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <section
            className="hd-card"
            aria-labelledby="conta-h"
            style={{ gap: 14 }}
          >
            <h2 id="conta-h" className="hd-h2">
              Conta
            </h2>
            <dl
              className="hd-dl"
              style={{
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'
              }}
            >
              <div>
                <dt>E-mail</dt>
                <dd>
                  {account.emailVerified ? 'verificado' : 'não verificado'}
                </dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{roleLabel(account.role as AppRole)}</dd>
              </div>
              <div>
                <dt>Criada em</dt>
                <dd>{formatDateTime(account.createdAt)}</dd>
              </div>
              <div>
                <dt>2FA</dt>
                <dd>{account.twoFactorEnabled ? 'ligado' : 'desligado'}</dd>
              </div>
              <div>
                <dt>Onboarding</dt>
                <dd>
                  {account.onboardingCompleted ? 'concluído' : 'pendente'}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {account.banned
                    ? account.banExpires
                      ? `sumiu até ${formatDate(account.banExpires)}`
                      : 'sumiu'
                    : 'presente'}
                </dd>
              </div>
              {account.banned ? (
                <div>
                  <dt>Motivo</dt>
                  <dd>{account.banReason || 'sem motivo'}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {bar ? (
            <section
              className="hd-card"
              aria-labelledby="bar-h"
              style={{ gap: 14 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12
                }}
              >
                <h2 id="bar-h" className="hd-h2">
                  Bar
                </h2>
                <Link
                  to="/houdini/bares"
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--hd-roxo-soft)',
                    textDecoration: 'none'
                  }}
                >
                  ver em Bares
                </Link>
              </div>
              <a
                href={appHref(
                  `/pub/${bar.id}`,
                  new URL(
                    typeof window === 'undefined'
                      ? 'http://localhost'
                      : window.location.href
                  )
                )}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  alignSelf: 'flex-start',
                  fontWeight: 600,
                  fontSize: 15
                }}
              >
                {bar.name}
                <Icon name="external" size={14} strokeWidth={1.8} />
              </a>
              <dl className="hd-dl">
                <div>
                  <dt>Plano vigente</dt>
                  <dd>
                    {bar.currentPlan ? PLAN_NAMES[bar.currentPlan] : 'nenhum'}
                  </dd>
                </div>
                <div>
                  <dt>Na busca</dt>
                  <dd>{bar.isActive ? 'no ar' : 'fora do ar'}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section
            className="hd-card"
            aria-labelledby="sessoes-h"
            style={{ gap: 14 }}
          >
            <h2 id="sessoes-h" className="hd-h2">
              Sessões
            </h2>
            <dl className="hd-dl">
              <div>
                <dt>Ativas</dt>
                <dd>{sessions.active}</dd>
              </div>
              <div>
                <dt>Último uso</dt>
                <dd>
                  {sessions.lastUsedAt
                    ? formatDateTime(sessions.lastUsedAt)
                    : '—'}
                </dd>
              </div>
            </dl>
            <p className="hd-small" style={{ margin: 0 }}>
              Sessões abertas por quem entrou na pele não contam.
            </p>
          </section>
        </div>

        <div
          style={{
            flex: '2 1 320px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}
        >
          <Emails account={account} />

          <section className="hd-card" aria-labelledby="grim-h">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 8
              }}
            >
              <h2 id="grim-h" className="hd-h2">
                Grimório
              </h2>
              <Link
                to="/houdini/grimorio"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--hd-roxo-soft)',
                  textDecoration: 'none'
                }}
              >
                ver tudo
              </Link>
            </div>
            {grimorio.data?.entries.length ? (
              grimorio.data.entries.map((entry) => (
                <GrimorioRow key={entry.id} entry={entry} compact />
              ))
            ) : (
              <p className="hd-small" style={{ margin: 0 }}>
                {grimorio.isLoading
                  ? 'Lendo…'
                  : grimorio.isError
                    ? 'Não foi possível ler o Grimório.'
                    : 'Nenhum truque com esta pessoa ainda.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function Emails({ account }: { account: Ficha['account'] }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [sent, setSent] = useState<string | null>(null)

  const onSuccess = (what: string) => async (res: { email: string }) => {
    setSent(
      `${what} pedido para ${res.email} às ${formatDateTime(new Date())}. O e-mail sai em seguida.`
    )
    await queryClient.invalidateQueries({
      queryKey: trpc.grimorio.list.queryKey()
    })
  }
  const onError = (fallback: string) => (error: unknown) =>
    toast.error(getUserFacingMessage(error, fallback))

  const verification = useMutation(
    trpc.adminUsers.resendVerification.mutationOptions({
      onSuccess: onSuccess('Link de verificação'),
      onError: onError('Não foi possível reenviar a verificação.')
    })
  )
  const reset = useMutation(
    trpc.adminUsers.sendPasswordReset.mutationOptions({
      onSuccess: onSuccess('Link de troca de senha'),
      onError: onError('Não foi possível mandar o link de senha.')
    })
  )
  const busy = verification.isPending || reset.isPending

  return (
    <section className="hd-card" aria-labelledby="emails-h" style={{ gap: 12 }}>
      <h2 id="emails-h" className="hd-h2">
        E-mails
      </h2>
      <p className="hd-small" style={{ margin: 0 }}>
        Saem para {account.email}, com os mesmos links que a pessoa pediria
        sozinha. O de confirmação vale por 1 hora; o de senha, por 30 minutos.
      </p>
      <button
        type="button"
        className="hd-btn"
        disabled={busy || account.emailVerified}
        onClick={() => verification.mutate({ userId: account.id })}
      >
        {verification.isPending
          ? 'Enviando…'
          : account.emailVerified
            ? 'E-mail já verificado'
            : 'Reenviar verificação de e-mail'}
      </button>
      <button
        type="button"
        className="hd-btn"
        disabled={busy}
        onClick={() => reset.mutate({ userId: account.id })}
      >
        {reset.isPending ? 'Enviando…' : 'Mandar link de troca de senha'}
      </button>
      <p
        role="status"
        className="hd-small"
        style={{ margin: 0, color: 'var(--hd-ok)' }}
      >
        {sent}
      </p>
    </section>
  )
}
