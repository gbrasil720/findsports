import { useForm } from '@tanstack/react-form'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import Key from 'reicon-react/icons/Key'
import { toast } from 'sonner'

import { revalidateShownError } from '@/components/auth-field-change'
import {
  AuthSplit,
  CampoSenha,
  Disp,
  entradaHead
} from '@/components/entrada/auth'
import { Botao, propsBotao } from '@/components/painel'
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
  head: () =>
    entradaHead({
      path: '/reset-password',
      title: 'Definir nova senha — Onside',
      description: 'Defina uma nova senha para a sua conta Onside.',
      indexable: false
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
    <AuthSplit
      foto={
        <>
          <Disp
            nivel={0}
            tamanho={64}
            linhas={[
              { texto: 'Último passo' },
              { texto: 'antes do apito.', tint: true }
            ]}
          />
          <p>Escolha uma senha nova e sua conta volta a ser só sua.</p>
        </>
      }
    >
      {token && !error ? (
        <FormularioDeNovaSenha token={token} />
      ) : (
        <LinkInvalido />
      )}
    </AuthSplit>
  )
}

/**
 * Um único estado para link ausente, expirado e já usado: o servidor não
 * distingue os três (o token é consumido na redefinição e some da tabela de
 * verificação), e inventar a diferença na UI seria adivinhação.
 */
function LinkInvalido() {
  return (
    <>
      <p className="entrada-kicker">Link inválido</p>
      <Disp tamanho={56} linhas={[{ texto: 'Esse link não vale mais' }]} />
      <p className="entrada-linha">
        Links de redefinição valem por 30 minutos e só funcionam uma vez. Este
        expirou, já foi usado ou chegou quebrado pelo cliente de e-mail.
      </p>
      <p className="entrada-linha">
        Peça um novo — leva alguns segundos e sua senha atual continua valendo
        até você definir a nova.
      </p>
      <div className="entrada-botoes">
        <Link to="/forgot-password" {...propsBotao({ variante: 'acid' })}>
          Pedir novo link
        </Link>
        <Link to="/login" {...propsBotao()}>
          Voltar ao login
        </Link>
      </div>
    </>
  )
}

function FormularioDeNovaSenha({ token }: { token: string }) {
  const navigate = useNavigate()
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
      <span className="entrada-selo" aria-hidden="true">
        <Key size={30} color="currentColor" />
      </span>
      <p className="entrada-kicker">Nova senha</p>
      <Disp tamanho={56} linhas={[{ texto: 'Defina sua nova senha' }]} />
      <p className="entrada-linha">
        Escolha uma senha de pelo menos 8 caracteres. Ao concluir, as sessões
        abertas nesta conta são encerradas.
      </p>

      <form
        method="post"
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.Field
          name="password"
          validators={{ onBlur: validatePassword, onSubmit: validatePassword }}
          // "As senhas não coincidem." também se corrige por aqui.
          listeners={{ onChange: () => revalidateShownError(form, 'confirm') }}
        >
          {(field) => (
            <CampoSenha
              field={field}
              rotulo="Nova senha"
              id="password"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              required
            />
          )}
        </form.Field>

        <form.Field
          name="confirm"
          validators={{ onBlur: validateConfirm, onSubmit: validateConfirm }}
        >
          {(field) => (
            <CampoSenha
              field={field}
              rotulo="Confirmar nova senha"
              id="confirm"
              placeholder="Repita a nova senha"
              autoComplete="new-password"
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
          {isLoading ? 'Salvando…' : 'Salvar nova senha'}
        </Botao>

        <p className="entrada-nota">
          Mudou de ideia?{' '}
          <Link to="/login" className="entrada-link">
            Voltar ao login
          </Link>
        </p>
      </form>
    </>
  )
}
