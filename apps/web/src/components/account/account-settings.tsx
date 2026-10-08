import { Button } from '@findsports_oficial/ui/components/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import { Spinner } from '@findsports_oficial/ui/components/spinner'
import { useState } from 'react'
import Envelope from 'reicon-react/icons/Envelope'
import Key from 'reicon-react/icons/Key'
import Logout from 'reicon-react/icons/Logout'
import { toast } from 'sonner'
import { Modal } from '@/components/admin/modal'
import { useSession } from '@/hooks/use-session'
import { useSignOut } from '@/hooks/use-sign-out'
import { authClient } from '@/lib/auth-client'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { AccountActionRow } from './account-action-row'
import { DeleteAccountSettings } from './delete-account-settings'
import { PrivacySettings } from './privacy-settings'
import { SessionSettings } from './session-settings'
import { TwoFactorSettings } from './two-factor-settings'

type Props = {
  surface: 'fan' | 'pub'
}

export function AccountSettings({ surface }: Props) {
  const session = useSession()
  const signOut = useSignOut('/login')
  const [passwordOpen, setPasswordOpen] = useState(false)

  /*
   * As colunas são explícitas, não `grid-flow`: com fluxo automático o 2FA
   * (uma linha de ação) deixava um vão da altura de duas seções abaixo dele,
   * e as sessões caíam ao lado da zona de exclusão. Aqui a coluna direita
   * empilha 2FA e sessões, e a exclusão fica sozinha no rodapé — destrutivo
   * por último e sem vizinho que convide a clicar por engano. A privacidade
   * (WEB-244) vai sob a conta, na coluna esquerda, que é a mais curta.
   */
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <section className="border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5 sm:p-6">
            <div className="mb-2">
              <p className="onside-kicker mb-2">Conta</p>
              <h2 className="onside-display text-2xl">Conta e acesso</h2>
              <p className="mt-1 text-[var(--onside-muted)] text-sm">
                {surface === 'fan'
                  ? 'Proteja seu perfil e os seus favoritos.'
                  : 'Proteja o acesso de quem administra o bar.'}
              </p>
            </div>

            <AccountActionRow
              icon={Envelope}
              title="E-mail de acesso"
              description={session?.user.email ?? '—'}
              action={
                <span className="inline-flex min-h-8 items-center border border-[var(--onside-line)] px-3 font-bold text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.1em]">
                  Somente leitura
                </span>
              }
            />
            <AccountActionRow
              icon={Key}
              title="Senha"
              description="Troque sua senha e encerre automaticamente os outros acessos."
              action={
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setPasswordOpen(true)}
                >
                  Alterar senha
                </Button>
              }
            />
            <AccountActionRow
              icon={Logout}
              title="Sair"
              description="Encerrar a sessão neste dispositivo."
              action={
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => void signOut()}
                >
                  Sair da conta
                </Button>
              }
            />
          </section>
          <PrivacySettings />
        </div>

        <div className="flex flex-col gap-4">
          <TwoFactorSettings />
          <SessionSettings />
        </div>
      </div>

      <DeleteAccountSettings surface={surface} />

      <PasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  )
}

function validarTrocaDeSenha(
  current: string,
  next: string,
  confirmation: string
) {
  return {
    current: current ? undefined : 'Informe sua senha atual.',
    next:
      next.length < 8
        ? 'A nova senha deve ter pelo menos 8 caracteres.'
        : undefined,
    confirmation:
      next !== confirmation
        ? 'A confirmação não corresponde à nova senha.'
        : undefined
  }
}

function PasswordDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  // Um erro por campo: o formulário é `noValidate` (WEB-272), então quem diz
  // o que falta em cada um é a tela, e não o balão do navegador.
  const [errors, setErrors] = useState<{
    current?: string
    next?: string
    confirmation?: string
  }>({})
  const [actionError, setActionError] = useState<string | null>(null)

  const close = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmation('')
    setErrors({})
    setActionError(null)
    onOpenChange(false)
  }

  // O erro some assim que o campo passa a valer — inclusive o da confirmação
  // quando a correção foi feita na nova senha. Só tira erro já mostrado; erro
  // novo espera o envio (o mesmo de `activate-invite`).
  const revalidar = (current: string, next: string, confirm: string) => {
    const atuais = validarTrocaDeSenha(current, next, confirm)
    setErrors((mostrados) => ({
      current: mostrados.current && atuais.current,
      next: mostrados.next && atuais.next,
      confirmation: mostrados.confirmation && atuais.confirmation
    }))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setActionError(null)
    const found = validarTrocaDeSenha(
      currentPassword,
      newPassword,
      confirmation
    )
    setErrors(found)
    if (found.current || found.next || found.confirmation) return

    setSaving(true)
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true
    })
    setSaving(false)

    if (result.error) {
      setActionError(
        getUserFacingMessage(
          result.error,
          'Não foi possível alterar a senha. Tente novamente.',
          'credentials'
        )
      )
      return
    }
    toast.success('Senha alterada. Os outros acessos foram encerrados.')
    close()
  }

  return (
    <Modal title="Alterar senha" open={open} onClose={close}>
      <form
        method="post"
        className="flex flex-col gap-5 pt-5"
        onSubmit={submit}
        noValidate
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.current)}>
            <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.current)}
              aria-describedby={
                errors.current ? 'current-password-error' : undefined
              }
              value={currentPassword}
              onChange={(event) => {
                setCurrentPassword(event.target.value)
                revalidar(event.target.value, newPassword, confirmation)
              }}
              required
            />
            <FieldError id="current-password-error">
              {errors.current}
            </FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.next)}>
            <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={Boolean(errors.next)}
              aria-describedby={errors.next ? 'new-password-error' : undefined}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value)
                revalidar(currentPassword, event.target.value, confirmation)
              }}
              required
            />
            <FieldError id="new-password-error">{errors.next}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.confirmation)}>
            <FieldLabel htmlFor="confirm-password">
              Confirmar nova senha
            </FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={Boolean(errors.confirmation)}
              aria-describedby={
                errors.confirmation ? 'change-password-error' : undefined
              }
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value)
                revalidar(currentPassword, newPassword, event.target.value)
              }}
              required
            />
            <FieldError id="change-password-error">
              {errors.confirmation}
            </FieldError>
          </Field>
        </FieldGroup>
        {actionError ? (
          <p className="text-[var(--onside-live-text)] text-sm" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {saving ? 'Salvando…' : 'Salvar nova senha'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
