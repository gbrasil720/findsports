import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import {
  createFileRoute,
  Link,
  useLocation,
  useNavigate
} from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import Fire from 'reicon-react/icons/Fire'
import Loader from 'reicon-react/icons/Loader'
import Store from 'reicon-react/icons/Store'
import User from 'reicon-react/icons/User'
import { toast } from 'sonner'

import { AuthBrandCopy } from '@/components/auth-brand-copy'
import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { getCallbackUrl } from '@/utils/callback-url'
import { useTRPC } from '@/utils/trpc'

const PENDING_VERIFICATION_KEY = 'onside:pending-verification'

export const Route = createFileRoute('/(auth)/signup')({
  head: () => ({
    meta: [
      { title: 'Criar conta — Onside' },
      {
        name: 'description',
        content: 'Crie sua conta no Onside e nunca mais perca o apito inicial.'
      },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: SignupPage
})

function SignupPage() {
  const navigate = useNavigate()
  const { href } = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [role, setRole] = useState<'fan' | 'pub'>('fan')
  const formRef = useRef<HTMLFormElement>(null)

  const callbackUrl = getCallbackUrl(href)

  // ESC-19: quem recusa é o portão no servidor (`api/auth/$`); isto só evita
  // que a pessoa preencha o cadastro inteiro para levar um erro no fim.
  // Enquanto carrega, o padrão é ABERTO: se a leitura falhar, esconder o
  // aviso é melhor do que anunciar um bloqueio que talvez não exista.
  const trpc = useTRPC()
  const configQuery = useQuery(trpc.appConfig.getPublic.queryOptions())
  const portaoFechado =
    configQuery.data?.['launch.waitlist_gate'].signup ?? false

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', confirm: '' },
    onSubmit: async ({ value }) => {
      const name = value.name.trim()
      const email = value.email.trim()
      const password = value.password
      const confirm = value.confirm

      if (!name) {
        toast.error('Informe seu nome completo.')
        focusFirstInvalid()
        return
      }
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast.error('Informe um e-mail válido.')
        focusFirstInvalid()
        return
      }
      if (password !== confirm) {
        toast.error('As senhas não coincidem.')
        focusFirstInvalid()
        return
      }
      if (password.length < 8) {
        toast.error('A senha deve ter pelo menos 8 caracteres.')
        focusFirstInvalid()
        return
      }

      setIsLoading(true)
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        role,
        callbackURL: '/verify-email?confirmed=1'
      })
      setIsLoading(false)
      if (error) {
        toast.error(error.message ?? 'Erro ao criar conta. Tente novamente.')
        return
      }
      analytics.signupCompleted(role)
      sessionStorage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify({ email, role, callbackUrl })
      )
      toast.success('Enviamos um link de confirmação para o seu e-mail.')
      navigate({ to: role === 'pub' ? '/onboarding/pub' : '/verify-email' })
    }
  })

  function focusFirstInvalid() {
    const root = formRef.current
    if (!root) return
    const first = root.querySelector<HTMLElement>(
      'input[aria-invalid="true"], input:invalid'
    )
    first?.focus()
  }

  return (
    <div className="onside-app flex min-h-dvh">
      <main className="flex flex-1 flex-col items-center justify-center bg-[var(--onside-paper)] px-4 py-10 sm:px-10 lg:px-16">
        <div className="mb-8 w-full max-w-[420px] border-[var(--onside-ink)] border-b pb-6 lg:hidden">
          <Link to="/" aria-label="Onside — página inicial">
            <OnsideBrand />
          </Link>
          <p className="mt-4 max-w-[28ch] text-sm text-[var(--onside-muted)]">
            Entre no time e ache o bar certo pro jogo.
          </p>
        </div>

        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <p className="onside-kicker mb-3">Criar conta</p>
            <h1 className="onside-display mb-3 text-[42px] sm:text-5xl md:text-[56px]">
              ENTRE NO{' '}
              <span className="text-[var(--onside-live-text)]">
                TIME TITULAR.
              </span>
            </h1>
            <p className="text-sm text-[var(--onside-muted)]">
              Já tem conta?{' '}
              <Link
                to="/login"
                className="font-semibold text-[var(--onside-ink)] underline underline-offset-2 transition-colors hover:text-[var(--onside-live-text)]"
              >
                Entrar agora
              </Link>
            </p>
          </div>

          {portaoFechado ? (
            <div
              className="onside-callout onside-callout-warn mb-6"
              role="status"
            >
              <p className="text-sm font-semibold">
                A Onside está abrindo por convite.
              </p>
              <p className="text-sm">
                Só quem já teve o acesso liberado consegue criar conta agora.{' '}
                <Link
                  to="/"
                  className="font-semibold underline underline-offset-2"
                >
                  Entre na lista de espera
                </Link>{' '}
                e avisamos assim que for a sua vez.
              </p>
            </div>
          ) : null}

          <form
            ref={formRef}
            className="flex flex-col gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
            <fieldset className="flex flex-col gap-1.5 border-0 p-0">
              <legend className="onside-label mb-0">Sou um</legend>
              <ToggleGroup
                value={[role]}
                onValueChange={(values) => {
                  if (values.length > 0)
                    setRole(values[values.length - 1] as 'fan' | 'pub')
                }}
                className="grid w-full grid-cols-2 gap-3"
                aria-label="Tipo de conta"
              >
                <ToggleGroupItem
                  value="fan"
                  className="onside-choice min-h-12 flex-row items-center justify-center gap-2 rounded-none border-[1.5px] border-[var(--onside-ink)] px-3 py-3 font-bold text-sm uppercase tracking-wider aria-pressed:bg-[var(--onside-acid)] aria-pressed:text-[var(--onside-ink)] aria-pressed:shadow-[3px_3px_0_var(--onside-ink)] data-[state=on]:bg-[var(--onside-acid)]"
                >
                  <Fire size={15} color="currentColor" aria-hidden="true" />
                  Torcedor
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="pub"
                  className="onside-choice min-h-12 flex-row items-center justify-center gap-2 rounded-none border-[1.5px] border-[var(--onside-ink)] px-3 py-3 font-bold text-sm uppercase tracking-wider aria-pressed:bg-[var(--onside-acid)] aria-pressed:text-[var(--onside-ink)] aria-pressed:shadow-[3px_3px_0_var(--onside-ink)] data-[state=on]:bg-[var(--onside-acid)]"
                >
                  <Store size={15} color="currentColor" aria-hidden="true" />
                  Dono de Bar
                </ToggleGroupItem>
              </ToggleGroup>
            </fieldset>

            <form.Field
              name="name"
              validators={{
                onBlur: ({ value }) =>
                  value.trim() ? undefined : 'Informe seu nome completo.'
              }}
            >
              {(field) => (
                <AuthInputField
                  label="Nome completo"
                  icon={User}
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
                  maxLength={255}
                  required
                />
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onBlur: ({ value }) => {
                  if (!value) return 'Informe uma senha.'
                  if (value.length < 8)
                    return 'A senha deve ter pelo menos 8 caracteres.'
                  return undefined
                }
              }}
            >
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

            <form.Field
              name="confirm"
              validators={{
                onBlur: ({ value, fieldApi }) => {
                  const password = fieldApi.form.getFieldValue('password')
                  if (!value) return 'Confirme sua senha.'
                  if (value !== password) return 'As senhas não coincidem.'
                  return undefined
                }
              }}
            >
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
                  Criando conta…
                </>
              ) : (
                'Entrar no time'
              )}
            </button>

            <p className="text-center text-[var(--onside-muted)] text-xs">
              Ao criar conta, você passa a usar o app Onside com o perfil
              escolhido.
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
