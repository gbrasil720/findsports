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
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import Trash from 'reicon-react/icons/Trash'
import { Modal } from '@/components/admin/modal'
import { authClient } from '@/lib/auth-client'
import { useTRPC } from '@/utils/trpc'

const CONFIRMATION = 'EXCLUIR MINHA CONTA'

export function DeleteAccountSettings({ surface }: { surface: 'fan' | 'pub' }) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eligibility = useQuery({
    ...trpc.pub.getAccountDeletionEligibility.queryOptions(),
    enabled: surface === 'pub'
  })
  const blocked = surface === 'pub' && eligibility.data?.allowed === false

  const close = () => {
    setPassword('')
    setConfirmation('')
    setError(null)
    setOpen(false)
  }

  const remove = async (event: React.FormEvent) => {
    event.preventDefault()
    if (confirmation !== CONFIRMATION) {
      setError(`Digite exatamente ${CONFIRMATION}.`)
      return
    }
    setDeleting(true)
    setError(null)
    const result = await authClient.deleteUser({ password, callbackURL: '/' })
    setDeleting(false)
    if (result.error) {
      setError(result.error.message ?? 'Não foi possível excluir a conta.')
      if (surface === 'pub') void eligibility.refetch()
      return
    }
    close()
    navigate({ to: '/' })
  }

  return (
    <section className="border border-[var(--onside-live)] bg-[var(--onside-paper)] p-5 sm:p-6">
      <p className="font-[family-name:var(--onside-mono)] font-bold text-[10px] text-[var(--onside-live-text)] uppercase tracking-[0.14em]">
        Zona de exclusão
      </p>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <Trash
            size={20}
            color="currentColor"
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
        {blocked ? (
          <Link
            to="/admin/billing"
            className="onside-btn onside-btn-outline min-h-11 shrink-0"
          >
            Assinatura e pagamentos
          </Link>
        ) : (
          <Button
            variant="destructive"
            size="lg"
            disabled={
              surface === 'pub' &&
              (eligibility.isLoading || eligibility.isError)
            }
            onClick={() => setOpen(true)}
          >
            Excluir minha conta
          </Button>
        )}
      </div>

      {blocked ? (
        <div className="onside-callout onside-callout-warn mt-4" role="status">
          {eligibility.data?.block === 'period-active'
            ? `O cancelamento foi solicitado, mas o período contratado ainda vai até ${formatDate(eligibility.data.currentPeriodEnd)}. A exclusão será liberada depois dessa data.`
            : 'Encerre a assinatura vigente antes de excluir a conta do bar.'}
        </div>
      ) : null}
      {surface === 'pub' && eligibility.isError ? (
        <div className="onside-callout onside-callout-danger mt-4" role="alert">
          Não foi possível verificar a assinatura. A exclusão permanece
          indisponível por segurança.
        </div>
      ) : null}

      <Modal title="Excluir conta permanentemente" open={open} onClose={close}>
        <form className="flex flex-col gap-5 pt-5" onSubmit={remove}>
          <div className="onside-callout onside-callout-danger" role="alert">
            Esta ação não pode ser desfeita. Seus dados locais serão apagados.
          </div>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="delete-account-password">
                Senha atual
              </FieldLabel>
              <Input
                id="delete-account-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="delete-account-confirmation">
                Digite {CONFIRMATION}
              </FieldLabel>
              <Input
                id="delete-account-confirmation"
                autoComplete="off"
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
    </section>
  )
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'o fim do período'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(
    new Date(value)
  )
}
