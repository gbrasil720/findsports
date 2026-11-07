import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CodeValidation } from '@/components/admin/code-validation'
import { useMinuteNow } from '@/components/app/minute-tick'
import { PainelPage } from '@/components/painel/painel-shell'
import { useTRPC, useTRPCClient } from '@/utils/trpc'

export const Route = createFileRoute('/admin/validate')({
  // O QR do código no app do torcedor abre aqui com `?code=`.
  validateSearch: (search: Record<string, unknown>): { code?: string } =>
    typeof search.code === 'string' ? { code: search.code } : {},
  head: () => ({
    meta: [{ title: 'Validar código — Onside' }]
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
  // Bar que confirma pela comanda lança em Quem vai (WEB-412, WEB-501).
  const barQuery = useQuery({
    ...trpc.pub.getMe.queryOptions(),
    meta: { errorToast: false }
  })
  const confirmsLater = elite && barQuery.data?.confirmsCodesLater === true

  // Cliente direto, sem `useMutation`: o painel já guarda pendência e erro, e
  // repetir é decisão de quem está no balcão, nunca retry automático.
  const { reservationValidation } = useTRPCClient()

  return (
    <PainelPage
      title="Validar código"
      sub="Valide o código de quem marcou “Vou assistir aqui” e libere a oferta da casa."
    >
      {confirmsLater ? (
        <div className="onside-callout onside-callout-stone mb-6" role="note">
          <p className="flex-1 text-sm">
            Os códigos anotados na comanda você lança em Quem vai, até 48 h
            depois do jogo.
          </p>
          <Link
            to="/admin/quem-vai"
            hash="comanda"
            className="onside-btn onside-btn-ink shrink-0"
          >
            Lançar códigos da comanda
          </Link>
        </div>
      ) : null}

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
    </PainelPage>
  )
}
