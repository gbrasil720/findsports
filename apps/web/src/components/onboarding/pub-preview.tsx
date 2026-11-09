import { findAmenity } from '@findsports_oficial/api/lib/amenities'
import type { SubscriptionPlan } from '@findsports_oficial/db'
import Call from 'reicon-react/icons/Call'
import { Pin } from '@/components/landing/v3/icons'
import { getPlan } from '@/lib/plan-catalog'
import { formatStoredPhone } from '@/utils/format-phone'

/**
 * "Assim o torcedor vê" do cadastro do bar (WEB-501): o card do bar desenhado
 * do que o dono preencheu até aqui, com todas as características marcadas.
 * Sem dado inventado: a foto e os jogos chegam depois, e o card diz isso.
 */
export function PubPreview({
  name,
  address = '',
  phone = '',
  description = '',
  neighborhood,
  city,
  amenities,
  screenCount,
  photoUrl,
  plan,
  game,
  note
}: {
  name: string
  /** Rua e número, como no cadastro. */
  address?: string
  phone?: string
  description?: string
  neighborhood: string
  city: string
  amenities: number[]
  screenCount: number | null
  /** A capa escolhida no passo do estabelecimento, ainda no navegador. */
  photoUrl?: string | null
  /** Só na revisão: o selo do plano escolhido, que o Starter não tem. */
  plan?: SubscriptionPlan
  /**
   * Depois do "no ar" ("Seu primeiro jogo"): o jogo publicado, ou `null`
   * enquanto não há. Ausente no cadastro, que ainda não tem jogo.
   */
  game?: { when: string; title: string } | null
  note: string
}) {
  const where = [address.trim(), neighborhood.trim(), city.trim()]
    .filter(Boolean)
    .join(' · ')
  const about = description.trim()
  const contact = phone.trim() ? formatStoredPhone(phone.trim()) : ''
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
        <div className={`ob-pimg${photoUrl ? ' has' : ''}`}>
          {photoUrl ? (
            // biome-ignore lint/performance/noImgElement: prévia de um arquivo local (blob:), sem otimizador.
            <img key={photoUrl} src={photoUrl} alt="" />
          ) : (
            'A foto de capa entra aqui. Você escolhe no passo do estabelecimento ou depois, no painel.'
          )}
          {plan && plan !== 'starter' ? (
            <span className="ob-pel">{getPlan(plan).name.toUpperCase()}</span>
          ) : null}
        </div>
        <div className="ob-pin">
          <b>{name.trim() || 'Seu bar'}</b>
          {where ? (
            <p className="ob-pwhere">
              <Pin size={14} />
              <span>{where}</span>
            </p>
          ) : null}
          {about ? <p className="ob-pabout">{about}</p> : null}
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
          {contact ? (
            <span className="ob-pcall">
              <Call size={15} aria-hidden="true" />
              {contact}
            </span>
          ) : null}
          <div className="ob-pgame">
            {game ? (
              <>
                <span className="ob-k">{game.when}</span>
                <p>
                  <b>{game.title}</b>
                </p>
              </>
            ) : game === null ? (
              <>
                <span className="ob-k">Seu primeiro jogo aparece aqui</span>
                <p>Escolha uma sugestão ou escreva o jogo.</p>
              </>
            ) : (
              <>
                <span className="ob-k">Seus jogos aparecem aqui</span>
                <p>Depois do cadastro, você coloca os jogos que vai passar.</p>
              </>
            )}
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

/**
 * A direita das boas-vindas: antes de o dono preencher qualquer coisa, o card
 * vazio não mostrava nada. Aqui vai o telão com a página de um bar de verdade
 * no app (a mesma tela da landing), marcada como exemplo.
 */
export function PubWelcomeTv() {
  return (
    <div className="ob-tv">
      {/* biome-ignore lint/performance/noImgElement: pôster estático do telão, de public/landing/v3, com width e height. */}
      <img
        className="ob-tv-bg"
        src="/landing/v3/led-hero.webp"
        alt=""
        width="1920"
        height="1280"
      />
      <p className="ob-tv-k">Assim o torcedor acha o seu bar</p>
      <div className="phone">
        {/* biome-ignore lint/performance/noImgElement: captura estática do app, de public/landing/v3, com width e height. */}
        <img
          src="/landing/v3/tela-bar.webp"
          alt="Exemplo: a página do Bar do Zé no app, com o jogo de hoje no telão, o que o bar tem e quantas pessoas vão"
          width="448"
          height="976"
        />
      </div>
      <p className="ob-tv-cap">
        Exemplo. A página do seu bar fica assim, com os seus jogos.
      </p>
    </div>
  )
}
