import { useMutation } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
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
    <OnboardingLayout>
      <OnboardingHeader label="Acesso antecipado" />
      <main
        className="onside-panel onside-shadow-acid mx-auto w-full max-w-xl p-6 sm:p-8"
        aria-busy={join.isPending}
        aria-live="polite"
      >
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
              <div>
                <label htmlFor="pending-email" className="onside-label">
                  E-mail
                </label>
                <input
                  id="pending-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck={false}
                  value={session?.user.email ?? ''}
                  disabled
                  className="onside-input bg-[var(--onside-stone)]"
                />
              </div>
              {role === 'pub' ? (
                <div>
                  <label htmlFor="pending-pub-name" className="onside-label">
                    Nome do bar
                  </label>
                  <input
                    id="pending-pub-name"
                    name="pubName"
                    autoComplete="organization"
                    required
                    minLength={2}
                    maxLength={100}
                    className="onside-input"
                  />
                </div>
              ) : null}
              <div>
                <label htmlFor="pending-city" className="onside-label">
                  Cidade
                </label>
                <input
                  id="pending-city"
                  name="city"
                  autoComplete="address-level2"
                  required
                  minLength={2}
                  maxLength={100}
                  className="onside-input"
                />
              </div>
              <div>
                <label htmlFor="pending-phone" className="onside-label">
                  Telefone opcional
                </label>
                <input
                  id="pending-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={30}
                  className="onside-input"
                />
              </div>
              {join.error ? (
                <p role="alert" className="onside-field-error">
                  {join.error.message}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={join.isPending}
                className="onside-btn onside-btn-acid onside-btn-full"
              >
                {join.isPending ? 'Entrando…' : 'Entrar na waitlist'}
              </button>
            </form>
          </>
        )}
      </main>
    </OnboardingLayout>
  )
}
