import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { InternalShell } from '@/components/app/internal-shell'
import { getUser } from '@/functions/get-user'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/internal_/support')({
  head: () => ({
    meta: [
      { title: 'Fila de suporte — Onside Admin' },
      { name: 'description', content: 'Fila interna de suporte da Onside.' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
    if (context.session.user.role !== 'admin') throw redirect({ to: '/' })
  },
  component: InternalSupportPage
})

const STATUS_LABELS = {
  open: 'Aberta',
  in_progress: 'Em atendimento',
  resolved: 'Resolvida'
} as const

const CATEGORY_LABELS = {
  account: 'Conta e acesso',
  billing: 'Cobrança',
  profile: 'Perfil do bar',
  events: 'Jogos e agenda',
  other: 'Outro'
} as const

const PRIORITY_LABELS = {
  standard: 'Starter · padrão',
  priority: 'Pro · prioritária',
  highest: 'Elite · máxima'
} as const

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function InternalSupportPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const queueQuery = useQuery(
    trpc.support.listQueue.queryOptions({ limit: 100 })
  )
  const updateStatus = useMutation(
    trpc.support.updateStatus.mutationOptions({
      onSuccess: async () => {
        toast.success('Status atualizado.')
        await queryClient.invalidateQueries({
          queryKey: trpc.support.listQueue.queryKey({ limit: 100 })
        })
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => setUpdatingId(null)
    })
  )

  function changeStatus(id: string, status: keyof typeof STATUS_LABELS) {
    setUpdatingId(id)
    updateStatus.mutate({ id, status })
  }

  const requests = queueQuery.data ?? []
  const counts = {
    open: requests.filter((request) => request.status === 'open').length,
    inProgress: requests.filter((request) => request.status === 'in_progress')
      .length,
    resolved: requests.filter((request) => request.status === 'resolved').length
  }

  return (
    <InternalShell title="Fila de suporte">
      <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="onside-kicker mb-1">Operação</p>
          <h1 className="onside-display text-3xl md:text-4xl">
            Fila de suporte
          </h1>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-[var(--onside-muted)]">
          Elite, Pro e Starter são ordenados nessa sequência; dentro do mesmo
          plano, a solicitação mais antiga vem primeiro.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="onside-stat">
          <div className="onside-stat-value tabular-nums">{counts.open}</div>
          <div className="onside-stat-label">Abertas</div>
        </div>
        <div className="onside-stat">
          <div className="onside-stat-value tabular-nums">
            {counts.inProgress}
          </div>
          <div className="onside-stat-label">Em atendimento</div>
        </div>
        <div className="onside-stat">
          <div className="onside-stat-value tabular-nums">
            {counts.resolved}
          </div>
          <div className="onside-stat-label">Resolvidas</div>
        </div>
      </div>

      {queueQuery.isLoading ? (
        <div
          className="onside-panel flex items-center gap-2 p-8 text-sm text-[var(--onside-muted)]"
          role="status"
        >
          <Loader
            size={18}
            color="currentColor"
            className="animate-spin"
            aria-hidden="true"
          />
          Carregando fila…
        </div>
      ) : queueQuery.isError ? (
        <div className="onside-callout onside-callout-danger" role="alert">
          <p className="text-sm">
            Não foi possível carregar a fila de suporte.
          </p>
          <button
            type="button"
            onClick={() => queueQuery.refetch()}
            className="onside-btn onside-btn-outline min-h-11 text-xs"
          >
            Tentar novamente
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="onside-panel p-8 text-center text-sm text-[var(--onside-muted)]">
          Nenhuma solicitação na fila.
        </div>
      ) : (
        <ul className="grid gap-4" aria-label="Solicitações de suporte">
          {requests.map((request, index) => (
            <li key={request.id} className="onside-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="onside-kicker text-[var(--onside-muted)]">
                    #{index + 1} · {PRIORITY_LABELS[request.priority]}
                  </p>
                  <h2 className="mt-1 font-bold text-xl">{request.subject}</h2>
                  <p className="mt-1 break-all text-sm text-[var(--onside-muted)]">
                    {request.barName} · {request.barEmail}
                  </p>
                </div>
                <label className="grid min-w-48 gap-1 text-left">
                  <span className="onside-kicker text-[var(--onside-muted)]">
                    Status
                  </span>
                  <select
                    value={request.status}
                    disabled={updatingId === request.id}
                    onChange={(event) =>
                      changeStatus(
                        request.id,
                        event.target.value as keyof typeof STATUS_LABELS
                      )
                    }
                    aria-label={`Status de ${request.subject}`}
                    className="onside-input min-h-11 disabled:opacity-40"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 grid gap-4 border-[var(--onside-line)] border-t pt-4 text-sm sm:grid-cols-3">
                <div>
                  <p className="onside-kicker text-[var(--onside-muted)]">
                    Categoria
                  </p>
                  <p className="mt-1">
                    {CATEGORY_LABELS[
                      request.category as keyof typeof CATEGORY_LABELS
                    ] ?? request.category}
                  </p>
                </div>
                <div>
                  <p className="onside-kicker text-[var(--onside-muted)]">
                    Plano vigente
                  </p>
                  <p className="mt-1 capitalize">{request.plan}</p>
                </div>
                <div>
                  <p className="onside-kicker text-[var(--onside-muted)]">
                    Aberta em
                  </p>
                  <p className="mt-1">{formatDate(request.createdAt)}</p>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--onside-muted)]">
                {request.description}
              </p>
            </li>
          ))}
        </ul>
      )}
    </InternalShell>
  )
}
