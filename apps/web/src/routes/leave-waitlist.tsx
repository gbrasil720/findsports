import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/leave-waitlist')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : ''
  }),
  component: LeaveWaitlistPage
})

function LeaveWaitlistPage() {
  const { token } = Route.useSearch()
  const trpc = useTRPC()
  const leave = useMutation(
    trpc.waitlist.leave.mutationOptions({
      onSuccess: () => analytics.waitlistCancelled()
    })
  )
  return (
    <OnboardingLayout>
      <OnboardingHeader label="Lista de espera" />
      <main
        className="onside-panel onside-shadow-acid mx-auto max-w-xl p-6 text-center sm:p-8"
        aria-busy={leave.isPending}
        aria-live="polite"
      >
        <p className="onside-kicker">Waitlist Onside</p>
        <h1 className="onside-display mt-3 text-4xl">
          {leave.isSuccess ? 'Você saiu da lista' : 'Sair da waitlist?'}
        </h1>
        {leave.isError ? (
          <p
            role="alert"
            className="mt-4 text-sm text-[var(--onside-live-text)]"
          >
            {leave.error.message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {!leave.isSuccess ? (
            <button
              type="button"
              disabled={leave.isPending || !token}
              onClick={() => leave.mutate({ token })}
              className="onside-btn onside-btn-acid"
            >
              {leave.isPending ? 'Saindo…' : 'Confirmar saída'}
            </button>
          ) : null}
          <Link to="/" className="onside-btn onside-btn-outline inline-flex">
            Voltar ao início
          </Link>
        </div>
      </main>
    </OnboardingLayout>
  )
}
