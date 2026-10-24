import { Button } from '@findsports_oficial/ui/components/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@findsports_oficial/ui/components/field'
import { Input } from '@findsports_oficial/ui/components/input'
import { Spinner } from '@findsports_oficial/ui/components/spinner'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import Trash from 'reicon-react/icons/Trash'
import { toast } from 'sonner'
import { Modal } from '@/components/admin/modal'
import { authClient } from '@/lib/auth-client'
import {
  getUserFacingError,
  getUserFacingMessage
} from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

const CONFIRMATION = 'EXCLUIR MINHA CONTA'
const SUPPORT_EMAIL = 'contato@onside.sh'

/**
 * Se a exclusão encerra uma assinatura no Stripe (WEB-336). Só o bar tem; a
 * falha de leitura deixa a exclusão indisponível por segurança.
 */
export function useDeletionEligibility(surface: 'fan' | 'pub') {
  const trpc = useTRPC()
  const eligibility = useQuery({
    ...trpc.pub.getAccountDeletionEligibility.queryOptions(),
    enabled: surface === 'pub',
    meta: { errorToast: false }
  })
  return {
    eligibility,
    endsSubscription:
      surface === 'pub' && eligibility.data?.endsSubscription === true,
    loading: surface === 'pub' && eligibility.isLoading,
    error:
      surface === 'pub' && eligibility.error
        ? getUserFacingError(
            eligibility.error,
            'Não foi possível verificar a assinatura. A exclusão permanece indisponível por segurança.'
          )
        : null
  }
}

/** A confirmação da exclusão: senha, a frase e o aviso da assinatura. */
export function DeleteAccountDialog({
  open,
  onClose,
  endsSubscription,
  onFailed
}: {
  open: boolean
  onClose: () => void
  endsSubscription: boolean
  /** A recusa pode ter mudado a assinatura: quem abriu relê a elegibilidade. */
  onFailed?: () => void
}) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // O formulário é `noValidate` (WEB-272): senha vazia recebe o texto da tela,
  // junto ao campo, no lugar do balão do navegador.
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const close = () => {
    setPassword('')
    setConfirmation('')
    setError(null)
    setPasswordError(null)
    onClose()
  }

  const remove = async (event: React.FormEvent) => {
    event.preventDefault()
    if (confirmation !== CONFIRMATION) {
      setError(`Digite exatamente ${CONFIRMATION}.`)
      return
    }
    if (!password) {
      setPasswordError('Informe sua senha atual.')
      return
    }
    setDeleting(true)
    setError(null)
    const result = await authClient.deleteUser({ password, callbackURL: '/' })
    setDeleting(false)
    if (result.error) {
      // Stripe não encerrou a assinatura (WEB-336): a recusa do servidor já
      // diz que a conta ficou e que dá para tentar de novo.
      setError(
        result.error.code === 'SUBSCRIPTION_CANCEL_FAILED' &&
          result.error.message
          ? result.error.message
          : getUserFacingMessage(
              result.error,
              'Não foi possível excluir a conta.'
            )
      )
      onFailed?.()
      return
    }
    close()
    // A home deslogada, sozinha, não distingue conta excluída de sessão caída
    // (WEB-348). É a única confirmação de algo sem volta, e a tela troca por
    // baixo dela: fica mais tempo que o toast padrão.
    toast.success('Sua conta foi excluída.', { duration: 10_000 })
    navigate({ to: '/' })
  }

  return (
    <Modal title="Excluir conta permanentemente" open={open} onClose={close}>
      <form
        method="post"
        className="flex flex-col gap-5 pt-5"
        onSubmit={remove}
        noValidate
      >
        <div className="onside-callout onside-callout-danger" role="alert">
          Esta ação não pode ser desfeita. Seus dados locais serão apagados.
        </div>
        {endsSubscription ? (
          <div className="onside-callout onside-callout-warn">
            <div className="flex flex-col gap-2">
              <p>
                Sua assinatura será encerrada agora. O valor já pago do período
                em curso não é devolvido, e o crédito em conta, se houver, se
                perde.
              </p>
              <p>
                Se a sua primeira contratação foi feita há até 7 dias, você tem
                direito ao reembolso integral: peça ao suporte em{' '}
                <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>
          </div>
        ) : null}
        <FieldGroup>
          <Field data-invalid={Boolean(passwordError)}>
            <FieldLabel htmlFor="delete-account-password">
              Senha atual
            </FieldLabel>
            <Input
              id="delete-account-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              aria-describedby={
                passwordError ? 'delete-account-password-error' : undefined
              }
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (event.target.value) setPasswordError(null)
              }}
              required
            />
            <FieldError id="delete-account-password-error">
              {passwordError}
            </FieldError>
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="delete-account-confirmation">
              Digite {CONFIRMATION}
            </FieldLabel>
            <Input
              id="delete-account-confirmation"
              autoComplete="off"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'delete-account-error' : undefined}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
            <FieldError id="delete-account-error">{error}</FieldError>
          </Field>
        </FieldGroup>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={close}>
            Manter minha conta
          </Button>
          <Button
            type="submit"
            variant="destructive"
            size="lg"
            disabled={deleting || confirmation !== CONFIRMATION}
          >
            {deleting ? <Spinner data-icon="inline-start" /> : null}
            {deleting ? 'Excluindo…' : 'Excluir permanentemente'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function DeleteAccountSettings({ surface }: { surface: 'fan' | 'pub' }) {
  const [open, setOpen] = useState(false)
  const {
    eligibility,
    endsSubscription,
    loading,
    error: eligibilityErrorFeedback
  } = useDeletionEligibility(surface)
  return (
    <section className="border border-[var(--onside-live)] bg-[var(--onside-paper)] p-5 sm:p-6">
      <p className="font-[family-name:var(--onside-mono)] font-bold text-[10px] text-[var(--onside-live-text)] uppercase tracking-[0.14em]">
        Zona de exclusão
      </p>
      <div
        className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        aria-busy={loading || undefined}
      >
        <div className="flex min-w-0 gap-3">
          <Trash
            size={20}
            className="mt-0.5 shrink-0 text-[var(--onside-live-text)]"
            aria-hidden="true"
          />
          <div>
            <h2 className="onside-display text-xl">Excluir conta</h2>
            <p className="mt-1 max-w-2xl text-[var(--onside-muted)] text-sm leading-relaxed">
              A exclusão é permanente e remove os dados locais. Registros
              fiscais podem continuar armazenados pelo provedor de pagamento.
            </p>
          </div>
        </div>
        <Button
          variant="destructive"
          size="lg"
          disabled={loading || (surface === 'pub' && eligibility.isError)}
          onClick={() => setOpen(true)}
        >
          Excluir minha conta
        </Button>
      </div>

      {loading ? (
        <p className="sr-only" role="status" aria-live="polite">
          Verificando a assinatura antes de liberar a exclusão da conta…
        </p>
      ) : null}

      {surface === 'pub' && eligibility.isError ? (
        <div className="onside-callout onside-callout-danger mt-4" role="alert">
          <p>{eligibilityErrorFeedback?.message}</p>
          {eligibilityErrorFeedback?.retryable ? (
            <Button
              variant="outline"
              onClick={() => void eligibility.refetch()}
            >
              Tentar novamente
            </Button>
          ) : null}
        </div>
      ) : null}

      <DeleteAccountDialog
        open={open}
        onClose={() => setOpen(false)}
        endsSubscription={endsSubscription}
        onFailed={() => {
          if (surface === 'pub') void eligibility.refetch()
        }}
      />
    </section>
  )
}
