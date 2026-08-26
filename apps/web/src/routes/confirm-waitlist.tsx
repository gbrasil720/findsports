import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
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
    <main className="onside-shell flex min-h-screen items-center justify-center px-4">
      <section className="onside-panel max-w-xl p-8 text-center">
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
            ? 'Pronto. Você receberá um e-mail especial quando seu acesso for liberado.'
            : confirm.isError
              ? confirm.error.message
              : 'Só um instante.'}
        </p>
        <Link to="/" className="onside-btn onside-btn-acid mt-6 inline-flex">
          Voltar ao início
        </Link>
      </section>
    </main>
  )
}
