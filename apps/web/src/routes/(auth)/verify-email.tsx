import { useMutation } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Envelope from 'reicon-react/icons/Envelope'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'
import { type AuthPanel, AuthShell } from '@/components/entrada/auth-shell'
import { PubObShell } from '@/components/onboarding/pub-ob-shell'
import {
  PubReceipt,
  type PubReceiptData,
  useFinishPubSignup
} from '@/components/onboarding/pub-receipt'
import { useTurnstile } from '@/components/turnstile'
import { authClient, refreshSessionCache } from '@/lib/auth-client'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
import { pageHead } from '@/lib/page-head'
import {
  PENDING_VERIFICATION_KEY,
  readPendingEmail
} from '@/lib/pending-verification'
import {
  mensagemFalhaCadastroBar,
  PUB_ONBOARDING_DRAFT_KEY,
  parsePubOnboardingDraft
} from '@/lib/pub-onboarding-draft'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { getCallbackUrl, withCallbackUrl } from '@/utils/callback-url'
import { useTRPC } from '@/utils/trpc'

const PANEL: AuthPanel = {
  kind: 'caption',
  led: 'scarf',
  title: (
    <>
      Quase <span>lá.</span>
    </>
  ),
  items: ['Confirme o e-mail e siga para o próximo passo']
}

export const Route = createFileRoute('/(auth)/verify-email')({
  head: () =>
    pageHead({
      path: '/verify-email',
      title: 'Confirme seu e-mail — Onside',
      description: 'Confirme seu e-mail para começar a usar a Onside.',
      indexable: false
    }),
  component: VerifyEmailPage
})

function VerifyEmailPage() {
  const navigate = useNavigate()
  // Vem no link do e-mail (WEB-211): a aba aberta por ele não tem o
  // `sessionStorage` da aba do cadastro.
  const callbackUrl = getCallbackUrl(useLocation().href)
  const trpc = useTRPC()
  const continuing = useRef(false)
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(false)
  const [resending, setResending] = useState(false)
  const [pubError, setPubError] = useState<string | null>(null)
  // WEB-248: sem sessão neste navegador (confirmou em outro aparelho) nenhum
  // dos dois botões resolve; o caminho é o login.
  const [needsLogin, setNeedsLogin] = useState(false)
  // WEB-273: o Turnstile só serve ao reenvio, então só carrega quando pedem
  // um. Na carga da página ele custava o script e o desafio a quem só espera.
  const [captchaOn, setCaptchaOn] = useState(false)
  const captcha = useTurnstile()
  const { mutateAsync: completePub } = useMutation(
    trpc.onboarding.completePub.mutationOptions()
  )
  const finishSignup = useFinishPubSignup()
  // Bar criado daqui (WEB-501): o comprovante abre no lugar desta tela, e o
  // botão dele segue para `/plan`, como seguia antes.
  const [receipt, setReceipt] = useState<PubReceiptData | null>(null)
  const [leaving, setLeaving] = useState(false)

  const continueVerified = useCallback(async () => {
    if (continuing.current) return
    continuing.current = true
    setChecking(true)
    setPubError(null)
    try {
      const { data } = await authClient.getSession({
        query: { disableCookieCache: true }
      })
      if (!data) {
        setNeedsLogin(true)
        return
      }
      if (!data.user.emailVerified) {
        toast.error('A confirmação ainda não apareceu. Tente novamente.')
        return
      }

      sessionStorage.removeItem(PENDING_VERIFICATION_KEY)
      if (data.user.role === 'pub' && !data.user.onboardingCompleted) {
        // Só o rascunho desta conta é enviado por ela (WEB-262).
        const draft = parsePubOnboardingDraft(
          localStorage.getItem(PUB_ONBOARDING_DRAFT_KEY),
          data.user.email
        )
        // Rascunho de antes da UF (WEB-270) não é enviado nem descartado: o
        // formulário o abre e pede o que falta. O que ainda tem passo também
        // não: o dono parou no meio do wizard, sem passar pela revisão.
        if (!draft?.uf || draft.step) {
          navigate({ to: '/onboarding/pub' })
          return
        }
        // O plano escolhido não vai ao `completePub`: entra depois, por
        // `changeTrialPlan`, em `finishSignup`.
        const { plan, ...payload } = draft
        let created = false
        try {
          await completePub(payload)
          created = true
        } catch (err) {
          const concluido = mensagemOnboardingJaConcluido(err)
          if (!concluido) {
            // O rascunho fica: o link abaixo leva de volta ao formulário, que
            // o carrega para corrigir.
            setPubError(mensagemFalhaCadastroBar(err, draft))
            return
          }
          toast.info(concluido)
        }
        localStorage.removeItem(PUB_ONBOARDING_DRAFT_KEY)
        await refreshSessionCache()
        const comprovante = created
          ? await finishSignup({ ...payload, plan })
          : null
        if (comprovante) setReceipt(comprovante)
        else navigate({ to: '/plan', search: { trial: 'started' } })
        return
      }

      if (data.user.role === 'pub') navigate({ to: '/plan' })
      else if (data.user.onboardingCompleted) navigate({ to: callbackUrl })
      else navigate({ to: withCallbackUrl('/onboarding/fan', callbackUrl) })
    } catch {
      toast.error('Não foi possível concluir a confirmação. Tente novamente.')
    } finally {
      continuing.current = false
      setChecking(false)
    }
  }, [callbackUrl, completePub, finishSignup, navigate])

  useEffect(() => {
    setEmail(readPendingEmail())
    if (new URLSearchParams(window.location.search).get('confirmed') === '1') {
      void continueVerified()
    }
  }, [continueVerified])

  async function resend() {
    if (!email) {
      setNeedsLogin(true)
      return
    }
    setCaptchaOn(true)
    setResending(true)
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: withCallbackUrl('/verify-email?confirmed=1', callbackUrl),
      fetchOptions: captcha.fetchOptions
    })
    setResending(false)
    captcha.reset()
    if (error) {
      toast.error(
        getUserFacingMessage(
          error,
          'Não foi possível reenviar agora. Tente novamente.'
        )
      )
      return
    }
    toast.success('Se o endereço estiver cadastrado, um novo link foi enviado.')
  }

  if (receipt) {
    return (
      <PubObShell>
        <PubReceipt
          data={receipt}
          pending={leaving}
          continueLabel="Ver meu bar no ar"
          onContinue={() => {
            setLeaving(true)
            void navigate({ to: '/plan', search: { trial: 'started' } })
          }}
        />
      </PubObShell>
    )
  }

  return (
    <AuthShell panel={PANEL}>
      <div className="w-full">
        <div className="ent-mail">
          <Envelope size={40} color="currentColor" aria-hidden="true" />
        </div>
        <div>
          <h1 className="onside-display mb-4">
            Confira sua{' '}
            <span className="text-[var(--onside-live-text)]">
              caixa de entrada
            </span>
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
              aqui para continuar.
            </li>
          </ol>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={continueVerified}
              disabled={checking}
              className="onside-btn onside-btn-acid ent-full"
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
              className="onside-btn onside-btn-outline ent-full"
            >
              {resending ? 'Reenviando…' : 'Reenviar link'}
            </button>
          </div>
          {captchaOn ? captcha.widget : null}
          {needsLogin ? (
            <div
              className="onside-callout onside-callout-warn mt-6"
              role="alert"
            >
              {/* Sem sessão nesta aba não dá para saber se o e-mail já foi
                  confirmado: o link pode ter aberto em outro navegador (o do
                  app de e-mail) ou a confirmação veio por outro caminho. O
                  login resolve todos os casos e retoma o cadastro do bar. */}
              <p className="text-sm font-semibold">
                Para continuar, entre com seu e-mail e senha. Se o e-mail ainda
                não estiver confirmado, mandamos um link novo de lá.
              </p>
              <Link
                to="/login"
                search={{ callbackUrl, ...(email ? { email } : {}) }}
                className="onside-btn onside-btn-ink"
              >
                Entrar para continuar
              </Link>
            </div>
          ) : null}
          {pubError ? (
            <div
              className="onside-callout onside-callout-warn mt-6"
              role="alert"
            >
              <p className="text-sm font-semibold">{pubError}</p>
              <Link to="/onboarding/pub" className="text-sm underline">
                Corrigir o cadastro do bar
              </Link>
            </div>
          ) : null}
          <p className="mt-6 text-xs text-[var(--onside-muted)]">
            Não reconhece este cadastro? Você pode simplesmente ignorar o
            e-mail.
          </p>
        </div>
      </div>
    </AuthShell>
  )
}
