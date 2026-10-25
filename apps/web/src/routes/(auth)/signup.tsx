import {
  ONBOARDING_TRIAL,
  PLAN_NAMES
} from '@findsports_oficial/api/lib/plan-limits'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  AuthSplit,
  CampoForm,
  CampoSenha,
  CardTorcedor,
  Disp,
  entradaHead,
  ForcaSenha,
  ItensFoto
} from '@/components/entrada/auth'
import { Botao } from '@/components/painel'
import { useTurnstile } from '@/components/turnstile'
import { analytics } from '@/lib/analytics'
import { authClient } from '@/lib/auth-client'
import { PENDING_VERIFICATION_KEY } from '@/lib/pending-verification'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useCallbackUrl, withCallbackUrl } from '@/utils/callback-url'

const ITENS_FOTO = [
  ['cal', 'Divulgue sua programação de jogos'],
  ['map', 'Apareça pra torcedores perto de você'],
  ['people', 'Veja quem vai assistir, jogo a jogo'],
  ['ticket', 'Ofereça algo a quem chega pela Onside']
] as const

export const Route = createFileRoute('/(auth)/signup')({
  // O cadastro do web é sempre de bar (decisão do dono, 24/10/2026).
  // `?role=pub` dos links antigos da landing e do guia segue aceito e não
  // muda nada. O destino pós-cadastro segue na URL.
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search.role === 'pub' ? { role: 'pub' as const } : {}),
    ...(typeof search.callbackUrl === 'string'
      ? { callbackUrl: search.callbackUrl }
      : {})
  }),
  head: () =>
    entradaHead({
      path: '/signup',
      title: 'Cadastrar meu bar — Onside',
      description:
        'Cadastre seu bar na Onside em 1 minuto e apareça para os torcedores perto de você.',
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

function SignupPage() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const captcha = useTurnstile()

  const callbackUrl = useCallbackUrl()

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
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
        role: 'pub',
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
      analytics.signupCompleted('pub', data.user.id)
      sessionStorage.setItem(
        PENDING_VERIFICATION_KEY,
        JSON.stringify({ email, role: 'pub' })
      )
      toast.success('Enviamos um link de confirmação para o seu e-mail.')
      navigate({ to: withCallbackUrl('/onboarding/pub', callbackUrl) })
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
    <AuthSplit
      foto={
        <>
          <ItensFoto itens={ITENS_FOTO} />
          <Disp
            nivel={0}
            tamanho={60}
            linhas={[
              { texto: 'Vamos lotar sua casa' },
              { texto: 'nos próximos clássicos.', tint: true }
            ]}
          />
        </>
      }
    >
      <p className="entrada-kicker">Conta de bar · 1 minuto</p>
      <Disp tamanho={56} linhas={[{ texto: 'Cadastrar meu bar' }]} />
      <p className="entrada-linha">
        Já tem conta?{' '}
        <Link
          to="/login"
          search={callbackUrl === '/admin' ? {} : { callbackUrl }}
          className="entrada-link"
        >
          Entrar
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
        <form.Field
          name="name"
          validators={{ onBlur: validateName, onSubmit: validateName }}
        >
          {(field) => (
            <CampoForm
              field={field}
              rotulo="Seu nome"
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
            <CampoForm
              field={field}
              rotulo="E-mail do responsável"
              id="email"
              type="email"
              inputMode="email"
              spellCheck={false}
              placeholder="voce@seubar.com.br"
              autoComplete="email"
              maxLength={255}
              required
            />
          )}
        </form.Field>

        <form.Field
          name="password"
          validators={{ onBlur: validatePassword, onSubmit: validatePassword }}
        >
          {(field) => (
            <>
              <CampoSenha
                field={field}
                rotulo="Senha"
                id="password"
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                required
              />
              <ForcaSenha senha={field.state.value} />
            </>
          )}
        </form.Field>

        <label className="entrada-aceite">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
          />
          {/* O design diz "Termos para Estabelecimentos": o documento é um
              só, os Termos de Uso, que valem para torcedor e bar. */}
          <span>
            Li e aceito os{' '}
            <Link to="/termos" target="_blank" rel="noopener">
              Termos de Uso
            </Link>{' '}
            e a{' '}
            <Link to="/privacidade" target="_blank" rel="noopener">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>

        <Botao
          type="submit"
          variante="acid"
          disabled={isLoading || !acceptedTerms}
          className="entrada-cta"
        >
          {isLoading ? 'Criando conta…' : 'Criar conta do bar'}
        </Botao>

        <p className="entrada-nota">
          Depois disso: dados do bar, características e o bar no ar com{' '}
          {PLAN_NAMES[ONBOARDING_TRIAL.plan]} grátis por {ONBOARDING_TRIAL.days}{' '}
          dias.
        </p>
        {captcha.widget}
      </form>

      <CardTorcedor />
    </AuthSplit>
  )
}
