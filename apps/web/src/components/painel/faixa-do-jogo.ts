import type { EventNumbers } from '@findsports_oficial/api/lib/event-numbers'

/*
 * A faixa de três números do jogo publicado em Jogos (WEB-433, PJ-depois e
 * PJ-estados): antes, durante e depois do jogo. "Seu horário mais cheio" das
 * pranchas ficou de fora. "Primeira vez no bar" (WEB-530) é do Elite: ao vivo
 * é a terceira célula, no lugar do bairro; depois, a linha sob "viram o bar".
 */

export type Celula = {
  valor: string
  rotulo: string
  /** Linha a mais sob o rótulo ("+12 desde ontem"), em verde. */
  extra?: string
  verde?: boolean
}

const HOUR = 3_600_000

/** "27 h" até dois dias; depois "3 dias". */
export function paraOJogo(ms: number): string {
  const horas = Math.max(0, Math.ceil(ms / HOUR))
  return horas < 48 ? `${horas} h` : `${Math.round(horas / 24)} dias`
}

const n = (v: number) => v.toLocaleString('pt-BR')

export function faixaDoJogo(input: {
  state: 'upcoming' | 'live' | 'past'
  numbers: EventNumbers | undefined
  startsAt: string
  now: number
  neighborhood: string
  /** Elite: quem vai e quem chegou (`barReservations.going`). */
  going?: { going: number; arrived: number }
}): Celula[] | null {
  const { numbers: x, neighborhood } = input
  if (!x) return null
  const bairro: Celula = {
    valor: n(x.barsInNeighborhood),
    rotulo: `${x.barsInNeighborhood === 1 ? 'outro bar' : 'outros bares'} de ${neighborhood} com ele`
  }
  const interesse: Celula = {
    valor: n(x.interested),
    rotulo: 'se interessaram'
  }
  if (input.state === 'upcoming')
    return [
      x.interestedLastDay
        ? { ...interesse, extra: `+${n(x.interestedLastDay)} desde ontem` }
        : interesse,
      bairro,
      {
        valor: paraOJogo(Date.parse(input.startsAt) - input.now),
        rotulo: 'para o jogo'
      }
    ]
  if (input.state === 'live')
    return input.going
      ? [
          { valor: n(input.going.going), rotulo: 'vão' },
          {
            valor: n(input.going.arrived),
            rotulo: 'chegaram com código',
            verde: true
          },
          x.firstTime === null
            ? bairro
            : { valor: n(x.firstTime), rotulo: 'primeira vez no bar' }
        ]
      : [
          interesse,
          bairro,
          { valor: n(x.views), rotulo: 'viram o bar por ele' }
        ]
  const vistas: Celula = { valor: n(x.views), rotulo: 'viram o bar por ele' }
  return [
    x.firstTime
      ? {
          ...vistas,
          extra: `${n(x.firstTime)} ${x.firstTime === 1 ? 'veio' : 'vieram'} pela primeira vez`
        }
      : vistas,
    interesse,
    x.vsAverage === null
      ? { valor: '—', rotulo: 'média depois de 5 jogos' }
      : {
          valor: `${x.vsAverage >= 0 ? '▲' : '▼'} ${Math.abs(x.vsAverage)}%`,
          rotulo: `${x.vsAverage >= 0 ? 'acima' : 'abaixo'} da sua média`,
          verde: x.vsAverage > 0
        }
  ]
}
