import { Button } from '@findsports_oficial/ui/components/button'
import { Checkbox } from '@findsports_oficial/ui/components/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import { Spinner } from '@findsports_oficial/ui/components/spinner'
import { useRef, useState } from 'react'
import QRCodeModule from 'react-qr-code'
import Copy from 'reicon-react/icons/Copy'
import Download from 'reicon-react/icons/Download'
import Shield from 'reicon-react/icons/Shield'
import { toast } from 'sonner'
import { Modal } from '@/components/admin/modal'
import { TwoFactorCodeInput } from '@/components/two-factor-code-input'
import { authClient } from '@/lib/auth-client'
import { AccountActionRow } from './account-action-row'

const qrCodeModule = QRCodeModule as unknown
const QRCode =
  typeof qrCodeModule === 'object' &&
  qrCodeModule !== null &&
  'default' in qrCodeModule
    ? (qrCodeModule.default as typeof QRCodeModule)
    : QRCodeModule

type DialogMode = 'enable' | 'regenerate' | 'disable' | null
type EnablePhase = 'password' | 'scan' | 'codes'

export function TwoFactorSettings() {
  const { data: session } = authClient.useSession()
  const [mode, setMode] = useState<DialogMode>(null)
  const enabled = session?.user.twoFactorEnabled === true

  return (
    <section className="border border-[var(--onside-ink)] bg-[var(--onside-paper)] p-5 sm:p-6">
      <p className="onside-kicker mb-2">Segurança</p>
      <h2 className="onside-display text-2xl">Autenticação em dois fatores</h2>
      <p className="mt-1 text-[var(--onside-muted)] text-sm">
        Use um aplicativo autenticador mesmo se sua senha for descoberta.
      </p>

      <AccountActionRow
        icon={Shield}
        title={enabled ? '2FA ativado' : '2FA desativado'}
        description={
          enabled
            ? 'Sua conta pede um código TOTP ou de recuperação no login.'
            : 'Ative com um aplicativo como Google Authenticator, 1Password ou Authy.'
        }
        action={
          <Button
            size="lg"
            variant={enabled ? 'outline' : 'default'}
            onClick={() => setMode(enabled ? 'regenerate' : 'enable')}
          >
            {enabled ? 'Gerenciar 2FA' : 'Ativar 2FA'}
          </Button>
        }
      />

      <EnableTwoFactorDialog
        open={mode === 'enable'}
        onClose={() => setMode(null)}
      />
      <ManageTwoFactorDialog
        mode={mode === 'regenerate' || mode === 'disable' ? mode : null}
        onModeChange={setMode}
      />
    </section>
  )
}

function EnableTwoFactorDialog({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const [phase, setPhase] = useState<EnablePhase>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [totpUri, setTotpUri] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const verifyingRef = useRef(false)

  const resetAndClose = () => {
    setPhase('password')
    setPassword('')
    setCode('')
    setTotpUri('')
    setBackupCodes([])
    setAcknowledged(false)
    setError(null)
    onClose()
  }

  const begin = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const result = await authClient.twoFactor.enable({ password })
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error?.message ?? 'Não foi possível iniciar a ativação.')
      return
    }
    setTotpUri(result.data.totpURI)
    setBackupCodes(result.data.backupCodes)
    setPhase('scan')
  }

  const verifyCode = async (nextCode: string) => {
    const normalizedCode = nextCode.trim()
    if (normalizedCode.length !== 6 || verifyingRef.current) return

    verifyingRef.current = true
    setSaving(true)
    setError(null)
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: normalizedCode,
        trustDevice: false
      })
      if (result.error) {
        setCode('')
        setError(
          result.error.message ?? 'Código inválido. Tente o código atual.'
        )
        return
      }
      setPhase('codes')
    } finally {
      verifyingRef.current = false
      setSaving(false)
    }
  }

  const verify = (event: React.FormEvent) => {
    event.preventDefault()
    void verifyCode(code)
  }

  let secret = ''
  try {
    secret = new URL(totpUri).searchParams.get('secret') ?? ''
  } catch {
    secret = ''
  }

  return (
    <Modal
      title="Ativar autenticação em dois fatores"
      open={open}
      onClose={() => {
        if (phase !== 'codes' || acknowledged) resetAndClose()
      }}
    >
      {phase === 'password' ? (
        <form className="flex flex-col gap-5 pt-5" onSubmit={begin}>
          <p className="text-[var(--onside-muted)] text-sm">
            Confirme sua senha antes de criar uma nova chave de autenticação.
          </p>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="two-factor-password">Senha atual</FieldLabel>
            <Input
              id="two-factor-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogActions
            saving={saving}
            submitLabel="Continuar"
            onCancel={resetAndClose}
          />
        </form>
      ) : null}

      {phase === 'scan' ? (
        <form className="flex flex-col gap-5 pt-5" onSubmit={verify}>
          <p className="text-[var(--onside-muted)] text-sm">
            Escaneie o QR no seu aplicativo. Se preferir, informe a chave
            manual. Depois digite o código atual para concluir.
          </p>
          <div
            className="mx-auto bg-white p-4"
            role="img"
            aria-label="QR code para configurar o autenticador"
          >
            <QRCode value={totpUri} size={184} />
          </div>
          <div className="border border-[var(--onside-line)] bg-[var(--onside-stone)] p-3">
            <p className="font-bold text-[10px] uppercase tracking-[0.1em]">
              Chave manual
            </p>
            <code className="mt-2 block overflow-x-auto whitespace-nowrap font-[family-name:var(--onside-mono)] text-xs">
              {secret}
            </code>
          </div>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="two-factor-code">
              Código de 6 dígitos
            </FieldLabel>
            <TwoFactorCodeInput
              id="two-factor-code"
              invalid={Boolean(error)}
              value={code}
              onChange={setCode}
              onComplete={(value) => void verifyCode(value)}
              disabled={saving}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogActions
            saving={saving}
            submitLabel="Validar e ativar"
            onCancel={resetAndClose}
          />
        </form>
      ) : null}

      {phase === 'codes' ? (
        <RecoveryCodes
          codes={backupCodes}
          acknowledged={acknowledged}
          onAcknowledgedChange={setAcknowledged}
          onDone={resetAndClose}
        />
      ) : null}
    </Modal>
  )
}

function ManageTwoFactorDialog({
  mode,
  onModeChange
}: {
  mode: 'regenerate' | 'disable' | null
  onModeChange: (mode: DialogMode) => void
}) {
  const [password, setPassword] = useState('')
  const [codes, setCodes] = useState<string[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setPassword('')
    setCodes([])
    setAcknowledged(false)
    setError(null)
    onModeChange(null)
  }

  const regenerate = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const result = await authClient.twoFactor.generateBackupCodes({ password })
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error?.message ?? 'Não foi possível gerar novos códigos.')
      return
    }
    setCodes(result.data.backupCodes)
  }

  const disable = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const result = await authClient.twoFactor.disable({ password })
    setSaving(false)
    if (result.error) {
      setError(result.error.message ?? 'Não foi possível desativar o 2FA.')
      return
    }
    toast.success('Autenticação em dois fatores desativada.')
    close()
  }

  return (
    <Modal
      title={
        mode === 'disable'
          ? 'Desativar 2FA'
          : 'Gerenciar códigos de recuperação'
      }
      open={mode !== null}
      onClose={() => {
        if (codes.length === 0 || acknowledged) close()
      }}
    >
      {mode === 'regenerate' && codes.length > 0 ? (
        <RecoveryCodes
          codes={codes}
          acknowledged={acknowledged}
          onAcknowledgedChange={setAcknowledged}
          onDone={close}
        />
      ) : (
        <form
          className="flex flex-col gap-5 pt-5"
          onSubmit={mode === 'disable' ? disable : regenerate}
        >
          <p className="text-[var(--onside-muted)] text-sm">
            {mode === 'disable'
              ? 'Sua conta voltará a depender somente da senha. Confirme para continuar.'
              : 'Novos códigos invalidam imediatamente todos os códigos anteriores.'}
          </p>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="manage-two-factor-password">
              Senha atual
            </FieldLabel>
            <Input
              id="manage-two-factor-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogActions
            saving={saving}
            submitLabel={
              mode === 'disable' ? 'Desativar 2FA' : 'Gerar novos códigos'
            }
            destructive={mode === 'disable'}
            onCancel={close}
          />
          {mode === 'regenerate' ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => onModeChange('disable')}
            >
              Desativar autenticação em dois fatores
            </Button>
          ) : null}
        </form>
      )}
    </Modal>
  )
}

function RecoveryCodes({
  codes,
  acknowledged,
  onAcknowledgedChange,
  onDone
}: {
  codes: string[]
  acknowledged: boolean
  onAcknowledgedChange: (checked: boolean) => void
  onDone: () => void
}) {
  const text = codes.join('\n')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Códigos copiados.')
    } catch {
      toast.error('Não foi possível copiar. Use a opção de baixar.')
    }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'onside-codigos-recuperacao.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-5 pt-5">
      <div className="onside-callout onside-callout-warn" role="status">
        Estes códigos aparecem somente agora. Cada código funciona uma vez.
      </div>
      <ul className="grid grid-cols-1 gap-2 border border-[var(--onside-ink)] bg-[var(--onside-stone)] p-4 font-[family-name:var(--onside-mono)] text-sm sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => void copy()}
        >
          <Copy data-icon="inline-start" /> Copiar
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={download}>
          <Download data-icon="inline-start" /> Baixar
        </Button>
      </div>
      <Field orientation="horizontal">
        <Checkbox
          id="recovery-codes-saved"
          checked={acknowledged}
          onCheckedChange={onAcknowledgedChange}
        />
        <FieldLabel htmlFor="recovery-codes-saved">
          Guardei meus códigos em um lugar seguro
        </FieldLabel>
      </Field>
      <Button type="button" size="lg" disabled={!acknowledged} onClick={onDone}>
        Concluir
      </Button>
      <FieldDescription>
        Se perder o autenticador e todos os códigos, procure o suporte. Não há
        recuperação por e-mail nesta versão.
      </FieldDescription>
    </div>
  )
}

function DialogActions({
  saving,
  submitLabel,
  destructive = false,
  onCancel
}: {
  saving: boolean
  submitLabel: string
  destructive?: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" size="lg" onClick={onCancel}>
        Cancelar
      </Button>
      <Button
        type="submit"
        variant={destructive ? 'destructive' : 'default'}
        size="lg"
        disabled={saving}
      >
        {saving ? <Spinner data-icon="inline-start" /> : null}
        {saving ? 'Processando…' : submitLabel}
      </Button>
    </div>
  )
}
