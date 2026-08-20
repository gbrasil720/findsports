import { useState } from 'react'
import Check from 'reicon-react/icons/Check'
import Xmark from 'reicon-react/icons/Xmark'
import { formatDayLabel } from '@/domain/pub-profile'

export type PendingRating = {
  eventId: string
  barId: string
  barName: string
  neighborhood: string
  championship: string
  startsAt: string
  sport: { name: string; slug: string }
}

type Props = {
  pending: PendingRating[]
  onAnswer: (input: {
    barId: string
    eventId: string
    wouldReturn: boolean
  }) => void
  isPending: boolean
}

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
 */
export function PendingRatingCard({ pending, onAnswer, isPending }: Props) {
  // Só some quando a resposta confirma. Otimismo aqui esconderia falha de
  // rede e o torcedor acharia que avaliou.
  const [index, setIndex] = useState(0)
  const item = pending[index]

  if (!item) return null

  const answer = (wouldReturn: boolean) => {
    onAnswer({ barId: item.barId, eventId: item.eventId, wouldReturn })
    setIndex((current) => current + 1)
  }

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
        {item.championship} · {formatDayLabel(new Date(item.startsAt))} ·{' '}
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
          onClick={() => setIndex((current) => current + 1)}
          className="min-h-11 px-2 font-bold text-[11px] text-[var(--onside-muted)] uppercase tracking-[0.08em] transition-colors hover:text-[var(--onside-ink)]"
        >
          Pular
        </button>
      </div>

      {pending.length > 1 ? (
        <p className="mt-3 font-[family-name:var(--onside-mono)] text-[10px] text-[var(--onside-muted)] uppercase tracking-[0.12em]">
          {index + 1} de {pending.length}
        </p>
      ) : null}
    </section>
  )
}
