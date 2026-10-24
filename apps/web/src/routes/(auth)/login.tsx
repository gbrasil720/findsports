import { useForm } from '@tanstack/react-form'
import {
  createFileRoute,
  Link,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  AuthSplit,
  CampoForm,
  CampoSenha,
  CardTorcedor,
  Disp,
  entradaHead
} from '@/components/entrada/auth'
import { Botao } from '@/components/painel'
import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import {
  createTwoFactorChallenge,
  TWO_FACTOR_CHALLENGE_KEY
} from '@/lib/two-factor-challenge'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { getCallbackUrl, withCallbackUrl } from '@/utils/callback-url'

export const Route = createFileRoute('/(auth)/login')({
  head: () =>
    entradaHead({
      path: '/login',
      title: 'Entrar — Onside',
      description:
        'Entre no painel do seu bar na Onside: jogos, quem vai e o código no balcão.',
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
  const [isLoading, setIsLoading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const captcha = useTurnstile()

  const callbackUrl = getCallbackUrl(href)

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
    <AuthSplit
      foto={
        <>
          <Disp
            nivel={0}
            tamanho={64}
            linhas={[
              { texto: 'Seu bar no' },
              { texto: 'radar dos torcedores.', tint: true }
            ]}
            className="entrada-foto-titulo"
          />
          <p>
            Programe os jogos, veja quem vai assistir e valide o código no
            balcão, daqui ou do app.
          </p>
        </>
      }
    >
      <p className="entrada-kicker">Onside para bares</p>
      <Disp tamanho={64} linhas={[{ texto: 'Entrar' }]} />
      <p className="entrada-linha">
        Ainda não cadastrou o bar?{' '}
        <Link
          to="/signup"
          search={callbackUrl === '/admin' ? {} : { callbackUrl }}
          className="entrada-link"
        >
          Cadastrar meu bar
        </Link>
      </p>

      <form
        method="post"
        ref={formRef}
        noValidate
        style={{ marginTop: 6 }}
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        {/*
         * O formulário é `noValidate`, então o navegador não valida nada.
         * Validar também no envio é o que faz a mensagem aparecer sob o campo
         * e `aria-invalid` ir junto (os validadores só rodavam no `blur`).
         */}
        <form.Field
          name="email"
          validators={{ onBlur: validateEmail, onSubmit: validateEmail }}
        >
          {(field) => (
            <CampoForm
              field={field}
              rotulo="E-mail"
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
          validators={{ onBlur: validatePassword, onSubmit: validatePassword }}
        >
          {(field) => (
            <CampoSenha
              field={field}
              rotulo="Senha"
              id="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
              aside={
                <Link to="/forgot-password" className="entrada-link">
                  Esqueci a senha
                </Link>
              }
            />
          )}
        </form.Field>

        <Botao
          type="submit"
          variante="acid"
          disabled={isLoading}
          className="entrada-cta"
          style={{ marginTop: 4 }}
        >
          {isLoading ? 'Entrando…' : 'Entrar'}
        </Botao>

        {captcha.widget}
      </form>

      <CardTorcedor />
    </AuthSplit>
  )
}
