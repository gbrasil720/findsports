import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CodeValidation } from '@/components/admin/code-validation'
import { useMinuteNow } from '@/components/app/minute-tick'
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
    <>
      <div className="pn-head">
        <div>
          <p className="pn-k">O código de quem marcou “Vou assistir aqui”</p>
          <h1 className="pn-disp">Validar código</h1>
          <p className="pn-sub">
            Valide o código e libere a oferta da casa. O QR do torcedor abre
            esta página já buscando.
          </p>
        </div>
      </div>

      {confirmsLater ? (
        <div className="pn-lock pn-cv-comanda" role="note">
          <span>
            Os códigos anotados na comanda você lança em Quem vai, até 48 h
            depois do jogo.
          </span>
          <Link
            to="/admin/quem-vai"
            hash="comanda"
            className="pn-btn pn-ink pn-sm"
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
    </>
  )
}
