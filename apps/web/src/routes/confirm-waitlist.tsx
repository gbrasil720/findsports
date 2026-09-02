import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { OnboardingHeader } from '@/components/onboarding/onboarding-header'
import { OnboardingLayout } from '@/components/onboarding/onboarding-layout'
import {
  isRetryableWaitlistFailure,
  WAITLIST_TOKEN_MIN_LENGTH,
  type WaitlistConfirmFailure,
  waitlistConfirmationState
} from '@/domain/waitlist-confirmation'
import { analytics } from '@/lib/analytics'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/confirm-waitlist')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : ''
  }),
  component: ConfirmWaitlistPage
})

const RECUSA: Record<
  WaitlistConfirmFailure,
  { title: string; body: string; exit: string }
> = {
  incomplete_link: {
    title: 'Esse link está incompleto',
    body: 'Alguns aplicativos de e-mail cortam o endereço no meio. Abra o link direto da mensagem que enviamos, em vez de copiar e colar.',
    exit: 'Voltar ao início'
  },
  expired: {
    title: 'Seu link expirou',
    body: 'Links de confirmação valem 24 horas. Preencha o formulário na página inicial e enviamos um novo na hora.',
    exit: 'Preencher de novo'
  },
  cancelled: {
    title: 'Você saiu da waitlist',
    body: 'Esta inscrição foi cancelada pelo link de saída. Quer voltar? É só preencher o formulário na página inicial.',
    exit: 'Preencher de novo'
  },
  invalid: {
    title: 'Este link não vale mais',
    body: 'Não encontramos nenhuma confirmação para ele. Abra o link direto do e-mail que enviamos — ou preencha o formulário de novo na página inicial.',
    exit: 'Preencher de novo'
  },
  unavailable: {
    title: 'Não conseguimos confirmar agora',
    body: 'A falha foi da conexão ou nossa, não do link: ele continua valendo. Tente de novo em alguns instantes.',
    exit: 'Voltar ao início'
  }
}

function ConfirmWaitlistPage() {
  const { token } = Route.useSearch()
  const trpc = useTRPC()
  const confirm = useMutation(
    trpc.waitlist.confirm.mutationOptions({
      onSuccess: (result) => {
        if (!result.confirmed) return
        analytics.identifyWaitlist(result.waitlistId)
        analytics.waitlistConfirmed()
      }
    })
  )
  const mutate = confirm.mutate
  useEffect(() => {
    if (token.length >= WAITLIST_TOKEN_MIN_LENGTH) mutate({ token })
  }, [mutate, token])

  const state = waitlistConfirmationState({
    token,
    isError: confirm.isError,
    data: confirm.data
  })
  const failure = state.kind === 'failed' ? state.failure : null

  // A falha só vale como evento uma vez por tentativa: sem isto, remontar a
  // tela contaria de novo a mesma pessoa e inflaria justo a causa mais comum.
  const tracked = useRef<WaitlistConfirmFailure | null>(null)
  useEffect(() => {
    if (!failure) {
      tracked.current = null
      return
    }
    if (tracked.current === failure) return
    tracked.current = failure
    analytics.waitlistConfirmFailed(failure)
  }, [failure])

  const retryable = failure !== null && isRetryableWaitlistFailure(failure)

  return (
    <OnboardingLayout>
      <OnboardingHeader label="Confirmação de e-mail" />
      <main
        className="onside-panel onside-shadow-acid mx-auto max-w-xl p-6 text-center sm:p-8"
        aria-busy={state.kind === 'confirming'}
        aria-live="polite"
      >
        <p className="onside-kicker">Waitlist Onside</p>
        <h1 className="onside-display mt-3 text-4xl">
          {state.kind === 'confirmed'
            ? 'Inscrição confirmada'
            : failure
              ? RECUSA[failure].title
              : 'Confirmando seu e-mail…'}
        </h1>
        <p className="mt-4 text-[var(--onside-muted)]">
          {state.kind === 'confirmed'
            ? state.emailSent
              ? 'Pronto. Você receberá um e-mail especial quando seu acesso for liberado.'
              : 'Sua inscrição está confirmada. O e-mail de boas-vindas não saiu agora — pode reabrir este link mais tarde para tentar de novo. Sua vaga não depende dele.'
            : failure
              ? RECUSA[failure].body
              : 'Só um instante.'}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {retryable ? (
            <button
              type="button"
              onClick={() => confirm.mutate({ token })}
              className="onside-btn onside-btn-acid"
            >
              Tentar de novo
            </button>
          ) : null}
          <Link
            to="/"
            className={`onside-btn inline-flex ${
              retryable ? 'onside-btn-outline' : 'onside-btn-acid'
            }`}
          >
            {failure ? RECUSA[failure].exit : 'Voltar ao início'}
          </Link>
        </div>
      </main>
    </OnboardingLayout>
  )
}
