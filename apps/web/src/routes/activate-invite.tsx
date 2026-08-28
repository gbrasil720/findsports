import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/activate-invite')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : ''
  }),
  component: ActivateInvitePage
})

function ActivateInvitePage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const trpc = useTRPC()
  const invite = useQuery({
    ...trpc.waitlist.inviteDetails.queryOptions({ token }),
    enabled: token.length >= 32,
    retry: false
  })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const tracked = useRef(false)
  useEffect(() => {
    if (!invite.data || tracked.current) return
    tracked.current = true
    analytics.identifyWaitlist(invite.data.id)
    analytics.waitlistInviteOpened()
  }, [invite.data])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    if (password !== String(data.get('passwordConfirmation') ?? '')) {
      setError('As senhas precisam ser iguais.')
      return
    }
    setPending(true)
    setError('')
    const response = await fetch('/api/waitlist/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, name: data.get('name'), password })
    })
    const body = (await response.json().catch(() => ({}))) as {
      message?: string
      existingAccount?: boolean
      user?: { role?: 'fan' | 'pub' }
    }
    if (!response.ok) {
      setError(body.message ?? 'Não foi possível ativar a conta.')
      setPending(false)
      return
    }
    analytics.waitlistActivated()
    await navigate({
      to: body.existingAccount
        ? '/login'
        : body.user?.role === 'pub'
          ? '/onboarding/pub'
          : '/onboarding/fan'
    })
  }

  return (
    <OnboardingLayout>
      <OnboardingHeader label="Ativação de convite" />
      <main
        className="onside-panel onside-shadow-acid mx-auto w-full max-w-lg p-6 sm:p-8"
        aria-busy={invite.isPending || pending}
      >
        <p className="onside-kicker">Convite Onside</p>
        <h1 className="onside-display mt-3 text-4xl">Ative sua conta</h1>
        <p className="mt-3 text-sm text-[var(--onside-muted)]">
          Seu e-mail já está ligado ao convite. Defina seu nome e sua senha para
          entrar.
        </p>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div>
            <label htmlFor="invite-email" className="onside-label">
              E-mail do convite
            </label>
            <input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="email"
              spellCheck={false}
              value={invite.data?.email ?? ''}
              disabled
              className="onside-input bg-[var(--onside-stone)]"
            />
          </div>
          <div>
            <label htmlFor="invite-name" className="onside-label">
              Nome completo
            </label>
            <input
              id="invite-name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              className="onside-input"
            />
          </div>
          <div>
            <label htmlFor="invite-password" className="onside-label">
              Senha
            </label>
            <input
              id="invite-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              className="onside-input"
            />
          </div>
          <div>
            <label
              htmlFor="invite-password-confirmation"
              className="onside-label"
            >
              Confirmar senha
            </label>
            <input
              id="invite-password-confirmation"
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              className="onside-input"
            />
          </div>
          {error || invite.error ? (
            <p role="alert" className="onside-field-error">
              {error || invite.error?.message}
            </p>
          ) : null}
          <button
            disabled={pending || !invite.data}
            className="onside-btn onside-btn-acid onside-btn-full"
            type="submit"
          >
            {pending ? 'Ativando…' : 'Criar senha e entrar'}
          </button>
        </form>
      </main>
    </OnboardingLayout>
  )
}
