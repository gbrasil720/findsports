import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import { getPlan } from '@/lib/plan-catalog'

/**
 * "Assim o torcedor vê" do cadastro do bar (WEB-501): o card do bar desenhado
 * do que o dono preencheu até aqui, com todas as características marcadas.
 * Sem dado inventado: a foto e os jogos chegam depois, e o card diz isso.
 */
export function PubPreview({
  name,
  neighborhood,
  city,
  amenities,
  screenCount,
  plan,
  note
}: {
  name: string
  neighborhood: string
  city: string
  amenities: number[]
  screenCount: number | null
  /** Só na revisão: o selo do plano escolhido, que o Starter não tem. */
  plan?: SubscriptionPlan
  note: string
}) {
  const where = [neighborhood.trim(), city.trim()].filter(Boolean).join(' · ')
  const tags = [
    ...(screenCount
      ? [screenCount === 1 ? '1 tela' : `${screenCount} telas`]
      : []),
    ...amenities.flatMap((id) => findAmenity(id)?.label ?? [])
  ]
  return (
    <>
      <p className="ob-k">Assim o torcedor vê</p>
      <div className="ob-pcard">
        <div className="ob-pimg">
          A foto de capa entra aqui. Você manda depois, no painel do bar.
          {plan && plan !== 'starter' ? (
            <span className="ob-pel">{getPlan(plan).name.toUpperCase()}</span>
          ) : null}
        </div>
        <div className="ob-pin">
          <b>{name.trim() || 'Seu bar'}</b>
          {where ? <p>{where}</p> : null}
          <div className="ob-tags">
            {tags.length ? (
              tags.map((tag) => (
                <span key={tag} className="ob-tag">
                  {tag}
                </span>
              ))
            ) : (
              <span className="ob-tag">Marque o que o bar tem</span>
            )}
          </div>
          <div className="ob-pgame">
            <span className="ob-k">Seus jogos aparecem aqui</span>
            <p>Depois do cadastro, você coloca os jogos que vai passar.</p>
          </div>
          <span className="ob-pbtn" aria-hidden="true">
            Vou assistir aqui
          </span>
        </div>
      </div>
      <p className="ob-note">{note}</p>
    </>
  )
}
