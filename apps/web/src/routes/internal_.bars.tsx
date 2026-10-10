import type { SubscriptionStanding } from '@findsports_oficial/api/lib/current-plan'
import { PLAN_NAMES } from '@findsports_oficial/api/lib/plan-limits'
import { Badge } from '@findsports_oficial/ui/components/badge'
import { Input } from '@findsports_oficial/ui/components/input'
import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@findsports_oficial/ui/components/table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import Search from 'reicon-react/icons/Search'
import { InternalShell } from '@/components/app/internal-shell'
import { getUser } from '@/functions/get-user'
import { LAPSED_COPY } from '@/lib/lapsed-plan'
import { getUserFacingMessage, isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/internal_/bars')({
  head: () => ({
    meta: [
      { title: 'Bares e assinaturas — Onside Admin' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }) => {
    // Sem sessão, o guard da raiz (applyAuthGuards) já mandou para o /login.
    if (context.session?.user.role !== 'admin') {
      throw redirect({ to: '/' })
    }
  },
  component: BarsPage
})

const STANDING_LABELS: Record<SubscriptionStanding, string> = {
  current: 'Em dia',
  past_due: LAPSED_COPY.past_due.label,
  trial_ended: LAPSED_COPY.trial_ended.label,
  ended: 'Encerrada'
}

// As colunas são `timestamp` sem fuso, em UTC; o suporte lê no horário de
// Brasília, que é o do dono do bar.
function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })
}

function formatDateTime(date: Date | string) {
  return new Date(date).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  })
}

const HEAD_CLASS =
  'font-bold text-muted-foreground text-xs uppercase tracking-wider'
const BADGE_CLASS =
  'rounded-none font-bold text-[10px] uppercase tracking-wider'
const COLUMNS = [
  'Bar',
  'Perfil',
  'Plano efetivo',
  'Assinatura',
  'Stripe',
  'Jogos futuros'
]

/**
 * WEB-354: plano e situação de um bar sem ir ao banco. Só leitura — estender
 * trial e despublicar ficam para depois.
 */
function BarsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const trpc = useTRPC()
  const { data, isLoading, isError, isFetching, error, refetch } = useQuery({
    ...trpc.adminBars.list.queryOptions({
      search: search.trim() || undefined,
      page
    }),
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })

  const bars = data?.bars ?? []
  const matched = data?.matched ?? 0
  const lastPage = Math.max(1, Math.ceil(matched / (data?.pageSize ?? 1)))

  return (
    <InternalShell title="Bares e assinaturas">
      <div className="space-y-6">
        <p className="max-w-2xl text-muted-foreground text-sm">
          Plano, situação e assinatura de cada bar. Só leitura: “plano efetivo”
          é o que o app aplica agora; “busca” é a cópia em <code>bar.plan</code>
          , que ordena a busca e pode atrasar até um dia.
        </p>

        <div className="rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)] p-4">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--onside-muted)]" />
            <Input
              aria-label="Buscar bar"
              placeholder="Buscar por nome do bar, e-mail do dono ou id..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="rounded-none border-none bg-[var(--onside-paper)] pl-10 focus:ring-2 focus:ring-black/10"
            />
          </div>
        </div>

        <div
          className="overflow-hidden rounded-none border border-[var(--onside-line)] bg-[var(--onside-paper)]"
          aria-busy={isFetching || undefined}
          aria-live={isLoading ? 'polite' : undefined}
        >
          {isLoading ? (
            <span className="sr-only">Carregando bares…</span>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--onside-line)] border-b hover:bg-transparent">
                  {COLUMNS.map((column) => (
                    <TableHead key={column} className={HEAD_CLASS}>
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  ['loading-1', 'loading-2', 'loading-3'].map((key) => (
                    <TableRow
                      key={key}
                      className="border-[var(--onside-line)] border-b"
                      aria-hidden="true"
                    >
                      {COLUMNS.map((column) => (
                        <TableCell key={column}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="py-12 text-center text-sm"
                    >
                      <div
                        className="flex flex-col items-center gap-2 text-[var(--onside-live-text)]"
                        role="alert"
                      >
                        <p>
                          {getUserFacingMessage(
                            error,
                            'Não foi possível carregar os bares.'
                          )}
                        </p>
                        {isRetryableError(error) ? (
                          <button
                            type="button"
                            disabled={isFetching}
                            onClick={() => void refetch()}
                            className="font-bold underline underline-offset-2"
                          >
                            Tentar novamente
                          </button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : bars.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={COLUMNS.length}
                      className="py-12 text-center text-muted-foreground"
                    >
                      Nenhum bar encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  bars.map((b) => (
                    <TableRow
                      key={b.id}
                      className="border-[var(--onside-line)] border-b align-top"
                    >
                      <TableCell>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-muted-foreground text-sm">
                          {b.ownerEmail}
                        </div>
                        <div className="font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)]">
                          {b.id}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`${BADGE_CLASS} ${
                            b.isActive
                              ? 'onside-badge onside-badge-acid'
                              : 'onside-badge onside-badge-stone'
                          }`}
                        >
                          {b.isActive ? 'No ar' : 'Fora do ar'}
                        </Badge>
                        <div className="mt-1 text-muted-foreground text-xs">
                          Cadastro em {formatDate(b.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {b.currentPlan
                            ? PLAN_NAMES[b.currentPlan]
                            : 'Sem plano vigente'}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {b.standing
                            ? STANDING_LABELS[b.standing]
                            : 'Sem assinatura'}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Busca: {PLAN_NAMES[b.barPlan]}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.subscription ? (
                          <>
                            <div>
                              {PLAN_NAMES[b.subscription.plan]} ·{' '}
                              <span className="font-[family-name:var(--onside-mono)] text-xs">
                                {b.subscription.status}
                              </span>
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {b.subscription.currentPeriodEnd
                                ? `Período até ${formatDateTime(b.subscription.currentPeriodEnd)}`
                                : 'Sem fim de período'}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {b.subscription?.externalSubscriptionId ? (
                          <>
                            {b.stripeUrl ? (
                              <a
                                href={b.stripeUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-[family-name:var(--onside-mono)] text-xs underline underline-offset-2"
                              >
                                {b.subscription.externalSubscriptionId}
                              </a>
                            ) : (
                              <span className="font-[family-name:var(--onside-mono)] text-xs">
                                {b.subscription.provider}:{' '}
                                {b.subscription.externalSubscriptionId}
                              </span>
                            )}
                            {b.cancelAt ? (
                              <div className="text-[var(--onside-live-text)] text-xs">
                                Cancela em {formatDateTime(b.cancelAt)}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Sem provedor
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {b.upcomingGames}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="border-[var(--onside-line)] border-t px-4 py-3 text-muted-foreground text-xs">
            {isFetching
              ? 'Atualizando bares...'
              : `Exibindo ${bars.length} de ${matched} bares`}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1 || isFetching}
            className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
          >
            Página anterior
          </button>
          <span className="font-[family-name:var(--onside-mono)] text-[11px] text-[var(--onside-muted)]">
            Página {page} de {lastPage}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= lastPage || isFetching}
            className="onside-btn onside-btn-outline min-h-11 px-3 text-xs disabled:opacity-40"
          >
            Próxima página
          </button>
        </div>
      </div>
    </InternalShell>
  )
}
