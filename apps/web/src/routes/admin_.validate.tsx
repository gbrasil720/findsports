import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import ArrowLeft from 'reicon-react/icons/ArrowLeft'
import { CodeValidation } from '@/components/admin/code-validation'
import { AppShell } from '@/components/app/app-shell'
import { useMinuteNow } from '@/components/app/minute-tick'
import { PWA_LINKS, PWA_META } from '@/lib/pwa'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/admin_/validate')({
  head: () => ({
    meta: [
      { title: 'Validar código de reserva — Onside' },
      { name: 'robots', content: 'noindex' },
      ...PWA_META
    ],
    links: [...PWA_LINKS]
  }),
  component: ValidatePage
})

function ValidatePage() {
  const trpc = useTRPC()
  const now = useMinuteNow()

  // A tela desenha o próprio erro, com botão de tentar de novo.
  const subscriptionQuery = useQuery({
    ...trpc.pub.getMySubscription.queryOptions(),
    meta: { errorToast: false }
  })

  // `retry: false` de propósito: quem decide repetir é a pessoa, e o `+1`
  // repetido reusa o `requestId` que o componente guarda.
  const lookup = useMutation(
    trpc.reservationValidation.lookup.mutationOptions({ retry: false })
  )
  const registerArrival = useMutation(
    trpc.reservationValidation.registerArrival.mutationOptions({ retry: false })
  )
  const undoArrival = useMutation(
    trpc.reservationValidation.undoArrival.mutationOptions({ retry: false })
  )

  return (
    <AppShell variant="pub" userMeta="Validar código">
      <div className="mb-8">
        <Link
          to="/admin"
          className="onside-btn onside-btn-ghost -ml-3 mb-3 min-h-11 px-3 text-xs"
        >
          <ArrowLeft size={13} color="currentColor" aria-hidden="true" />
          Painel do bar
        </Link>
        <h1 className="onside-display text-3xl md:text-4xl">Validar código</h1>
        <p className="mt-2 text-[var(--onside-muted)] text-sm">
          Registre quem chegou com reserva feita pela Onside.
        </p>
      </div>

      <CodeValidation
        access={
          subscriptionQuery.isLoading
            ? { status: 'loading' }
            : subscriptionQuery.isError
              ? {
                  status: 'error',
                  retry: () => void subscriptionQuery.refetch()
                }
              : {
                  status: 'ready',
                  eligible: subscriptionQuery.data?.currentPlan === 'elite'
                }
        }
        now={now}
        lookup={lookup.mutateAsync}
        registerArrival={registerArrival.mutateAsync}
        undoArrival={undoArrival.mutateAsync}
      />
    </AppShell>
  )
}
