import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useId, useState } from 'react'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import { SupportSla } from '@/components/support/support-sla'
import { getUser } from '@/functions/get-user'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin_/support')({
  head: () => ({
    meta: [
      { title: 'Suporte do bar — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  beforeLoad: async () => {
    const session = await getUser()
    return { session }
  },
  loader: async ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
    if (context.session.user.role !== 'pub') throw redirect({ to: '/internal' })
  },
  component: PubSupportPage
})

const CATEGORY_LABELS = {
  account: 'Conta e acesso',
  billing: 'Cobrança',
  profile: 'Perfil do bar',
  events: 'Jogos e agenda',
  other: 'Outro'
} as const

const STATUS_LABELS = {
  open: 'Aberta',
  in_progress: 'Em atendimento',
  resolved: 'Resolvida'
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

function PubSupportPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const subjectId = useId()
  const categoryId = useId()
  const descriptionId = useId()
  const [subject, setSubject] = useState('')
  const [category, setCategory] =
    useState<keyof typeof CATEGORY_LABELS>('account')
  const [description, setDescription] = useState('')

  const requestsQuery = useQuery(trpc.support.listMine.queryOptions())
  const createRequest = useMutation(
    trpc.support.create.mutationOptions({
      onSuccess: async (request) => {
        setSubject('')
        setCategory('account')
        setDescription('')
        toast.success(
          request.notificationDelivered
            ? 'Solicitação enviada para a fila de suporte.'
            : 'Solicitação registrada. A notificação será revisada pela equipe.'
        )
        await queryClient.invalidateQueries({
          queryKey: trpc.support.listMine.queryKey()
        })
      },
      onError: (error) => toast.error(error.message)
    })
  )

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createRequest.mutate({
      subject: subject.trim(),
      category,
      description: description.trim()
    })
  }

  const requests = requestsQuery.data ?? []

  return (
    <AppShell variant="pub" userMeta="Suporte">
      <div className="mb-8">
        <p className="onside-kicker mb-2">Atendimento do bar</p>
        <h1 className="onside-display text-4xl md:text-5xl">Suporte</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--onside-muted)]">
          Abra uma solicitação com contexto. O plano e a prioridade são
          calculados no servidor e não podem ser escolhidos pelo formulário.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        <section
          className="onside-panel p-5 sm:p-6"
          aria-labelledby="support-form-title"
        >
          <h2 id="support-form-title" className="onside-display mb-5 text-2xl">
            Nova solicitação
          </h2>
          <form className="grid gap-4" onSubmit={submit}>
            <div>
              <label htmlFor={subjectId} className="onside-label">
                Assunto
              </label>
              <input
                id={subjectId}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={120}
                minLength={3}
                required
                className="onside-input"
                placeholder="Ex.: Não consigo atualizar meu plano"
              />
            </div>

            <div>
              <label htmlFor={categoryId} className="onside-label">
                Categoria
              </label>
              <select
                id={categoryId}
                value={category}
                onChange={(event) =>
                  setCategory(
                    event.target.value as keyof typeof CATEGORY_LABELS
                  )
                }
                className="onside-input"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={descriptionId} className="onside-label">
                Descrição
              </label>
              <textarea
                id={descriptionId}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={4000}
                minLength={10}
                rows={7}
                required
                className="onside-input resize-y py-3"
                placeholder="Conte o que aconteceu e o que você precisa."
              />
            </div>

            <button
              type="submit"
              disabled={createRequest.isPending}
              className="onside-btn onside-btn-acid min-h-11 justify-center disabled:opacity-40 sm:justify-start"
            >
              {createRequest.isPending ? (
                <Loader
                  size={16}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {createRequest.isPending ? 'Enviando…' : 'Enviar solicitação'}
            </button>
          </form>
        </section>

        <SupportSla />
      </div>

      <section className="mt-8" aria-labelledby="support-history-title">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="onside-kicker mb-1">Histórico do bar</p>
            <h2 id="support-history-title" className="onside-display text-2xl">
              Suas solicitações
            </h2>
          </div>
          <span className="font-mono text-[11px] text-[var(--onside-muted)]">
            {requests.length} registrada{requests.length === 1 ? '' : 's'}
          </span>
        </div>

        {requestsQuery.isLoading ? (
          <div
            className="onside-panel flex items-center gap-2 p-6 text-sm text-[var(--onside-muted)]"
            role="status"
          >
            <Loader
              size={16}
              color="currentColor"
              className="animate-spin"
              aria-hidden="true"
            />
            Carregando histórico…
          </div>
        ) : requestsQuery.isError ? (
          <div className="onside-callout onside-callout-danger" role="alert">
            <p className="text-sm">
              Não foi possível carregar suas solicitações.
            </p>
            <button
              type="button"
              onClick={() => requestsQuery.refetch()}
              className="onside-btn onside-btn-outline min-h-11 text-xs"
            >
              Tentar novamente
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="onside-panel p-6 text-sm text-[var(--onside-muted)]">
            Você ainda não abriu uma solicitação.
          </div>
        ) : (
          <ul className="grid gap-3">
            {requests.map((request) => (
              <li key={request.id} className="onside-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="onside-kicker text-[var(--onside-muted)]">
                      {CATEGORY_LABELS[
                        request.category as keyof typeof CATEGORY_LABELS
                      ] ?? request.category}
                    </p>
                    <h3 className="mt-1 font-bold text-lg">
                      {request.subject}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="onside-badge onside-badge-stone">
                      {PRIORITY_LABELS[request.priority]}
                    </span>
                    <span className="onside-badge onside-badge-ink">
                      {STATUS_LABELS[request.status]}
                    </span>
                  </div>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--onside-muted)]">
                  {request.description}
                </p>
                <p className="mt-4 font-mono text-[11px] text-[var(--onside-muted)]">
                  Aberta em {formatDate(request.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  )
}
