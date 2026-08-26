import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
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
    <main className="onside-shell flex min-h-screen items-center justify-center px-4">
      <section className="onside-panel max-w-xl p-8 text-center">
        <p className="onside-kicker">Waitlist Onside</p>
        <h1 className="onside-display mt-3 text-4xl">
          {leave.isSuccess ? 'Você saiu da lista' : 'Sair da waitlist?'}
        </h1>
        {leave.isError ? (
          <p className="mt-4 text-[var(--onside-live-text)]">
            {leave.error.message}
          </p>
        ) : null}
        {!leave.isSuccess ? (
          <button
            type="button"
            disabled={leave.isPending || !token}
            onClick={() => leave.mutate({ token })}
            className="onside-btn onside-btn-acid mt-6 min-h-11 disabled:opacity-40"
          >
            {leave.isPending ? 'Saindo…' : 'Confirmar saída'}
          </button>
        ) : null}
        <Link to="/" className="onside-btn onside-btn-outline mt-6 inline-flex">
          Voltar ao início
        </Link>
      </section>
    </main>
  )
}
