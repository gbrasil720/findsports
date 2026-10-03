import { Skeleton } from '@findsports_oficial/ui/components/skeleton'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { QueryError } from '@/components/admin/query-error'
import { InternalShell } from '@/components/app/internal-shell'
import { getUser } from '@/functions/get-user'
import { isRetryableError } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/internal_/attendance')({
  head: () => ({
    meta: [
      { title: 'Comparecimento — Onside Admin' },
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
  component: AttendancePage
})

const READINGS = [
  ['bothRegistered', 'Presença confiável', 'bar registrou, torcedor foi'],
  ['unregistered', 'Bar não registra', 'torcedor foi, bar não registrou'],
  [
    'burned',
    'Código queimado ou resposta ruidosa',
    'bar registrou, torcedor não foi'
  ],
  ['noShow', 'No-show', 'nenhum dos dois']
] as const

/**
 * Alerta interno do WEB-128: cruzamento das duas fontes de comparecimento em
 * reservas confirmadas. Registra e não julga — não há sanção nem aviso ao
 * bar, e nada aqui identifica quem respondeu.
 */
function AttendancePage() {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.attendance.unregisteredAlerts.queryOptions(),
    meta: { errorToast: false }
  })

  return (
    <InternalShell title="Comparecimento">
      <p className="mb-6 max-w-2xl text-sm text-[var(--onside-muted)]">
        Bares em que o torcedor disse que foi e o bar não registrou o código em
        vários jogos. Só entram jogos com a janela de validação encerrada. As
        duas fontes são declaradas: o cruzamento aponta padrão, não prova.
      </p>

      {query.isLoading ? (
        <div role="status" aria-busy="true" className="space-y-3">
          <span className="sr-only">Carregando alertas…</span>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : query.isError ? (
        <QueryError
          message="Não foi possível carregar os alertas."
          onRetry={() => void query.refetch()}
          retryable={isRetryableError(query.error)}
        />
      ) : query.data?.length ? (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {query.data.map((alert) => (
            <li key={alert.barId} className="onside-panel p-5">
              <h2 className="font-bold text-lg">{alert.barName}</h2>
              <p className="text-[var(--onside-muted)] text-sm">
                {alert.unregisteredGames} jogos com “foi, mas não registrou”
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                {READINGS.map(([key, label, detail]) => (
                  <div key={key} className="flex justify-between gap-3">
                    <dt>
                      {label}{' '}
                      <span className="text-[var(--onside-muted)]">
                        ({detail})
                      </span>
                    </dt>
                    <dd className="font-semibold tabular-nums">{alert[key]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <div className="onside-panel py-16 text-center text-sm text-[var(--onside-muted)]">
          Nenhum bar no alerta.
        </div>
      )}
    </InternalShell>
  )
}
