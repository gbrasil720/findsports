import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import EnvelopeCheck from 'reicon-react/icons/EnvelopeCheck'
import { toast } from 'sonner'

import {
  AuthSplit,
  CampoForm,
  Disp,
  entradaHead
} from '@/components/entrada/auth'
import { Botao, propsBotao } from '@/components/painel'
import { useTurnstile } from '@/components/turnstile'
import { authClient } from '@/lib/auth-client'
import { getUserFacingMessage } from '@/lib/user-facing-error'

/**
 * Para onde o link do e-mail leva depois que o better-auth valida o token.
 * Caminho relativo de propósito: o `originCheck` aceita relativo e resolve
 * contra a base configurada, então isto continua certo em preview, produção
 * e local sem lista de origens paralela.
 */
const REDIRECT_APOS_TOKEN = '/reset-password'

export const Route = createFileRoute('/(auth)/forgot-password')({
  head: () =>
    entradaHead({
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
    <AuthSplit
      foto={
        <>
          <Disp
            nivel={0}
            tamanho={64}
            linhas={[
              { texto: 'Esqueceu?' },
              { texto: 'Sem drama.', tint: true }
            ]}
          />
          <p>
            Mandamos um link no seu e-mail e você volta a campo em um minuto.
          </p>
        </>
      }
    >
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
          <p className="entrada-kicker">Recuperar senha</p>
          <Disp tamanho={56} linhas={[{ texto: 'Vamos de nova senha' }]} />
          <p className="entrada-linha">
            Informe o e-mail da sua conta. Se ele estiver cadastrado, enviamos
            um link para você definir uma nova senha.
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
              name="email"
              validators={{ onBlur: validateEmail, onSubmit: validateEmail }}
            >
              {(field) => (
                <CampoForm
                  field={field}
                  rotulo="E-mail da conta"
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

            <Botao
              type="submit"
              variante="acid"
              disabled={isLoading}
              className="entrada-cta"
              style={{ marginTop: 4 }}
            >
              {isLoading ? 'Enviando…' : 'Enviar link de recuperação'}
            </Botao>

            <p className="entrada-nota">
              Lembrou a senha?{' '}
              <Link to="/login" className="entrada-link">
                Voltar ao login
              </Link>
            </p>

            {captcha.widget}
          </form>
        </>
      )}
    </AuthSplit>
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
    <div aria-live="polite" className="entrada-form">
      <span className="entrada-selo" aria-hidden="true">
        <EnvelopeCheck size={30} color="currentColor" />
      </span>
      <p className="entrada-kicker">Link a caminho</p>
      <Disp tamanho={48} linhas={[{ texto: 'Confira sua caixa de entrada' }]} />
      <p className="entrada-linha">
        Se <strong>{email}</strong> estiver cadastrado na Onside, o link para
        definir uma nova senha já saiu.
      </p>
      <ul className="entrada-lista">
        <li>
          O link vale por <strong>30 minutos</strong> e só pode ser usado uma
          vez.
        </li>
        <li>Não achou? Procure em spam ou promoções antes de pedir outro.</li>
        <li>Sua senha atual continua valendo enquanto o link não for usado.</li>
      </ul>
      <div className="entrada-botoes">
        <Link to="/login" {...propsBotao({ variante: 'acid' })}>
          Voltar ao login
        </Link>
        <Botao onClick={onTentarOutro}>Usar outro e-mail</Botao>
      </div>
    </div>
  )
}
