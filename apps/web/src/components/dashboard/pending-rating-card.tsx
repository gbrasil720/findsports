import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Xmark from 'reicon-react/icons/Xmark'
import { toast } from 'sonner'
import { formatDayLabel } from '@/domain/pub-profile'
import { getGameTitle } from '@/domain/reservation-validation'
import { toastWithUndo } from '@/lib/undo-toast'
import { getUserFacingMessage } from '@/lib/user-facing-error'
import { useTRPC } from '@/utils/trpc'

export type PendingRating = {
  eventId: string
  barId: string
  barName: string
  neighborhood: string
  championship: string
  participantFreeText: string | null
  participants: string[]
  startsAt: string
  sport: { name: string; slug: string }
}

type Props = { pending: PendingRating[] }

/**
 * O card que pergunta, no dia seguinte ao jogo, se valeu a pena.
 *
 * É a peça de que o sistema inteiro de avaliação depende: ninguém volta
 * sozinho ao perfil de um bar para avaliar. Sem uma superfície que pergunte
 * na hora certa, o schema, o portão e a ordenação existiriam para colher
 * silêncio.
 *
 * Uma pergunta por vez, e a resposta é um toque. Uma lista de pendências com
 * cinco cartões empilhados no topo do dashboard afugenta quem entrou para
 * procurar bar — que é o trabalho principal desta tela, e continua sendo.
 *
 * A confirmação é um aviso com "Desfazer" (WEB-321), que guarda o jogo
 * respondido: desfazer nunca age sobre a pergunta que estiver na tela.
 */
export function PendingRatingCard({ pending }: Props) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  // Por jogo, não por posição: a lista encolhe a cada resposta e cresce a
  // cada desfazer, e uma posição guardada passaria a apontar para outro jogo.
  const [skipped, setSkipped] = useState<string[]>([])
  // A pergunta desfeita volta na frente das outras: é a que o torcedor quer
  // corrigir.
  const [front, setFront] = useState<string | null>(null)
  const open = pending.filter(({ eventId }) => !skipped.includes(eventId))
  const item = open.find(({ eventId }) => eventId === front) ?? open[0]

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.ratings.getPending.queryKey()
    })
  const undo = useMutation(
    trpc.ratings.remove.mutationOptions({
      onSuccess: (_data, { eventId }) => {
        setFront(eventId)
        return refresh()
      }
    })
  )
  // Só some quando a resposta confirma. Otimismo aqui esconderia falha de
  // rede e o torcedor acharia que avaliou.
  const submit = useMutation(
    trpc.ratings.submit.mutationOptions({
      onSuccess: async (_data, { barId, eventId }) => {
        await refresh()
        toastWithUndo('Obrigado! Sua resposta ajuda outros torcedores.', () =>
          undo.mutateAsync({ barId, eventId })
        )
      },
      onError: (err) =>
        toast.error(
          getUserFacingMessage(
            err,
            'Não foi possível registrar sua avaliação. Tente novamente.'
          )
        )
    })
  )
  const isPending = submit.isPending

  if (!item) return null

  const answer = (wouldReturn: boolean) =>
    submit.mutate({ barId: item.barId, eventId: item.eventId, wouldReturn })

  return (
    <section
      className="onside-panel mb-6 p-4 md:p-5"
      aria-labelledby="pending-rating-title"
    >
      <p className="onside-kicker mb-1">Como foi?</p>
      <h2
        id="pending-rating-title"
        className="onside-display text-xl md:text-2xl"
      >
        Voltaria pra ver jogo no {item.barName}?
      </h2>
      <p className="mt-1 text-[var(--onside-muted)] text-sm">
        {getGameTitle(item)} · {formatDayLabel(new Date(item.startsAt))} ·{' '}
        {item.neighborhood}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={isPending}
          className="onside-btn onside-btn-acid min-h-11 px-4 text-xs disabled:opacity-60"
        >
          <Check size={15} color="currentColor" aria-hidden="true" />
          Voltaria
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={isPending}
          className="onside-btn onside-btn-outline min-h-11 px-4 text-xs disabled:opacity-60"
        >
          <Xmark size={15} color="currentColor" aria-hidden="true" />
          Não voltaria
        </button>
        <button
          type="button"
          onClick={() => setSkipped((current) => [...current, item.eventId])}
          disabled={isPending}
          className="min-h-11 px-2 font-bold text-[11px] text-[var(--onside-muted)] uppercase tracking-[0.08em] transition-colors hover:text-[var(--onside-ink)]"
        >
          Pular
        </button>
      </div>

      {pending.length > 1 ? (
        <p className="mt-3 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
          {pending.indexOf(item) + 1} de {pending.length}
        </p>
      ) : null}
    </section>
  )
}
