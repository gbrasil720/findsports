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
import { useSignOut } from '@/hooks/use-sign-out'
import { authClient } from '@/lib/auth-client'
import { AccountActionRow } from './account-action-row'
import { DeleteAccountSettings } from './delete-account-settings'
import { SessionSettings } from './session-settings'
import { TwoFactorSettings } from './two-factor-settings'

type Props = {
  surface: 'fan' | 'pub'
}

export function AccountSettings({ surface }: Props) {
  const { data: session } = authClient.useSession()
  const signOut = useSignOut('/login')
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
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
          description={session?.user.email ?? 'Carregando…'}
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
            <Button variant="outline" size="lg" onClick={() => void signOut()}>
              Sair da conta
            </Button>
          }
        />
      </section>

      <TwoFactorSettings />
      <SessionSettings />
      <DeleteAccountSettings surface={surface} />

      <PasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  )
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
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmation('')
    setError(null)
    onOpenChange(false)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (newPassword !== confirmation) {
      setError('A confirmação não corresponde à nova senha.')
      return
    }

    setSaving(true)
    setError(null)
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true
    })
    setSaving(false)

    if (result.error) {
      setError(result.error.message ?? 'Não foi possível alterar a senha.')
      return
    }
    toast.success('Senha alterada. Os outros acessos foram encerrados.')
    close()
  }

  return (
    <Modal title="Alterar senha" open={open} onClose={close}>
      <form className="flex flex-col gap-5 pt-5" onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current-password">Senha atual</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">Nova senha</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="confirm-password">
              Confirmar nova senha
            </FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              aria-invalid={Boolean(error)}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
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
