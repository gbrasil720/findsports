import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import { CodeValidation } from '@/components/admin/code-validation'
import { useMinuteNow } from '@/components/app/minute-tick'
import { useTRPC, useTRPCClient } from '@/utils/trpc'

export const Route = createFileRoute('/admin/validate')({
  // O QR do código no app do torcedor abre aqui com `?code=`.
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search.code === 'string' ? { code: search.code } : {},
  head: () => ({
    meta: [
      { title: 'Validar código — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: ValidatePage
})

function ValidatePage() {
  const trpc = useTRPC()
  const now = useMinuteNow()
  const { code } = Route.useSearch()

  // A tela desenha o próprio erro, com botão de tentar de novo.
  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })

  // Reserva em aberto mantém a validação de quem perdeu o Elite (WEB-341),
  // até a janela de validação fechar.
  const openQuery = useQuery({
    ...trpc.barReservations.hasValidatable.queryOptions(),
    meta: { errorToast: false }
  })
  const elite = subscriptionQuery.data?.currentPlan === 'elite'
  // Cliente direto, sem `useMutation`: o painel já guarda pendência e erro, e
  // repetir é decisão de quem está no balcão, nunca retry automático.
  const { reservationValidation } = useTRPCClient()

  return (
    <div className="painel-legado">
      <div className="mb-8">
        <Link to="/admin" className="onside-btn onside-btn-ghost -ml-3 mb-3">
          <ArrowLeft size={13} color="currentColor" aria-hidden="true" />
          Painel do bar
        </Link>
        <h1 className="onside-display text-3xl md:text-4xl">Validar código</h1>
        <p className="mt-2 text-[var(--onside-muted)] text-sm">
          Valide o código de quem marcou “Vou assistir aqui” e libere a oferta
          da casa.
        </p>
      </div>

      <CodeValidation
        access={
          subscriptionQuery.isLoading || (!elite && openQuery.isLoading)
            ? { status: 'loading' }
            : subscriptionQuery.isError || (!elite && openQuery.isError)
              ? {
                  status: 'error',
                  retry: () => {
                    void subscriptionQuery.refetch()
                    void openQuery.refetch()
                  }
                }
              : {
                  status: 'ready',
                  eligible: elite || openQuery.data === true,
                  elite
                }
        }
        now={now}
        lookup={reservationValidation.lookup.mutate}
        registerArrival={reservationValidation.registerArrival.mutate}
        undoArrival={reservationValidation.undoArrival.mutate}
        initialCode={code}
      />
    </div>
  )
}
