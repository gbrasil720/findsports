import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/confirm-waitlist')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : ''
  }),
  component: ConfirmWaitlistPage
})

function ConfirmWaitlistPage() {
  const { token } = Route.useSearch()
  const trpc = useTRPC()
  const confirm = useMutation(
    trpc.waitlist.confirm.mutationOptions({
      onSuccess: (result) => {
        analytics.identifyWaitlist(result.waitlistId)
        analytics.waitlistConfirmed()
      }
    })
  )
  const mutate = confirm.mutate
  useEffect(() => {
    if (token) mutate({ token })
  }, [mutate, token])

  return (
    <OnboardingLayout>
      <OnboardingHeader label="Confirmação de e-mail" />
      <main
        className="onside-panel onside-shadow-acid mx-auto max-w-xl p-6 text-center sm:p-8"
        aria-busy={confirm.isPending}
        aria-live="polite"
      >
        <p className="onside-kicker">Waitlist Onside</p>
        <h1 className="onside-display mt-3 text-4xl">
          {confirm.isSuccess
            ? 'Inscrição confirmada'
            : confirm.isError
              ? 'Este link não vale mais'
              : 'Confirmando seu e-mail…'}
        </h1>
        <p className="mt-4 text-[var(--onside-muted)]">
          {confirm.isSuccess
            ? confirm.data.emailSent
              ? 'Pronto. Você receberá um e-mail especial quando seu acesso for liberado.'
              : 'Sua inscrição está confirmada. O e-mail de boas-vindas não saiu agora — pode reabrir este link mais tarde para tentar de novo. Sua vaga não depende dele.'
            : confirm.isError
              ? confirm.error.message
              : 'Só um instante.'}
        </p>
        <Link to="/" className="onside-btn onside-btn-acid mt-6 inline-flex">
          Voltar ao início
        </Link>
      </main>
    </OnboardingLayout>
  )
}
