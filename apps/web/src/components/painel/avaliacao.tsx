import {
  type RatingReasonId,
  reasonLabel
} from '@findsports_oficial/api/lib/rating-reasons'
import { Check, Close, Star } from '@/components/landing/v3/icons'
import { dayLabel, houseDay } from './noite'

/** Uma avaliação como `pub.getMyRatings` a devolve. */
export type AvaliacaoDoBar = {
  id: string
  wouldReturn: boolean
  reasons: RatingReasonId[]
  stars: number | null
  verified: boolean
  comment: string | null
  commentPending: boolean
  name: string | null
  createdAt: string
  championship: string
  participantFreeText: string | null
  participants: string[]
}

/**
 * Uma linha de "Avaliações recentes" (Hoje) e de "Voltariam pra ver jogo
 * aqui?" (Meu espaço), no `.rev` do desenho: o "voltaria", o jogo, as
 * estrelas e, embaixo, o comentário aprovado ou o que pesou, quem avaliou e
 * o dia (WEB-451). Nome só de quem quis aparecer. A não verificada leva o
 * selo: o dono a lê, mas ela não entra na nota (WEB-408).
 */
export function LinhaDeAvaliacao({ item }: { item: AvaliacaoDoBar }) {
  const jogo =
    item.participants.join(' × ') ||
    item.participantFreeText ||
    item.championship
  const meta = [
    item.name ?? 'Anônimo',
    !item.comment && item.reasons.length
      ? `O que pesou: ${item.reasons.map(reasonLabel).join(', ')}`
      : null,
    item.commentPending ? 'comentário em revisão' : null,
    dayLabel(houseDay(item.createdAt))
  ].filter(Boolean)
  return (
    <div className="pn-rev">
      <span className={`pn-v${item.wouldReturn ? '' : ' is-no'}`}>
        {item.wouldReturn ? <Check size={18} /> : <Close size={16} />}
      </span>
      <span>
        <b>{item.wouldReturn ? 'Voltaria' : 'Não voltaria'}</b> · {jogo}
        {item.stars ? <Estrelas nota={item.stars} /> : null}
        {item.verified ? null : (
          <span className="pn-badge pn-rev-nv">NÃO VERIFICADA</span>
        )}
        {item.comment ? <p className="pn-rev-q">“{item.comment}”</p> : null}
        <p>{meta.join(' · ')}</p>
      </span>
    </div>
  )
}

function Estrelas({ nota }: { nota: number }) {
  return (
    <span
      className="pn-rev-stars"
      role="img"
      aria-label={`${nota} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= nota ? undefined : 'is-off'}>
          <Star />
        </span>
      ))}
    </span>
  )
}
