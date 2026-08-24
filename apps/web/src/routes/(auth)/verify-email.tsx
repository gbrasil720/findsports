import { useMutation } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Envelope from 'reicon-react/icons/Envelope'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import { authClient, refreshSessionCache } from '@/lib/auth-client'
import {
  PUB_ONBOARDING_DRAFT_KEY,
  parsePubOnboardingDraft
} from '@/lib/pub-onboarding-draft'
import { useTRPC } from '@/utils/trpc'

const PENDING_VERIFICATION_KEY = 'onside:pending-verification'

export const Route = createFileRoute('/(auth)/verify-email')({
  head: () => ({
    meta: [
      { title: 'Confirme seu e-mail — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: VerifyEmailPage
})

function readPendingEmail(): string {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    const pending = JSON.parse(
      sessionStorage.getItem(PENDING_VERIFICATION_KEY) ?? '{}'
    ) as { email?: unknown }
    return typeof pending.email === 'string' ? pending.email : ''
  } catch {
    return ''
  }
}

function VerifyEmailPage() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const continuing = useRef(false)
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(false)
  const [resending, setResending] = useState(false)
  const { mutateAsync: completePub } = useMutation(
    trpc.onboarding.completePub.mutationOptions()
  )

  const continueVerified = useCallback(async () => {
    if (continuing.current) return
    continuing.current = true
    setChecking(true)
    try {
      const { data } = await authClient.getSession({
        query: { disableCookieCache: true }
      })
      if (!data?.user.emailVerified) {
        toast.error('A confirmação ainda não apareceu. Tente novamente.')
        return
      }

      sessionStorage.removeItem(PENDING_VERIFICATION_KEY)
      if (data.user.role === 'pub' && !data.user.onboardingCompleted) {
        const draft = parsePubOnboardingDraft(
          localStorage.getItem(PUB_ONBOARDING_DRAFT_KEY)
        )
        if (!draft) {
          navigate({ to: '/onboarding/pub' })
          return
        }
        await completePub(draft)
        localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
        await refreshSessionCache()
        navigate({ to: '/plan' })
        return
      }

      if (data.user.role === 'pub') navigate({ to: '/plan' })
      else if (data.user.role === 'admin') navigate({ to: '/internal' })
      else if (data.user.onboardingCompleted) navigate({ to: '/dashboard' })
      else navigate({ to: '/onboarding/fan' })
    } catch {
      toast.error('Não foi possível concluir a confirmação. Tente novamente.')
    } finally {
      continuing.current = false
      setChecking(false)
    }
  }, [completePub, navigate])

  useEffect(() => {
    setEmail(readPendingEmail())
    if (new URLSearchParams(window.location.search).get('confirmed') === '1') {
      void continueVerified()
    }
  }, [continueVerified])

  async function resend() {
    if (!email) {
      toast.error('Volte ao cadastro para informar seu e-mail.')
      return
    }
    setResending(true)
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/verify-email?confirmed=1'
    })
    setResending(false)
    if (error) {
      toast.error('Não foi possível reenviar agora. Tente novamente.')
      return
    }
    toast.success('Se o endereço estiver cadastrado, um novo link foi enviado.')
  }

  return (
    <OnboardingLayout variant="pub">
      <OnboardingHeader label="Confirmação de e-mail" />
      <main className="mx-auto grid max-w-3xl gap-8 border border-[var(--onside-line)] bg-[var(--onside-paper)] p-6 text-[var(--onside-ink)] shadow-[8px_8px_0_var(--onside-acid)] sm:p-10 md:grid-cols-[96px_1fr]">
        <div className="grid size-24 place-items-center border-2 border-[var(--onside-ink)] bg-[var(--onside-acid)]">
          <Envelope size={42} color="currentColor" aria-hidden="true" />
        </div>
        <div>
          <p className="onside-kicker mb-3 text-[var(--onside-live-text)]">
            Última checagem
          </p>
          <h1 className="onside-display mb-4 text-4xl sm:text-5xl">
            CONFIRME O E-MAIL. DEPOIS, É BOLA ROLANDO.
          </h1>
          <p className="max-w-xl text-[var(--onside-muted)] leading-relaxed">
            Enviamos um link para{' '}
            {email ? <strong>{email}</strong> : 'o endereço cadastrado'}. Ele
            confirma que a conta é realmente sua e libera o próximo passo.
          </p>
          <ol className="my-7 grid gap-3 text-sm">
            <li className="flex items-center gap-3">
              <Check size={18} color="currentColor" aria-hidden="true" /> Abra o
              e-mail do Onside.
            </li>
            <li className="flex items-center gap-3">
              <Check size={18} color="currentColor" aria-hidden="true" />
              Clique em “Confirmar meu e-mail”.
            </li>
            <li className="flex items-center gap-3">
              <Check size={18} color="currentColor" aria-hidden="true" /> Volte
              aqui para seguir aos planos.
            </li>
          </ol>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={continueVerified}
              disabled={checking}
              className="onside-btn onside-btn-acid min-h-11"
            >
              {checking ? (
                <Loader
                  size={16}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {checking ? 'Confirmando…' : 'Já confirmei meu e-mail'}
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={resending}
              className="onside-btn onside-btn-outline min-h-11"
            >
              {resending ? 'Reenviando…' : 'Reenviar link'}
            </button>
          </div>
          <p className="mt-6 text-xs text-[var(--onside-muted)]">
            Não reconhece este cadastro? Você pode simplesmente ignorar o
            e-mail.
          </p>
        </div>
      </main>
    </OnboardingLayout>
  )
}
