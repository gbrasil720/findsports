import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Check from 'reicon-react/icons/Check'
import { toast } from 'sonner'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

type Props = {
  eventId: string
  attending: boolean
  /** Já resolvida pelo servidor: `null` abaixo do piso. */
  count: number | null
  /** Nome do jogo, para distinguir os botões na leitura por voz. */
  gameLabel: string
  compact?: boolean
}

/**
 * "Vou assistir aqui" (WEB-127). Depois de marcar vira "Você vai assistir
 * aqui", com desfazer. É sempre o mesmo botão, com `aria-disabled` em vez de
 * `disabled` durante o envio: o foco do teclado nunca se perde.
 */
export function AttendanceControl({
  eventId,
  attending,
  count,
  gameLabel,
  compact = false
}: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [announcement, setAnnouncement] = useState('')
  const mutation = useMutation(
    trpc.attendance.set.mutationOptions({
      // Devolver a promessa mantém o botão ocupado até o perfil recarregar.
      onSuccess: (result) => {
        setAnnouncement(
          result.attending
            ? 'Pronto: você vai assistir aqui.'
            : 'Marcação desfeita.'
        )
        return queryClient.invalidateQueries({
          queryKey: trpc.pubs.getById.queryKey()
        })
      },
      onError: (err) =>
        toast.error(
          getUserFacingMessage(err, 'Não foi possível salvar. Tente novamente.')
        )
    })
  )
  const toggle = () => {
    if (!mutation.isPending) mutation.mutate({ eventId, attending: !attending })
  }

  return (
    <fieldset
      aria-label={gameLabel}
      className="m-0 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-0 p-0"
    >
      {attending && (
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--onside-ink)] text-sm">
          <Check size={16} color="currentColor" aria-hidden="true" />
          Você vai assistir aqui
        </span>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-disabled={mutation.isPending}
        aria-busy={mutation.isPending}
        className={`onside-btn ${attending ? 'onside-btn-ghost min-h-11' : compact ? 'onside-btn-outline min-h-11' : 'onside-btn-ink min-h-12'} justify-center text-sm aria-disabled:opacity-50`}
      >
        {attending ? 'Desfazer' : 'Vou assistir aqui'}
      </button>
      {count !== null && (
        <span className="text-[var(--onside-muted)] text-xs">
          {count} pessoas vão assistir aqui
        </span>
      )}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </fieldset>
  )
}
