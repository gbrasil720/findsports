import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import {
  DrinkIcon,
  Fire02Icon,
  Mail01Icon,
  User02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'

import { AuthBrandCopy } from '@/components/auth-brand-copy'
import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import { Logo } from '@/components/landing/logo'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/signup')({
  head: () => ({
    meta: [
      { title: 'Criar conta — FindSports' },
      {
        name: 'description',
        content:
          'Crie sua conta no FindSports e nunca mais perca o apito inicial.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: SignupPage
})

function SignupPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [role, setRole] = useState<'fan' | 'pub'>('fan')

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', confirm: '' },
    onSubmit: async ({ value }) => {
      if (value.password !== value.confirm) {
        toast.error('As senhas não coincidem.')
        return
      }
      if (value.password.length < 8) {
        toast.error('A senha deve ter pelo menos 8 caracteres.')
        return
      }
      setIsLoading(true)
      const { error } = await authClient.signUp.email({
        name: value.name,
        email: value.email,
        password: value.password,
        role
      })
      setIsLoading(false)
      if (error) {
        toast.error(error.message ?? 'Erro ao criar conta. Tente novamente.')
        return
      }
      analytics.signupCompleted(role)
      toast.success('Conta criada! Bem-vindo ao time.')
      navigate({ to: '/dashboard' })
    }
  })

  return (
    <div className="flex min-h-dvh font-body">
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
              ENTRE NO <span className="text-brand-orange">TIME TITULAR.</span>
            </h1>
            <p className="text-sm text-zinc-500">
              Já tem conta?{' '}
              <Link
                to="/login"
                className="font-semibold text-black underline underline-offset-2 transition-colors hover:text-brand-orange"
              >
                Entrar agora
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
            <div className="flex flex-col gap-1.5">
              <span className="font-semibold text-xs text-zinc-700 uppercase tracking-wider">
                Sou um
              </span>
              <ToggleGroup
                value={[role]}
                onValueChange={(values) => {
                  if (values.length > 0)
                    setRole(values[values.length - 1] as 'fan' | 'pub')
                }}
                className="grid w-full grid-cols-2 rounded-xl bg-zinc-100 p-1"
              >
                <ToggleGroupItem
                  value="fan"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold text-sm text-zinc-500 uppercase tracking-wider transition-all hover:text-zinc-700 aria-pressed:bg-white aria-pressed:text-brand-orange aria-pressed:shadow-sm"
                >
                  <HugeiconsIcon
                    icon={Fire02Icon}
                    size={15}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  Torcedor
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="pub"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 font-bold text-sm text-zinc-500 uppercase tracking-wider transition-all hover:text-zinc-700 aria-pressed:bg-white aria-pressed:text-brand-blue aria-pressed:shadow-sm"
                >
                  <HugeiconsIcon
                    icon={DrinkIcon}
                    size={15}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  Dono de Bar
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <form.Field name="name">
              {(field) => (
                <AuthInputField
                  label="Nome completo"
                  icon={User02Icon}
                  field={field}
                  id="name"
                  type="text"
                  placeholder="Seu nome completo"
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              )}
            </form.Field>

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
                  maxLength={255}
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
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  required
                  showPassword={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
              )}
            </form.Field>

            <form.Field name="confirm">
              {(field) => (
                <AuthPasswordField
                  label="Confirmar senha"
                  field={field}
                  id="confirm"
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  required
                  showPassword={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                />
              )}
            </form.Field>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full cursor-pointer rounded-xl bg-black py-4 font-bold text-sm text-white uppercase tracking-[0.2em] ring-offset-white transition-all duration-300 hover:bg-brand-orange hover:ring-4 hover:ring-brand-orange/50 hover:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-black disabled:hover:ring-0"
            >
              {isLoading ? 'Entrando no time...' : 'Entrar no time'}
            </button>

            <p className="text-center text-xs text-zinc-400">
              Ao criar conta você concorda com nossos{' '}
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

      <AuthBrandPanel variant="signup">
        <AuthBrandCopy role={role} />
      </AuthBrandPanel>
    </div>
  )
}
