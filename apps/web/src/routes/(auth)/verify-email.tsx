import { useMutation } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import { toast } from 'sonner'
import { AuthSplit, Disp, entradaHead } from '@/components/entrada/auth'
import { Botao, propsBotao } from '@/components/painel'
import { useTurnstile } from '@/components/turnstile'
import { authClient, refreshSessionCache } from '@/lib/auth-client'
import { mensagemOnboardingJaConcluido } from '@/lib/onboarding-concluido'
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
import { FAN_HOME, PUB_LIVE_PATH } from '@/utils/auth-guards'
import { useCallbackUrl, withCallbackUrl } from '@/utils/callback-url'
import { useTRPC } from '@/utils/trpc'

export const Route = createFileRoute('/(auth)/verify-email')({
  head: () =>
    entradaHead({
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
  const callbackUrl = useCallbackUrl()
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
        try {
          await completePub(draft)
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
        navigate(
          callbackUrl === '/admin' ? { to: PUB_LIVE_PATH } : { to: callbackUrl }
        )
        return
      }

      // Torcedor (cadastrado pelo app) não tem tela no web.
      navigate({ to: data.user.role === 'pub' ? callbackUrl : FAN_HOME })
    } catch {
      toast.error('Não foi possível concluir a confirmação. Tente novamente.')
    } finally {
      continuing.current = false
      setChecking(false)
    }
  }, [callbackUrl, completePub, navigate])

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

  return (
    <AuthSplit
      foto={
        <>
          <Disp
            nivel={0}
            tamanho={64}
            linhas={[
              { texto: 'Última checagem' },
              { texto: 'antes do apito.', tint: true }
            ]}
          />
          <p>
            Confirmar o e-mail garante que a conta do bar é sua. Depois, é bola
            rolando.
          </p>
        </>
      }
    >
      <span className="entrada-selo" aria-hidden="true">
        <Envelope size={30} color="currentColor" />
      </span>
      <p className="entrada-kicker">Última checagem</p>
      <Disp
        tamanho={52}
        linhas={[{ texto: 'Confirme' }, { texto: 'seu e-mail' }]}
      />
      <p className="entrada-linha">
        Enviamos um link para{' '}
        {email ? <strong>{email}</strong> : 'o endereço cadastrado'}. Ele
        confirma que a conta é realmente sua e libera o próximo passo.
      </p>
      <ol className="entrada-lista">
        <li>Abra o e-mail da Onside.</li>
        <li>Clique em “Confirmar meu e-mail”.</li>
        <li>Volte aqui para colocar o bar no ar.</li>
      </ol>
      <div className="entrada-botoes">
        <Botao variante="acid" onClick={continueVerified} disabled={checking}>
          {checking ? 'Confirmando…' : 'Já confirmei meu e-mail'}
        </Botao>
        <Botao onClick={resend} disabled={resending}>
          {resending ? 'Reenviando…' : 'Reenviar link'}
        </Botao>
      </div>
      {captchaOn ? captcha.widget : null}
      {needsLogin ? (
        <div className="entrada-aviso" role="alert">
          {/* Sem sessão nesta aba não dá para saber se o e-mail já foi
              confirmado: o link pode ter aberto em outro navegador (o do app
              de e-mail) ou a confirmação veio por outro caminho. O login
              resolve todos os casos e retoma o cadastro do bar. */}
          <p className="m-0">
            Para continuar, entre com seu e-mail e senha. Se o e-mail ainda não
            estiver confirmado, mandamos um link novo de lá.
          </p>
          <Link
            to="/login"
            search={{ callbackUrl, ...(email ? { email } : {}) }}
            {...propsBotao({ variante: 'ink' })}
          >
            Entrar para continuar
          </Link>
        </div>
      ) : null}
      {pubError ? (
        <div className="entrada-aviso" role="alert">
          <p className="m-0">{pubError}</p>
          <Link to="/onboarding/pub" className="entrada-link">
            Corrigir o cadastro do bar
          </Link>
        </div>
      ) : null}
      <p className="entrada-nota" style={{ textAlign: 'left' }}>
        Não reconhece este cadastro? Você pode simplesmente ignorar o e-mail.
      </p>
    </AuthSplit>
  )
}
