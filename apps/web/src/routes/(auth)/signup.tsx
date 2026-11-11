import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import Loader from 'reicon-react/icons/Loader'
import User from 'reicon-react/icons/User'
import { toast } from 'sonner'

import { revalidateShownError } from '@/components/auth-field-change'
import { AuthInputField } from '@/components/auth-input-field'
import { AuthPasswordField } from '@/components/auth-password-field'
import {
  type AuthPanel,
  AuthShell,
  VisitorLink
} from '@/components/entrada/auth-shell'
import { Beer, People } from '@/components/landing/v3/icons'
import { LegalConsent } from '@/components/legal/legal-consent'
import { useTurnstile } from '@/components/turnstile'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { pageHead } from '@/lib/page-head'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useCallbackUrl, withCallbackUrl } from '@/utils/callback-url'

export const Route = createFileRoute('/(auth)/signup')({
  // `?role=pub` abre o cadastro com "Tenho um bar" marcado: é para onde a
  // landing manda o bar (WEB-232). O destino pós-cadastro segue na URL.
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search.role === 'pub' ? { role: 'pub' as const } : {}),
    ...(typeof search.callbackUrl === 'string'
      ? { callbackUrl: search.callbackUrl }
      : {})
  }),
  head: () =>
    pageHead({
      path: '/signup',
      title: 'Criar conta — Onside',
      description:
        'Crie sua conta no Onside e nunca mais perca o apito inicial.',
      indexable: false
    }),
  component: SignupPage
})

/**
 * As regras de cada campo, num lugar só e rodando duas vezes: no `blur` e no
 * envio. Antes elas viviam duplicadas — uma cópia no validador do campo, para
 * o `blur`, e outra dentro do `onSubmit`, que só sabia produzir toast. Enviar
 * o formulário vazio não acendia nenhum erro sob os campos.
 */
const ROLES = [
  {
    value: 'fan',
    title: 'Sou torcedor',
    text: 'Achar bar, marcar que vai e ganhar a oferta da casa.',
    Icon: People
  },
  {
    value: 'pub',
    title: 'Tenho um bar',
    text: `Publicar jogos e encher a casa. ${ONBOARDING_TRIAL.days} dias de Elite grátis.`,
    Icon: Beer
  }
] as const

const FAN_PANEL: AuthPanel = {
  kind: 'board',
  led: 'crowd',
  kicker: 'Conta de torcedor · grátis',
  title: (
    <>
      Escolha o jogo. <span>A gente acha o bar.</span>
    </>
  ),
  cards: [
    [
      'Ache o bar do jogo',
      'Busque o time ou a liga e veja quem vai passar, perto de você.'
    ],
    [
      'Marque que vai',
      'Seus amigos veem, e o bar se prepara pra receber a galera.'
    ],
    ['Oferta da casa', 'Nos bares Elite, o código do balcão libera a oferta.'],
    ['Medalhas', 'Cada bar novo vira uma medalha na sua estante.']
  ]
}

const PUB_PANEL: AuthPanel = {
  kind: 'board',
  led: 'crowd',
  kicker: `Conta de bar · ${ONBOARDING_TRIAL.days} dias grátis`,
  title: (
    <>
      Encha a casa <span>em dia de jogo.</span>
    </>
  ),
  cards: [
    [
      'Grade em minutos',
      'Escolha o jogo no catálogo, marque telão e som e publique.'
    ],
    [
      'Apareça pra quem procura',
      'Quem busca o jogo perto de você encontra o seu bar.'
    ],
    [
      'Quem vai, quem chegou',
      'Veja quantos marcaram que vão e quantos códigos o balcão validou.'
    ],
    [
      `${ONBOARDING_TRIAL.days} dias de Elite`,
      'Grátis, sem cartão. Depois do teste, você escolhe o plano.'
    ]
  ]
}

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
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [role, setRole] = useState<'fan' | 'pub'>(
    Route.useSearch().role ?? 'fan'
  )
  const formRef = useRef<HTMLFormElement>(null)
  const captcha = useTurnstile()

  const callbackUrl = useCallbackUrl()

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
      const { data, error } = await authClient.signUp.email({
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
      analytics.signupCompleted(role, data.user.id)
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
    <AuthShell panel={role === 'pub' ? PUB_PANEL : FAN_PANEL}>
      <div className="w-full">
        <div className="mb-8">
          <h1 className="onside-display">
            Crie sua{' '}
            <span className="text-[var(--onside-live-text)]">conta</span>
          </h1>
          <p className="ent-sub">
            Grátis, pelo navegador, sem baixar nada. Leva menos de um minuto.
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
            <legend className="onside-label">Quem é você</legend>
            <div className="ent-role">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={role === r.value}
                  onClick={() => setRole(r.value)}
                >
                  <span className="ic">
                    <r.Icon />
                  </span>
                  <b>{r.title}</b>
                  <span>{r.text}</span>
                </button>
              ))}
            </div>
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
            // "As senhas não coincidem." também se corrige por aqui.
            listeners={{
              onChange: () => revalidateShownError(form, 'confirm')
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
                Criando conta…
              </>
            ) : role === 'pub' ? (
              'Criar conta do bar'
            ) : (
              'Criar conta'
            )}
          </button>

          <p className="ent-alt">
            Já tem conta? <Link to="/login">Entrar</Link>
          </p>
          {captcha.widget}
        </form>
        <VisitorLink />
      </div>
    </AuthShell>
  )
}
