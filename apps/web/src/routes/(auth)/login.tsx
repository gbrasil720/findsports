import { useForm } from '@tanstack/react-form'
import {
  createFileRoute,
  Link,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'

import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import { AuthShell, VisitorLink } from '@/components/entrada/auth-shell'
import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { pageHead } from '@/lib/page-head'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import {
  createTwoFactorChallenge,
  TWO_FACTOR_CHALLENGE_KEY
} from '@/lib/two-factor-challenge'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useCallbackUrl, withCallbackUrl } from '@/utils/callback-url'

export const Route = createFileRoute('/(auth)/login')({
  head: () =>
    pageHead({
      path: '/login',
      title: 'Entrar — Onside',
      description:
        'Entre na sua conta Onside e encontre o bar certo pro seu jogo.',
      indexable: false
    }),
  component: LoginPage
})

function validateEmail({ value }: { value: string }) {
  const trimmed = value.trim()
  if (!trimmed) return 'Informe seu e-mail.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Informe um e-mail válido.'
  }
  return undefined
}

function validatePassword({ value }: { value: string }) {
  return value ? undefined : 'Informe sua senha.'
}

function LoginPage() {
  const navigate = useNavigate()
  const { href } = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const captcha = useTurnstile()

  const callbackUrl = useCallbackUrl()

  const form = useForm({
    // `/verify-email` manda o e-mail do cadastro: quem confirmou por outro
    // caminho só precisa da senha.
    defaultValues: {
      email: new URL(href, 'http://local').searchParams.get('email') ?? '',
      password: ''
    },
    // Envio inválido leva o foco ao primeiro campo com erro; a mensagem já
    // está sob ele, e quem navega por teclado chega nela sem procurar.
    onSubmitInvalid: () => focusFirstInvalid(),
    onSubmit: async ({ value }) => {
      const email = value.email.trim()
      const password = value.password
      setIsLoading(true)
      const { data, error } = await authClient.signIn.email({
        email,
        password,
        fetchOptions: captcha.fetchOptions
      })
      setIsLoading(false)
      captcha.reset()
      // Senha certa, e-mail sem confirmar: o better-auth responde 403 e já
      // manda um link novo (`sendOnSignIn`). O "sem permissão" genérico
      // deixava a pessoa sem saber que o link estava na caixa de entrada.
      if (error?.code === 'EMAIL_NOT_VERIFIED') {
        sessionStorage.setItem(
          PENDING_VERIFICATION_KEY,
          JSON.stringify({ email })
        )
        toast.info('Confirme seu e-mail: mandamos um link novo para ele.')
        navigate({ to: withCallbackUrl('/verify-email', callbackUrl) })
        return
      }
      if (error) {
        toast.error(
          getUserFacingMessage(
            error,
            'Não foi possível entrar. Tente novamente.',
            'credentials'
          )
        )
        return
      }
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        sessionStorage.setItem(
          TWO_FACTOR_CHALLENGE_KEY,
          JSON.stringify(createTwoFactorChallenge(callbackUrl))
        )
        navigate({ to: '/two-factor' })
        return
      }
      toast.success('Bem-vindo de volta!')
      navigate({ to: callbackUrl })
    }
  })

  function focusFirstInvalid() {
    const root = formRef.current
    if (!root) return
    const first = root.querySelector<HTMLElement>(
      'input[aria-invalid="true"], input:invalid, input:required:placeholder-shown'
    )
    first?.focus()
  }

  return (
    <AuthShell
      panel={{
        kind: 'caption',
        led: 'hero',
        badge: 'A grade de hoje, publicada pelos bares',
        title: (
          <>
            O jogo <span>é aqui.</span>
          </>
        ),
        items: [
          'Veja quem vai e marque que vai também',
          'Seu código do balcão fica em Meus jogos'
        ]
      }}
    >
      <div className="w-full">
        <div className="mb-8">
          <h1 className="onside-display">
            Bem-vindo{' '}
            <span className="text-[var(--onside-live-text)]">de volta</span>
          </h1>
          <p className="ent-sub">
            Entre para marcar que vai, ver seu código e, se você tem um bar, o
            seu painel.
          </p>
        </div>

        <form
          method="post"
          ref={formRef}
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          {/*
           * O formulário é `noValidate`, então o navegador não valida nada;
           * e os validadores só rodavam no `blur`. Enviar vazio sem tocar
           * em campo nenhum não acendia erro em lugar algum da tela — só um
           * toast, que some. Validar também no envio é o que faz a mensagem
           * aparecer sob o campo e `aria-invalid` ir junto.
           */}
          <form.Field
            name="email"
            validators={{
              onBlur: validateEmail,
              onSubmit: validateEmail
            }}
          >
            {(field) => (
              <AuthInputField
                label="E-mail"
                icon={Envelope}
                field={field}
                id="email"
                type="email"
                inputMode="email"
                spellCheck={false}
                placeholder="seu@email.com"
                autoComplete="email"
                required
              />
            )}
          </form.Field>

          <form.Field
            name="password"
            validators={{
              onBlur: validatePassword,
              onSubmit: validatePassword
            }}
          >
            {(field) => (
              <AuthPasswordField
                label="Senha"
                field={field}
                id="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                showPassword={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                extraLabel={
                  <Link to="/forgot-password" className="ent-link text-sm">
                    Esqueceu?
                  </Link>
                }
              />
            )}
          </form.Field>

          <button
            type="submit"
            disabled={isLoading}
            className="onside-btn onside-btn-acid onside-btn-full ent-full mt-2"
          >
            {isLoading ? (
              <>
                <Loader
                  size={16}
                  color="currentColor"
                  className="animate-spin"
                  aria-hidden="true"
                />
                Acessando…
              </>
            ) : (
              'Entrar'
            )}
          </button>

          <p className="ent-alt">
            Primeira vez? <Link to="/signup">Criar conta grátis</Link>
          </p>

          {captcha.widget}
        </form>
        <VisitorLink />
      </div>
    </AuthShell>
  )
}
