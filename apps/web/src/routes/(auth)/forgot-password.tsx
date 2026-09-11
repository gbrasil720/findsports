import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import EnvelopeCheck from 'reicon-react/icons/EnvelopeCheck'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'

import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthInputField } from '@/components/auth-input-field'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { authClient } from '@/lib/auth-client'

/**
 * Para onde o link do e-mail leva depois que o better-auth valida o token.
 * Caminho relativo de propósito: o `originCheck` aceita relativo e resolve
 * contra a base configurada, então isto continua certo em preview, produção
 * e local sem lista de origens paralela.
 */
const REDIRECT_APOS_TOKEN = '/reset-password'

export const Route = createFileRoute('/(auth)/forgot-password')({
  head: () => ({
    meta: [
      { title: 'Recuperar senha — Onside' },
      {
        name: 'description',
        content:
          'Receba um link para definir uma nova senha da sua conta Onside.'
      },
      { name: 'robots', content: 'noindex' }
    ]
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

  const form = useForm({
    defaultValues: { email: '' },
    onSubmitInvalid: () => focusFirstInvalid(),
    onSubmit: async ({ value }) => {
      const email = value.email.trim()
      setIsLoading(true)
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: REDIRECT_APOS_TOKEN
      })
      setIsLoading(false)
      if (error) {
        // O servidor responde 200 tanto para e-mail cadastrado quanto para
        // desconhecido, então um erro aqui é limite de tentativas ou falha de
        // envio — nunca "essa conta não existe". A mensagem não pode sugerir
        // o contrário.
        //
        // As mensagens do better-auth vêm em inglês; o texto exibido é nosso.
        toast.error(
          error.status === 429
            ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
            : 'Não foi possível enviar agora. Tente de novo em instantes.'
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
    <div className="onside-app flex min-h-dvh">
      <AuthBrandPanel variant="login">
        <div className="mb-3 flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-acid)] uppercase tracking-[0.16em]">
          <span className="onside-live-dot" aria-hidden="true" />
          Recuperação de acesso
        </div>
        <h2 className="onside-display mb-6 text-4xl text-[var(--onside-paper)] xl:text-5xl">
          ESQUECEU?{' '}
          <span className="text-[var(--onside-acid)]">SEM DRAMA.</span>
        </h2>
        <p className="onside-text-muted-on-ink max-w-xs text-base leading-relaxed">
          Mandamos um link no seu e-mail e você volta a campo em um minuto.
        </p>
      </AuthBrandPanel>

      <main className="flex flex-1 flex-col items-center justify-center bg-[var(--onside-paper)] px-4 py-10 sm:px-10 lg:px-16">
        <div className="mb-8 w-full max-w-[420px] border-[var(--onside-ink)] border-b pb-6 lg:hidden">
          <Link to="/" aria-label="Onside — página inicial">
            <OnsideBrand />
          </Link>
          <p className="mt-4 max-w-[28ch] text-sm text-[var(--onside-muted)]">
            Recupere o acesso e volte pro{' '}
            <span className="font-semibold text-[var(--onside-ink)]">jogo</span>
            .
          </p>
        </div>

        <div className="w-full max-w-[420px]">
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
                <p className="onside-kicker mb-3">Recuperar senha</p>
                <h1 className="onside-display mb-3 text-[42px] sm:text-5xl md:text-[56px]">
                  VAMOS DE{' '}
                  <span className="text-[var(--onside-live-text)]">
                    NOVA SENHA.
                  </span>
                </h1>
                <p className="text-sm text-[var(--onside-muted)]">
                  Informe o e-mail da sua conta. Se ele estiver cadastrado,
                  enviamos um link para você definir uma nova senha.
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
                      Enviando…
                    </>
                  ) : (
                    'Enviar link de recuperação'
                  )}
                </button>

                <p className="text-center text-sm text-[var(--onside-muted)]">
                  Lembrou a senha?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-[var(--onside-ink)] underline underline-offset-2 transition-colors hover:text-[var(--onside-live-text)]"
                  >
                    Voltar ao login
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
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
      <div className="mb-6 grid size-16 place-items-center border-2 border-[var(--onside-ink)] bg-[var(--onside-acid)]">
        <EnvelopeCheck size={30} color="currentColor" aria-hidden="true" />
      </div>
      <p className="onside-kicker mb-3">Link a caminho</p>
      <h1 className="onside-display mb-3 text-[38px] sm:text-[44px]">
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
          <strong className="text-[var(--onside-ink)]">1 hora</strong> e só pode
          ser usado uma vez.
        </li>
        <li className="border-[var(--onside-line)] border-l-2 pl-3">
          Não achou? Procure em spam ou promoções antes de pedir outro.
        </li>
        <li className="border-[var(--onside-line)] border-l-2 pl-3">
          Sua senha atual continua valendo enquanto o link não for usado.
        </li>
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link to="/login" className="onside-btn onside-btn-acid min-h-11">
          Voltar ao login
        </Link>
        <button
          type="button"
          onClick={onTentarOutro}
          className="onside-btn onside-btn-outline min-h-11"
        >
          Usar outro e-mail
        </button>
      </div>
    </div>
  )
}
