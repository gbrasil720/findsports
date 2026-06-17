import { Mail01Icon } from '@hugeicons/core-free-icons'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import { Logo } from '@/components/landing/logo'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/login')({
  head: () => ({
    meta: [
      { title: 'Entrar — FindSports' },
      {
        name: 'description',
        content:
          'Entre na sua conta FindSports e encontre o bar certo pro seu jogo.'
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

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setIsLoading(true)
      const { error } = await authClient.signIn.email({
        email: value.email,
        password: value.password
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

  return (
    <div className="flex min-h-dvh font-body">
      <AuthBrandPanel variant="login">
        <div className="mb-3 font-mono text-[10px] text-brand-orange uppercase tracking-[0.3em]">
          ● Área exclusiva
        </div>
        <h2 className="mb-6 font-bold font-heading text-4xl text-white leading-[0.9] tracking-tight xl:text-5xl">
          O JOGO <span className="text-brand-orange">COMEÇA AQUI.</span>
        </h2>
        <p className="max-w-xs text-base text-zinc-400 leading-relaxed">
          Entre na sua conta e faça parte do maior mapa de bares esportivos do
          Brasil.
        </p>
      </AuthBrandPanel>

      <main className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 sm:px-10 lg:px-16">
        <Link to="/" className="mb-10 flex items-center gap-2.5 lg:hidden">
          <Logo className="size-9" />
          <span className="font-bold font-heading text-xl tracking-tight">
            FindSports
          </span>
        </Link>

        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <h1 className="mb-2 font-bold font-heading text-3xl tracking-tight sm:text-4xl">
              DE VOLTA AO <span className="text-brand-orange">JOGO.</span>
            </h1>
            <p className="text-sm text-zinc-500">
              Não tem conta?{' '}
              <Link
                to="/signup"
                className="font-semibold text-black underline underline-offset-2 transition-colors hover:text-brand-orange"
              >
                Cadastre-se grátis
              </Link>
            </p>
          </div>

          <form
            className="flex flex-col gap-4"
            noValidate
            onFocus={() => analytics.signupStarted()}
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
            <form.Field name="email">
              {(field) => (
                <AuthInputField
                  label="E-mail"
                  icon={Mail01Icon}
                  field={field}
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                />
              )}
            </form.Field>

            <form.Field name="password">
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
                    <a
                      href="#"
                      className="text-xs text-zinc-500 transition-colors hover:text-brand-orange"
                    >
                      Esqueceu a senha?
                    </a>
                  }
                />
              )}
            </form.Field>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full cursor-pointer rounded-xl bg-black py-4 font-bold text-sm text-white uppercase tracking-[0.2em] ring-offset-white transition-all duration-300 hover:bg-brand-orange hover:ring-4 hover:ring-brand-orange/50 hover:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-black disabled:hover:ring-0"
            >
              {isLoading ? 'Acessando...' : 'Acessar minha conta'}
            </button>

            <p className="text-center text-xs text-zinc-400">
              Ao entrar você concorda com nossos{' '}
              <a
                href="#"
                className="underline underline-offset-2 transition-colors hover:text-black"
              >
                Termos de Uso
              </a>
              .
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
