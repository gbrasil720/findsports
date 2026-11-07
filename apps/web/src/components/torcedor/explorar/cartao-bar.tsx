import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import { brasiliaTime } from '@/components/painel/noite'
import {
  abertoAgora,
  type BarDoJogo,
  type BarSemJogo,
  distancia,
  type EstadoDoJogo,
  type JogoDaRegua
} from '@/domain/explorar'
import { Ic, type IconName } from '../icones'

/*
 * O cartão de bar da lista do Explorar (`.bc` do protótipo): a foto com a
 * hora do jogo, o nome, o que tem para ver o jogo, a oferta do Elite, quem
 * vai e a nota de quem foi. "Vou assistir aqui" e o coração pedem conta.
 */

const ETIQUETAS: [number, string, IconName | null][] = [
  [3, 'Premiere', 'premiere'],
  [4, 'Área externa', 'outdoor'],
  [5, 'Área coberta', 'outdoor'],
  [22, 'Perto do metrô', null],
  [11, 'Cozinha até tarde', null],
  [21, 'Drinks', null]
]

export function etiquetas(bar: BarDoJogo): [string, IconName | null][] {
  const lista: [string, IconName | null][] = []
  if (bar.onBigScreen) lista.push(['Telão', 'tv'])
  if (bar.withSound) lista.push(['Som ligado', 'sound'])
  for (const [id, rotulo, icone] of ETIQUETAS) {
    if (bar.amenities.includes(id)) lista.push([rotulo, icone])
  }
  return lista.slice(0, 3)
}

const PILHA = ['#e8320c', '#2f55c7', '#c9b79c']

export function quando(
  jogo: JogoDaRegua,
  estado: EstadoDoJogo,
  rotuloDoDia: string
) {
  if (estado === 'live')
    return `● AO VIVO · começou ${brasiliaTime(jogo.startsAt)}`
  if (estado === 'past') return 'encerrado'
  return `${rotuloDoDia.toLowerCase()} ${brasiliaTime(jogo.startsAt)}`
}

type Props = {
  bar: BarDoJogo
  jogo: JogoDaRegua
  estado: EstadoDoJogo
  rotuloDoDia: string
  salvo: boolean
  vou: boolean
  quente?: boolean
  atraso?: number
  curto?: boolean
  onSalvar: () => void
  onVou: () => void
  onQuente?: (id: string | null) => void
  /** Abriu o bar pelo cartão (mede o clique no clássico). */
  onAbrir?: () => void
}

export function CartaoBar({
  bar,
  jogo,
  estado,
  rotuloDoDia,
  salvo,
  vou,
  quente,
  atraso = 0,
  curto,
  onSalvar,
  onVou,
  onQuente,
  onAbrir
}: Props) {
  const aberto = estado === 'next' && bar.attendanceEnabled
  const linkDoBar = {
    to: '/pub/$pubId' as const,
    params: { pubId: bar.barId },
    search: { eventId: bar.eventId },
    onClick: onAbrir
  }
  return (
    <article
      className={`bc${quente ? ' hot' : ''}`}
      data-bar={bar.barId}
      style={{ animationDelay: `${atraso}ms` } as CSSProperties}
      onMouseEnter={() => onQuente?.(bar.barId)}
      onMouseLeave={() => onQuente?.(null)}
    >
      <Link className="ph" {...linkDoBar} aria-label={`Abrir ${bar.name}`}>
        {bar.photoUrl ? (
          <img
            src={bar.photoUrl}
            alt=""
            loading="lazy"
            width={480}
            height={360}
          />
        ) : (
          <span className="ph-vazio">
            <Ic n="beer" s={40} />
          </span>
        )}
        <span className={`when${estado === 'live' ? ' lv' : ''}`}>
          {quando(jogo, estado, rotuloDoDia)}
        </span>
        {bar.elite ? <span className="elite">ELITE</span> : null}
      </Link>
      <div className="bd">
        <div className="r1">
          <div>
            <h3>
              <Link {...linkDoBar} style={{ textDecoration: 'none' }}>
                {bar.name}
              </Link>
            </h3>
            <p className="meta">
              {bar.neighborhood} ·{' '}
              <span className="mono">{distancia(bar.distanceKm)}</span>
              {bar.closes
                ? ` · ${curto ? 'até' : 'aberto até'} ${bar.closes}`
                : null}
            </p>
          </div>
          <button
            className="fav"
            type="button"
            aria-pressed={salvo}
            aria-label={
              salvo ? `Tirar ${bar.name} de Seus bares` : `Salvar ${bar.name}`
            }
            onClick={onSalvar}
          >
            <Ic n="heart" s={21} />
          </button>
        </div>
        {etiquetas(bar).length ? (
          <ul className="tags">
            {etiquetas(bar).map(([rotulo, icone]) => (
              <li key={rotulo}>
                {icone ? <Ic n={icone} s={16} /> : null}
                {rotulo}
              </li>
            ))}
          </ul>
        ) : null}
        {bar.offer ? (
          <div className="offer">
            <i>
              <Ic n="beer" s={18} />
            </i>
            <span>
              <b>{curto ? 'Oferta:' : 'Oferta da casa:'}</b> {bar.offer}
            </span>
          </div>
        ) : null}
        <div className="ft">
          <span className="going">
            {bar.going ? (
              <>
                <span className="stack" aria-hidden="true">
                  {bar.going.initials.map((letra, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: as iniciais podem repetir
                      key={i}
                      style={{ background: PILHA[i % PILHA.length] }}
                    >
                      {letra}
                    </span>
                  ))}
                </span>
                <span>
                  <b>{bar.going.count}</b> {curto ? 'vão' : 'vão neste jogo'}
                </span>
              </>
            ) : (
              <span className="muted">Seja dos primeiros a marcar</span>
            )}
          </span>
          <span className="rate">
            {bar.rating ? (
              <>
                {bar.rating.stars !== null ? (
                  <b>{bar.rating.stars.toFixed(1).replace('.', ',')}</b>
                ) : null}{' '}
                {bar.rating.total} verificadas
              </>
            ) : (
              'poucas avaliações'
            )}
          </span>
        </div>
        {vou ? (
          <Link className="btn b-acid sm go" to="/dashboard/games">
            <Ic n="check" s={18} />
            Você vai · Meus jogos
          </Link>
        ) : aberto ? (
          <button className="btn b-ink sm go" type="button" onClick={onVou}>
            Vou assistir aqui
          </button>
        ) : (
          <Link className="btn b-ghost sm go" {...linkDoBar}>
            Ver o bar
          </Link>
        )}
      </div>
    </article>
  )
}

/**
 * O cartão do bar sem jogo no dia, abaixo dos que passam o jogo: mais
 * discreto, sem a faixa do jogo nem as ações. Nome, bairro, distância e se
 * está aberto agora; o cartão todo abre o bar.
 */
export function CartaoSemJogo({
  bar,
  quente,
  onQuente
}: {
  bar: BarSemJogo
  quente?: boolean
  onQuente?: (id: string | null) => void
}) {
  const aberto = abertoAgora(bar.opening)
  return (
    <article
      className={`bq${quente ? ' hot' : ''}`}
      data-bar={bar.barId}
      onMouseEnter={() => onQuente?.(bar.barId)}
      onMouseLeave={() => onQuente?.(null)}
    >
      <Link to="/pub/$pubId" params={{ pubId: bar.barId }}>
        {bar.photoUrl ? (
          <img
            src={bar.photoUrl}
            alt=""
            loading="lazy"
            width={72}
            height={72}
          />
        ) : (
          <span className="ph-vazio">
            <Ic n="beer" s={26} />
          </span>
        )}
        <div className="bq-bd">
          <h3>{bar.name}</h3>
          <p className="meta">
            {bar.neighborhood} ·{' '}
            <span className="mono">{distancia(bar.distanceKm)}</span>
          </p>
          {aberto ? (
            <p className={`hr${bar.opening?.open ? ' on' : ''}`}>{aberto}</p>
          ) : null}
        </div>
      </Link>
    </article>
  )
}
