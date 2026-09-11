import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Key from 'reicon-react/icons/Key'
import Loader from 'reicon-react/icons/Loader'
import { toast } from 'sonner'

import { AuthBrandPanel } from '@/components/auth-brand-panel'
import { AuthPasswordField } from '@/components/auth-password-field'
import { OnsideBrand } from '@/components/brand/onside-brand'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/(auth)/reset-password')({
  // O better-auth redireciona para cá com `?token=...` quando o link ainda
  // vale, e com `?error=INVALID_TOKEN` quando expirou ou já foi usado.
  //
  // As chaves saem do objeto quando não vêm na URL, em vez de virarem string
  // vazia: o router reserializa a busca e, com `error: ''`, o endereço
  // canônico ganhava um `&error=` que a URL do e-mail não tinha — um 307 de
  // ida e volta antes de cada abertura do link.
  validateSearch: (search: Record<string, unknown>) => {
    const token = typeof search.token === 'string' ? search.token : undefined
    const error = typeof search.error === 'string' ? search.error : undefined
    return {
      ...(token ? { token } : {}),
      ...(error ? { error } : {})
    }
  },
  head: () => ({
    meta: [
      { title: 'Definir nova senha — Onside' },
      { name: 'robots', content: 'noindex' }
    ]
  }),
  component: ResetPasswordPage
})

function validatePassword({ value }: { value: string }) {
  if (!value) return 'Informe uma senha.'
  if (value.length < 8) return 'A senha deve ter pelo menos 8 caracteres.'
  if (value.length > 128) return 'A senha deve ter no máximo 128 caracteres.'
  return undefined
}

function validateConfirm({
  value,
  fieldApi
}: {
  value: string
  fieldApi: { form: { getFieldValue: (name: 'password') => string } }
}) {
  if (!value) return 'Confirme sua nova senha.'
  if (value !== fieldApi.form.getFieldValue('password')) {
    return 'As senhas não coincidem.'
  }
  return undefined
}

function ResetPasswordPage() {
  const { token, error } = Route.useSearch()

  return (
    <div className="onside-app flex min-h-dvh">
      <AuthBrandPanel variant="login">
        <div className="mb-3 flex items-center gap-2 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-acid)] uppercase tracking-[0.16em]">
          <span className="onside-live-dot" aria-hidden="true" />
          Recuperação de acesso
        </div>
        <h2 className="onside-display mb-6 text-4xl text-[var(--onside-paper)] xl:text-5xl">
          ÚLTIMO PASSO{' '}
          <span className="text-[var(--onside-acid)]">ANTES DO APITO.</span>
        </h2>
        <p className="onside-text-muted-on-ink max-w-xs text-base leading-relaxed">
          Escolha uma senha nova e sua conta volta a ser só sua.
        </p>
      </AuthBrandPanel>

      <main className="flex flex-1 flex-col items-center justify-center bg-[var(--onside-paper)] px-4 py-10 sm:px-10 lg:px-16">
        <div className="mb-8 w-full max-w-[420px] border-[var(--onside-ink)] border-b pb-6 lg:hidden">
          <Link to="/" aria-label="Onside — página inicial">
            <OnsideBrand />
          </Link>
          <p className="mt-4 max-w-[28ch] text-sm text-[var(--onside-muted)]">
            Defina a nova senha e{' '}
            <span className="font-semibold text-[var(--onside-ink)]">
              volte a jogar
            </span>
            .
          </p>
        </div>

        <div className="w-full max-w-[420px]">
          {token && !error ? (
            <FormularioDeNovaSenha token={token} />
          ) : (
            <LinkInvalido />
          )}
        </div>
      </main>
    </div>
  )
}

/**
 * Um único estado para link ausente, expirado e já usado: o servidor não
 * distingue os três (o token é consumido na redefinição e some da tabela de
 * verificação), e inventar a diferença na UI seria adivinhação.
 */
function LinkInvalido() {
  return (
    <div>
      <p className="onside-kicker mb-3">Link inválido</p>
      <h1 className="onside-display mb-3 text-[38px] sm:text-[44px]">
        ESSE LINK NÃO{' '}
        <span className="text-[var(--onside-live-text)]">VALE MAIS.</span>
      </h1>
      <p className="text-sm text-[var(--onside-muted)] leading-relaxed">
        Links de redefinição valem por 1 hora e só funcionam uma vez. Este
        expirou, já foi usado ou chegou quebrado pelo cliente de e-mail.
      </p>
      <p className="mt-4 text-sm text-[var(--onside-muted)] leading-relaxed">
        Peça um novo — leva alguns segundos e sua senha atual continua valendo
        até você definir a nova.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          to="/forgot-password"
          className="onside-btn onside-btn-acid min-h-11"
        >
          Pedir novo link
        </Link>
        <Link to="/login" className="onside-btn onside-btn-outline min-h-11">
          Voltar ao login
        </Link>
      </div>
    </div>
  )
}

function FormularioDeNovaSenha({ token }: { token: string }) {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [tokenRecusado, setTokenRecusado] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const form = useForm({
    defaultValues: { password: '', confirm: '' },
    onSubmitInvalid: () => focusFirstInvalid(),
    onSubmit: async ({ value }) => {
      setIsLoading(true)
      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token
      })
      setIsLoading(false)
      if (error) {
        // Entre o carregamento da página e o envio, o token pode ter expirado
        // ou sido consumido em outra aba. Nesse caso a tela precisa virar o
        // estado de link inválido, não repetir um toast sobre um formulário
        // que nunca mais vai passar.
        if (error.code === 'INVALID_TOKEN' || error.status === 400) {
          setTokenRecusado(true)
          return
        }
        // Idem: mensagem do better-auth é em inglês, a exibida é nossa.
        toast.error(
          error.status === 429
            ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
            : 'Não foi possível redefinir a senha. Tente novamente.'
        )
        return
      }
      // `revokeSessionsOnPasswordReset` derruba as sessões abertas, então
      // entrar de novo é obrigatório — e é o que confirma que a senha pegou.
      toast.success('Senha redefinida. Entre com a nova senha.')
      navigate({ to: '/login' })
    }
  })

  function focusFirstInvalid() {
    const root = formRef.current
    if (!root) return
    root
      .querySelector<HTMLElement>('input[aria-invalid="true"], input:invalid')
      ?.focus()
  }

  if (tokenRecusado) return <LinkInvalido />

  return (
    <>
      <div className="mb-8">
        <div className="mb-6 grid size-16 place-items-center border-2 border-[var(--onside-ink)] bg-[var(--onside-acid)]">
          <Key size={30} color="currentColor" aria-hidden="true" />
        </div>
        <p className="onside-kicker mb-3">Nova senha</p>
        <h1 className="onside-display mb-3 text-[42px] sm:text-5xl md:text-[56px]">
          DEFINA SUA{' '}
          <span className="text-[var(--onside-live-text)]">NOVA SENHA.</span>
        </h1>
        <p className="text-sm text-[var(--onside-muted)]">
          Escolha uma senha de pelo menos 8 caracteres. Ao concluir, as sessões
          abertas nesta conta são encerradas.
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
          name="password"
          validators={{ onBlur: validatePassword, onSubmit: validatePassword }}
        >
          {(field) => (
            <AuthPasswordField
              label="Nova senha"
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
          validators={{ onBlur: validateConfirm, onSubmit: validateConfirm }}
        >
          {(field) => (
            <AuthPasswordField
              label="Confirmar nova senha"
              field={field}
              id="confirm"
              placeholder="Repita a nova senha"
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
              Salvando…
            </>
          ) : (
            'Salvar nova senha'
          )}
        </button>

        <p className="text-center text-sm text-[var(--onside-muted)]">
          Mudou de ideia?{' '}
          <Link
            to="/login"
            className="font-semibold text-[var(--onside-ink)] underline underline-offset-2 transition-colors hover:text-[var(--onside-live-text)]"
          >
            Voltar ao login
          </Link>
        </p>
      </form>
    </>
  )
}
