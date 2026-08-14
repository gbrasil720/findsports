import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'

import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'

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

function LoginPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      const email = value.email.trim()
      const password = value.password
      if (!email || !password) {
        toast.error('Preencha e-mail e senha para continuar.')
        focusFirstInvalid()
        return
      }
      setIsLoading(true)
      const { error } = await authClient.signIn.email({
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
      analytics.signinCompleted()
      toast.success('Bem-vindo de volta!')
      navigate({ to: '/dashboard' })
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
        <p className="onside-text-muted-on-ink max-w-xs text-base leading-relaxed">
          Entre na sua conta e faça parte do maior mapa de bares esportivos do
          Brasil.
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
            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => {
                  const v = value.trim()
                  if (!v) return 'Informe seu e-mail.'
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
                    return 'Informe um e-mail válido.'
                  return undefined
                }
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
                onBlur: ({ value }) =>
                  value ? undefined : 'Informe sua senha.'
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
