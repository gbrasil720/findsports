import { useEffect, useRef } from 'react'
import { brasiliaTime, longDayLabel } from '@/components/painel/noite'
import { estadoDoJogo, type JogoDaRegua, regua } from '@/domain/explorar'

/*
 * A régua da noite do protótipo (`.night`): os jogos do dia em faixas, das
 * 16h às 2h, com o "agora" em vermelho. No celular vira o carrossel (`.gcar`).
 */

type Dia = { day: string; rotulo: string }

type Props = {
  dias: Dia[]
  dia: string
  onDia: (day: string) => void
  jogos: JogoDaRegua[]
  escolhido: string | undefined
  onJogo: (key: string) => void
  now: number
}

export function Dias({
  dias,
  dia,
  onDia
}: Pick<Props, 'dias' | 'dia' | 'onDia'>) {
  return (
    <div className="days" role="tablist" aria-label="Dia">
      {dias.map((d) => (
        <button
          key={d.day}
          type="button"
          role="tab"
          aria-selected={d.day === dia}
          className={d.day === dia ? 'on' : undefined}
          onClick={() => onDia(d.day)}
        >
          {d.rotulo}
        </button>
      ))}
    </div>
  )
}

function Rotulo({
  jogo,
  now,
  curto
}: {
  jogo: JogoDaRegua
  now: number
  curto?: boolean
}) {
  const estado = estadoDoJogo(jogo, now)
  return (
    <>
      <span className="t1">
        <span>
          {estado === 'live' ? (
            <>
              <span className="pulse" />
              AO VIVO · começou {brasiliaTime(jogo.startsAt)}
            </>
          ) : (
            brasiliaTime(jogo.startsAt)
          )}{' '}
          · {jogo.championship}
        </span>
        <span>{estado === 'past' ? (curto ? 'fim' : 'encerrado') : ''}</span>
      </span>
      <span className="t2">
        <b>{jogo.title}</b>
        <span className="n">
          {curto
            ? jogo.bars.length
            : `${jogo.bars.length} ${jogo.bars.length === 1 ? 'bar' : 'bares'}`}
        </span>
      </span>
    </>
  )
}

export function Regua({
  dias,
  dia,
  onDia,
  jogos,
  escolhido,
  onJogo,
  now
}: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const { horas, faixas, lanes, agora, minWidth } = regua(jogos, dia, now)

  // Abre com o jogo escolhido no meio da régua, como no protótipo.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao trocar de dia ou de jogo
  useEffect(() => {
    const el = wrap.current
    const sel = el?.querySelector<HTMLElement>('.gm.sel')
    if (!el || !sel) return
    el.scrollLeft = sel.offsetLeft + sel.offsetWidth / 2 - el.clientWidth / 2
  }, [dia, escolhido])

  return (
    <section className="night" aria-label="Jogos do dia">
      <div className="night-h">
        <Dias dias={dias} dia={dia} onDia={onDia} />
        <span className="now">
          {longDayLabel(dia)}
          {agora !== null ? (
            <>
              {' '}
              · agora <b>{brasiliaTime(new Date(now))}</b>
            </>
          ) : null}{' '}
          · {jogos.length} {jogos.length === 1 ? 'jogo' : 'jogos'} com bar perto
        </span>
      </div>
      <div className="rule-wrap" ref={wrap}>
        <div className="rule" style={{ minWidth, height: 36 + lanes * 63 + 4 }}>
          <div className="hours">
            {horas.map((h) => (
              <span key={h.at} style={{ left: `${h.at}%` }}>
                {String(h.hora).padStart(2, '0')}h
              </span>
            ))}
          </div>
          <div
            className="grid"
            style={{ backgroundSize: `${100 / (horas.length - 1)}% 100%` }}
          />
          {agora !== null ? (
            <div className="nowline" style={{ left: `${agora}%` }} />
          ) : null}
          {faixas.map(({ jogo, left, width, lane }) => {
            const estado = estadoDoJogo(jogo, now)
            const sel = jogo.key === escolhido
            return (
              <button
                key={jogo.key}
                type="button"
                className={`gm${estado === 'next' ? '' : ` ${estado}`}${sel ? ' sel' : ''}`}
                aria-pressed={sel}
                onClick={() => onJogo(jogo.key)}
                style={{
                  left: `calc(${left}% + 3px)`,
                  width: `calc(${width}% - 6px)`,
                  top: 36 + lane * 63
                }}
              >
                <Rotulo jogo={jogo} now={now} />
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export function Carrossel({
  jogos,
  escolhido,
  onJogo,
  now
}: Pick<Props, 'jogos' | 'escolhido' | 'onJogo' | 'now'>) {
  const wrap = useRef<HTMLDivElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao trocar de jogo
  useEffect(() => {
    const el = wrap.current
    const sel = el?.querySelector<HTMLElement>('.gm.sel')
    if (el && sel) el.scrollLeft = sel.offsetLeft - 16
  }, [escolhido])
  return (
    <div className="gcar" ref={wrap}>
      {jogos.map((jogo) => {
        const estado = estadoDoJogo(jogo, now)
        const sel = jogo.key === escolhido
        return (
          <button
            key={jogo.key}
            type="button"
            className={`gm${estado === 'next' ? '' : ` ${estado}`}${sel ? ' sel' : ''}`}
            aria-pressed={sel}
            onClick={() => onJogo(jogo.key)}
          >
            <Rotulo jogo={jogo} now={now} curto />
          </button>
        )
      })}
    </div>
  )
}
