import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import Check from 'reicon-react/icons/Check'
import { toast } from 'sonner'
import { formatCode } from '@/domain/my-games'
import { formatMatchup, type ProfileEvent } from '@/domain/pub-profile'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'
import { AttendanceCodeDialog } from './attendance-code-dialog'

type Props = {
  eventId: string
  attending: boolean
  /** Já resolvida pelo servidor: `null` abaixo do piso. */
  count: number | null
  /** O código do balcão, só em bar Elite. */
  code?: string | null
  /** Código validado: a oferta saiu e não dá mais para desmarcar. */
  validated?: boolean
  /** Bar que confirma pela comanda (WEB-412): o código vai para o garçom. */
  forWaiter?: boolean
  /** Nome do jogo, para distinguir os botões na leitura por voz. */
  gameLabel: string
  compact?: boolean
}

/**
 * "Vou assistir aqui" (WEB-127). Depois de marcar vira "Você vai assistir
 * aqui", com desfazer, e no bar Elite mostra o código que vale a oferta da
 * casa no balcão. É sempre o mesmo botão, com `aria-disabled` em vez de
 * `disabled` durante o envio: o foco do teclado nunca se perde. O código que
 * acabou de sair abre num diálogo, que devolve o foco ao botão ao fechar.
 */
export function AttendanceControl({
  eventId,
  attending,
  count,
  code = null,
  validated = false,
  forWaiter = false,
  gameLabel,
  compact = false
}: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [announcement, setAnnouncement] = useState('')
  const [issued, setIssued] = useState<{
    code: string
    offer: string | null
    forWaiter: boolean
  } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const mutation = useMutation(
    trpc.attendance.set.mutationOptions({
      // Devolver a promessa mantém o botão ocupado até o perfil recarregar.
      onSuccess: (result) => {
        setAnnouncement(
          result.attending
            ? 'Pronto: você vai assistir aqui.'
            : 'Marcação desfeita.'
        )
        if (result.attending && result.code) {
          setIssued({
            code: result.code,
            offer: result.offer,
            forWaiter: result.confirmsCodesLater
          })
        }
        void queryClient.invalidateQueries({
          queryKey: trpc.attendance.mine.queryKey()
        })
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
      {!validated && (
        <button
          ref={buttonRef}
          type="button"
          onClick={toggle}
          aria-disabled={mutation.isPending}
          aria-busy={mutation.isPending}
          className={`onside-btn ${attending ? 'onside-btn-ghost' : compact ? 'onside-btn-outline' : 'onside-btn-ink'} aria-disabled:opacity-50`}
        >
          {attending ? 'Desfazer' : 'Vou assistir aqui'}
        </button>
      )}
      {count !== null && (
        <span className="text-[var(--onside-muted)] text-xs">
          {count} pessoas vão assistir aqui
        </span>
      )}
      {attending && code && (
        <span className="basis-full text-sm">
          Seu código:{' '}
          <span className="font-[family-name:var(--onside-mono)] font-bold tracking-[0.15em]">
            {formatCode(code)}
          </span>
          {validated
            ? forWaiter
              ? ' · validado'
              : ' · validado no balcão'
            : forWaiter
              ? ' · mostre ao garçom, que anota na comanda. Fica em Meus jogos.'
              : ' · mostre no balcão. Fica em Meus jogos.'}
        </span>
      )}
      <span className="sr-only" role="status">
        {announcement}
      </span>
      {issued ? (
        <AttendanceCodeDialog
          code={issued.code}
          offer={issued.offer}
          forWaiter={issued.forWaiter}
          onClose={() => setIssued(null)}
          returnFocus={buttonRef}
        />
      ) : null}
    </fieldset>
  )
}

/**
 * "Vou assistir aqui" do jogo em destaque. O perfil e a prévia do dono usam
 * este mesmo bloco.
 */
export function HeroAttendance({
  game,
  attendance,
  forWaiter = false
}: {
  game: ProfileEvent
  forWaiter?: boolean
  attendance: {
    attending: boolean
    count: number | null
    code: string | null
    validated: boolean
  }
}) {
  return (
    <AttendanceControl
      eventId={game.id}
      attending={attendance.attending}
      count={attendance.count}
      code={attendance.code}
      validated={attendance.validated}
      forWaiter={forWaiter}
      gameLabel={formatMatchup(game)}
    />
  )
}
