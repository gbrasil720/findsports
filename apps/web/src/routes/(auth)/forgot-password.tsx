import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import EnvelopeCheck from 'reicon-react/icons/EnvelopeCheck'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'

import { AuthInputField } from '@/components/auth-input-field'
import {
  type AuthPanel,
  AuthShell,
  VisitorLink
} from '@/components/entrada/auth-shell'
import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { pageHead } from '@/lib/page-head'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/**
 * Para onde o link do e-mail leva depois que o better-auth valida o token.
 * Caminho relativo de propósito: o `originCheck` aceita relativo e resolve
 * contra a base configurada, então isto continua certo em preview, produção
 * e local sem lista de origens paralela.
 */
const REDIRECT_APOS_TOKEN = '/reset-password'

const PANEL: AuthPanel = {
  kind: 'board',
  led: 'scarf',
  kicker: 'Enquanto isso',
  title: (
    <>
      Bora <span>voltar.</span>
    </>
  ),
  cards: [
    [
      'A grade de hoje continua aberta',
      'Os jogos e os bares estão aí, mesmo sem entrar na conta.'
    ],
    [
      'Nada se perde',
      'Jogos marcados, medalhas e avaliações continuam na sua conta.'
    ]
  ]
}

export const Route = createFileRoute('/(auth)/forgot-password')({
  head: () =>
    pageHead({
      path: '/forgot-password',
      title: 'Recuperar senha — Onside',
      description:
        'Receba um link para definir uma nova senha da sua conta Onside.',
      indexable: false
    }),
  component: ForgotPasswordPage
})

function validateEmail({ value }: { value: string }) {
  const trimmed = value.trim()
  if (!trimmed) return 'Informe seu e-mail.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Informe um e-mail válido.'
  }
  return undefined
}

function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const captcha = useTurnstile()

  const form = useForm({
    defaultValues: { email: '' },
    onSubmitInvalid: () => focusFirstInvalid(),
    onSubmit: async ({ value }) => {
      const email = value.email.trim()
      setIsLoading(true)
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: REDIRECT_APOS_TOKEN,
        fetchOptions: captcha.fetchOptions
      })
      setIsLoading(false)
      captcha.reset()
      if (error) {
        // O servidor responde 200 tanto para e-mail cadastrado quanto para
        // desconhecido, então um erro aqui é limite de tentativas, captcha ou
        // falha de envio — nunca "essa conta não existe". A mensagem não pode
        // sugerir o contrário.
        //
        // As mensagens do better-auth vêm em inglês; o texto exibido é nosso.
        toast.error(
          error.status === 429
            ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
            : getUserFacingMessage(
                error,
                'Não foi possível enviar agora. Tente de novo em instantes.'
              )
        )
        return
      }
      setEmailEnviado(email)
    }
  })

  function focusFirstInvalid() {
    const root = formRef.current
    if (!root) return
    root
      .querySelector<HTMLElement>(
        'input[aria-invalid="true"], input:invalid, input:required:placeholder-shown'
      )
      ?.focus()
  }

  return (
    <AuthShell panel={PANEL}>
      <div className="w-full">
        {emailEnviado ? (
          <EmailEnviado
            email={emailEnviado}
            onTentarOutro={() => {
              setEmailEnviado(null)
              form.reset()
            }}
          />
        ) : (
          <>
            <div className="mb-8">
              <h1 className="onside-display">
                Esqueceu{' '}
                <span className="text-[var(--onside-live-text)]">a senha?</span>
              </h1>
              <p className="ent-sub">
                Acontece. Informe o e-mail da sua conta e mandamos um link para
                você definir uma nova.
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
              <form.Field
                name="email"
                validators={{
                  onBlur: validateEmail,
                  onSubmit: validateEmail
                }}
              >
                {(field) => (
                  <AuthInputField
                    label="E-mail da conta"
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
                    Enviando…
                  </>
                ) : (
                  'Enviar link de recuperação'
                )}
              </button>

              <p className="ent-alt">
                Lembrou? <Link to="/login">Entrar</Link>
              </p>

              {captcha.widget}
            </form>

            <div className="ent-how">
              <p>Como funciona</p>
              <ol>
                <li>
                  <i>1</i>
                  <span>
                    Chega um e-mail da Onside com o link para a senha nova.
                  </span>
                </li>
                <li>
                  <i>2</i>
                  <span>O link vale por 30 minutos e só funciona uma vez.</span>
                </li>
                <li>
                  <i>3</i>
                  <span>
                    Até lá, sua senha atual continua valendo. Com a nova salva,
                    você entra de novo.
                  </span>
                </li>
              </ol>
            </div>
            <div className="ent-help">
              <Envelope size={22} color="currentColor" aria-hidden="true" />
              <span>
                <b>Não usa mais esse e-mail?</b>
                Escreva para{' '}
                <a href="mailto:contato@onside.sh">contato@onside.sh</a> do
                e-mail que você usa hoje, e a gente ajuda a recuperar a conta.
              </span>
            </div>
            <VisitorLink />
          </>
        )}
      </div>
    </AuthShell>
  )
}

/**
 * A confirmação nunca afirma que o e-mail existe — só que, se existir, o link
 * saiu. É o mesmo contrato do servidor, e é o que impede a tela de virar um
 * verificador de contas cadastradas.
 */
function EmailEnviado({
  email,
  onTentarOutro
}: {
  email: string
  onTentarOutro: () => void
}) {
  return (
    <div aria-live="polite">
      <div className="ent-mail">
        <EnvelopeCheck size={30} color="currentColor" aria-hidden="true" />
      </div>
      <p className="onside-kicker">Link a caminho</p>
      <h1 className="onside-display mb-3">
        CONFIRA SUA{' '}
        <span className="text-[var(--onside-live-text)]">
          CAIXA DE ENTRADA.
        </span>
      </h1>
      <p className="text-sm text-[var(--onside-muted)] leading-relaxed">
        Se <strong className="text-[var(--onside-ink)]">{email}</strong> estiver
        cadastrado na Onside, o link para definir uma nova senha já saiu.
      </p>
      <ul className="my-7 grid gap-3 text-sm text-[var(--onside-muted)]">
        <li className="border-[var(--onside-line)] border-l-2 pl-3">
          O link vale por{' '}
          <strong className="text-[var(--onside-ink)]">30 minutos</strong> e só
          pode ser usado uma vez.
        </li>
        <li className="border-[var(--onside-line)] border-l-2 pl-3">
          Não achou? Procure em spam ou promoções antes de pedir outro.
        </li>
        <li className="border-[var(--onside-line)] border-l-2 pl-3">
          Sua senha atual continua valendo enquanto o link não for usado.
        </li>
      </ul>
      <div className="flex flex-col gap-3">
        <Link to="/login" className="onside-btn onside-btn-acid ent-full">
          Voltar ao login
        </Link>
        <button
          type="button"
          onClick={onTentarOutro}
          className="onside-btn onside-btn-outline ent-full"
        >
          Usar outro e-mail
        </button>
      </div>
    </div>
  )
}
