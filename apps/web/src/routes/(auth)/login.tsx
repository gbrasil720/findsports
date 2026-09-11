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

import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { authClient } from '@/lib/auth-client'
import {
  createTwoFactorChallenge,
  TWO_FACTOR_CHALLENGE_KEY
} from '@/lib/two-factor-challenge'
import { getCallbackUrl } from '@/utils/callback-url'

export const Route = createFileRoute('/(auth)/login')({
  head: () => ({
    meta: [
      { title: 'Entrar — Onside' },
      {
        name: 'description',
        content:
          'Entre na sua conta Onside e encontre o bar certo pro seu jogo.'
      },
      { name: 'robots', content: 'noindex' }
    ]
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

  const callbackUrl = getCallbackUrl(href)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    // Envio inválido leva o foco ao primeiro campo com erro; a mensagem já
    // está sob ele, e quem navega por teclado chega nela sem procurar.
    onSubmitInvalid: () => focusFirstInvalid(),
    onSubmit: async ({ value }) => {
      const email = value.email.trim()
      const password = value.password
      setIsLoading(true)
      const { data, error } = await authClient.signIn.email({
        email,
        password
      })
      setIsLoading(false)
      if (error) {
        toast.error(
          error.message ?? 'Credenciais inválidas. Verifique e tente novamente.'
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
    <div className="onside-app flex min-h-dvh">
      <AuthBrandPanel variant="login">
        <div className="mb-3 flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-acid)] uppercase tracking-[0.16em]">
          <span className="onside-live-dot" aria-hidden="true" />
          Área exclusiva
        </div>
        <h2 className="onside-display mb-6 text-4xl text-[var(--onside-paper)] xl:text-5xl">
          O JOGO <span className="text-[var(--onside-acid)]">COMEÇA AQUI.</span>
        </h2>
        {/*
         * "o maior mapa de bares esportivos do Brasil" era superlativo de
         * produto lançado, numa tela cujo próprio fluxo depende de convite e
         * lista de espera. A frase que fica é a que o produto já cumpre.
         */}
        <p className="onside-text-muted-on-ink max-w-xs text-base leading-relaxed">
          Entre na sua conta e veja quais bares estão passando o seu jogo.
        </p>
      </AuthBrandPanel>

      <main className="flex flex-1 flex-col items-center justify-center bg-[var(--onside-paper)] px-4 py-10 sm:px-10 lg:px-16">
        <div className="mb-8 w-full max-w-[420px] border-[var(--onside-ink)] border-b pb-6 lg:hidden">
          <Link to="/" aria-label="Onside — página inicial">
            <OnsideBrand />
          </Link>
          <p className="mt-4 max-w-[28ch] text-sm text-[var(--onside-muted)]">
            O jogo{' '}
            <span className="font-semibold text-[var(--onside-ink)]">
              começa aqui
            </span>
            .
          </p>
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <p className="onside-kicker mb-3">Entrar</p>
            <h1 className="onside-display mb-3 text-[42px] sm:text-5xl md:text-[56px]">
              DE VOLTA AO{' '}
              <span className="text-[var(--onside-live-text)]">JOGO.</span>
            </h1>
            <p className="text-sm text-[var(--onside-muted)]">
              Não tem conta?{' '}
              <Link
                to="/signup"
                className="font-semibold text-[var(--onside-ink)] underline underline-offset-2 transition-colors hover:text-[var(--onside-live-text)]"
              >
                Cadastre-se grátis
              </Link>
            </p>
          </div>

          <form
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
                    <Link
                      to="/forgot-password"
                      className="font-semibold text-[var(--onside-muted)] text-xs underline underline-offset-2 transition-colors hover:text-[var(--onside-live-text)]"
                    >
                      Esqueci minha senha
                    </Link>
                  }
                />
              )}
            </form.Field>

            <button
              type="submit"
              disabled={isLoading}
              className="onside-btn onside-btn-acid onside-btn-full mt-2"
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
                'Acessar minha conta'
              )}
            </button>

            <p className="text-center text-[var(--onside-muted)] text-xs">
              Ao entrar, você acessa o app Onside com sua conta.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
