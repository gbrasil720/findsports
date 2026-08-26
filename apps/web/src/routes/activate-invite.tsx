import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
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
    <main className="onside-shell flex min-h-screen items-center justify-center px-4 py-12">
      <section className="onside-panel w-full max-w-lg p-6 sm:p-8">
        <p className="onside-kicker">Convite Onside</p>
        <h1 className="onside-display mt-3 text-4xl">Ative sua conta</h1>
        <p className="mt-3 text-sm text-[var(--onside-muted)]">
          Seu e-mail já está ligado ao convite. Defina seu nome e sua senha para
          entrar.
        </p>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm font-bold">
            E-mail do convite
            <input
              value={invite.data?.email ?? ''}
              disabled
              className="min-h-11 border border-[var(--onside-ink)] bg-black/5 px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Nome completo
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              className="min-h-11 border border-[var(--onside-ink)] bg-transparent px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Senha
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              className="min-h-11 border border-[var(--onside-ink)] bg-transparent px-3"
            />
          </label>
          <label className="grid gap-1 text-sm font-bold">
            Confirmar senha
            <input
              name="passwordConfirmation"
              type="password"
              required
              minLength={8}
              maxLength={128}
              className="min-h-11 border border-[var(--onside-ink)] bg-transparent px-3"
            />
          </label>
          {error || invite.error ? (
            <p role="alert" className="text-sm text-[var(--onside-live-text)]">
              {error || invite.error?.message}
            </p>
          ) : null}
          <button
            disabled={pending || !invite.data}
            className="onside-btn onside-btn-acid min-h-11 disabled:opacity-40"
            type="submit"
          >
            {pending ? 'Ativando…' : 'Criar senha e entrar'}
          </button>
        </form>
      </section>
    </main>
  )
}
