import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/access-pending')({
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
  component: AccessPendingPage
})

function AccessPendingPage() {
  const session = Route.useRouteContext({
    select: (context) => context.session
  })
  const trpc = useTRPC()
  const [joined, setJoined] = useState(false)
  const role = session?.user.role === 'pub' ? 'pub' : 'fan'
  const join = useMutation(
    trpc.waitlist.join.mutationOptions({
      onSuccess: () => {
        analytics.waitlistSubmitted(role)
        analytics.waitlistConfirmed()
        setJoined(true)
      }
    })
  )

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return
    const data = new FormData(event.currentTarget)
    const common = {
      email: session.user.email,
      city: String(data.get('city') ?? ''),
      phone: String(data.get('phone') ?? '') || undefined
    }
    join.mutate(
      role === 'pub'
        ? { ...common, role, pubName: String(data.get('pubName') ?? '') }
        : { ...common, role }
    )
  }

  return (
    <main className="onside-shell flex min-h-screen items-center justify-center px-4 py-12">
      <section className="onside-panel w-full max-w-xl p-6 sm:p-8">
        <p className="onside-kicker">Acesso antecipado</p>
        <h1 className="onside-display mt-3 text-4xl">
          Seu acesso ainda está pendente
        </h1>
        {joined ? (
          <p className="mt-5 text-[var(--onside-muted)]">
            Você entrou na waitlist com o e-mail {session?.user.email}. Não
            precisa confirmar de novo; avisaremos quando um admin liberar seu
            acesso.
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm text-[var(--onside-muted)]">
              Entre explicitamente na waitlist. Como você já confirmou este
              e-mail, a inscrição vale na hora.
            </p>
            <form onSubmit={submit} className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm font-bold">
                E-mail
                <input
                  value={session?.user.email ?? ''}
                  disabled
                  className="min-h-11 border border-[var(--onside-ink)] bg-black/5 px-3"
                />
              </label>
              {role === 'pub' ? (
                <label className="grid gap-1 text-sm font-bold">
                  Nome do bar
                  <input
                    name="pubName"
                    required
                    minLength={2}
                    maxLength={100}
                    className="min-h-11 border border-[var(--onside-ink)] bg-transparent px-3"
                  />
                </label>
              ) : null}
              <label className="grid gap-1 text-sm font-bold">
                Cidade
                <input
                  name="city"
                  required
                  minLength={2}
                  maxLength={100}
                  className="min-h-11 border border-[var(--onside-ink)] bg-transparent px-3"
                />
              </label>
              <label className="grid gap-1 text-sm font-bold">
                Telefone opcional
                <input
                  name="phone"
                  maxLength={30}
                  className="min-h-11 border border-[var(--onside-ink)] bg-transparent px-3"
                />
              </label>
              {join.error ? (
                <p
                  role="alert"
                  className="text-sm text-[var(--onside-live-text)]"
                >
                  {join.error.message}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={join.isPending}
                className="onside-btn onside-btn-acid min-h-11 disabled:opacity-40"
              >
                {join.isPending ? 'Entrando…' : 'Entrar na waitlist'}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  )
}
