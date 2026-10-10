import {
  ToggleGroup,
  ToggleGroupItem
} from '@findsports_oficial/ui/components/toggle-group'
import { useForm } from '@tanstack/react-form'
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
import { LegalConsent } from '@/components/legal/legal-consent'
import { useTurnstile } from '@/components/turnstile'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { getCallbackUrl, withCallbackUrl } from '@/utils/callback-url'

export const Route = createFileRoute('/(auth)/signup')({
  // `?role=pub` abre o cadastro com "Dono de Bar" marcado: é para onde a
  // landing manda o bar (WEB-232). O destino pós-cadastro segue na URL.
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search.role === 'pub' ? { role: 'pub' as const } : {}),
    ...(typeof search.callbackUrl === 'string'
      ? { callbackUrl: search.callbackUrl }
      : {})
  }),
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

/**
 * As regras de cada campo, num lugar só e rodando duas vezes: no `blur` e no
 * envio. Antes elas viviam duplicadas — uma cópia no validador do campo, para
 * o `blur`, e outra dentro do `onSubmit`, que só sabia produzir toast. Enviar
 * o formulário vazio não acendia nenhum erro sob os campos.
 */
function validateName({ value }: { value: string }) {
  return value.trim() ? undefined : 'Informe seu nome completo.'
}

function validateEmail({ value }: { value: string }) {
  const trimmed = value.trim()
  if (!trimmed) return 'Informe seu e-mail.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Informe um e-mail válido.'
  }
  return undefined
}

function validatePassword({ value }: { value: string }) {
  if (!value) return 'Informe uma senha.'
  if (value.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  return undefined
}

function validateConfirm({
  value,
  fieldApi
}: {
  value: string
  fieldApi: { form: { getFieldValue: (name: 'password') => string } }
}) {
  if (!value) return 'Confirme sua senha.'
  if (value !== fieldApi.form.getFieldValue('password')) {
    return 'As senhas não coincidem.'
  }
  return undefined
}

function SignupPage() {
  const navigate = useNavigate()
  const { href } = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [role, setRole] = useState<'fan' | 'pub'>(
    Route.useSearch().role ?? 'fan'
  )
  const formRef = useRef<HTMLFormElement>(null)
  const captcha = useTurnstile()

  const callbackUrl = getCallbackUrl(href)

  const form = useForm({
    defaultValues: { name: '', email: '', password: '', confirm: '' },
    // Envio inválido leva o foco ao primeiro campo com erro. As regras vivem
    // nos validadores dos campos, que rodam no `blur` e no envio — assim a
    // mensagem aparece embaixo do campo em vez de só passar num toast.
    onSubmitInvalid: () => focusFirstInvalid(),
    onSubmit: async ({ value }) => {
      const name = value.name.trim()
      const email = value.email.trim()
      const password = value.password

      setIsLoading(true)
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        role,
        callbackURL: withCallbackUrl('/verify-email?confirmed=1', callbackUrl),
        fetchOptions: captcha.fetchOptions
      })
      setIsLoading(false)
      captcha.reset()
      if (error) {
        toast.error(
          getUserFacingMessage(
            error,
            'Não foi possível criar sua conta. Tente novamente.'
          )
        )
        return
      }
      analytics.signupCompleted(role)
      sessionStorage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify({ email, role })
      )
      toast.success('Enviamos um link de confirmação para o seu e-mail.')
      navigate({
        to:
          role === 'pub'
            ? '/onboarding/pub'
            : withCallbackUrl('/verify-email', callbackUrl)
      })
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
              validators={{ onBlur: validateName, onSubmit: validateName }}
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
              validators={{ onBlur: validateEmail, onSubmit: validateEmail }}
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
                onBlur: validatePassword,
                onSubmit: validatePassword
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
                onBlur: validateConfirm,
                onSubmit: validateConfirm
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

            <LegalConsent
              checked={acceptedTerms}
              onCheckedChange={setAcceptedTerms}
            />

            <button
              type="submit"
              disabled={isLoading || !acceptedTerms}
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
            {captcha.widget}
          </form>
        </div>
      </main>

      <AuthBrandPanel variant="signup">
        <AuthBrandCopy role={role} />
      </AuthBrandPanel>
    </div>
  )
}
