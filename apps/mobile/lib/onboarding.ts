import type { Layout } from '@/lib/layout'

/*
 * O onboarding do torcedor fora do celular (WEB-492, seleção T6 e página
 * Adaptativo 09 do design). O passo é o mesmo do celular, numa coluna; o que
 * muda é o caminho em volta: o painel escuro à esquerda na tela larga, a
 * faixa no topo no tablet em pé, a pergunta em cima na mesa e o aviso na
 * tela de fora do Flip.
 */

/**
 * Os passos, na ordem das rotas de `app/onboarding/`: o nome, o que pede e a
 * pergunta (o título do passo, que na mesa sobe para a metade de cima).
 */
export const FLOW = [
  {
    route: '',
    name: 'Boas-vindas',
    hint: 'O que a Onside faz',
    ask: 'Vamos achar os melhores bares pro seu jogo.'
  },
  {
    route: 'sports',
    name: 'Esportes',
    hint: 'O que você acompanha',
    ask: 'Quais esportes você curte?'
  },
  {
    route: 'teams',
    name: 'Times',
    hint: 'Para avisar dos jogos',
    ask: 'Quem você acompanha?'
  },
  {
    route: 'distance',
    name: 'Distância',
    hint: 'Até onde você vai',
    ask: 'Quão longe você topa ir?'
  },
  {
    route: 'location',
    name: 'Localização',
    hint: 'Para achar os mais perto',
    ask: 'Usar sua localização?'
  },
  {
    route: 'review',
    name: 'Revisão',
    hint: 'Confira e comece',
    ask: 'Pronto para salvar'
  }
] as const

/** O passo pelo caminho (`/onboarding/teams` → 2). */
export function stepOf(pathname: string) {
  const route = pathname.replace(/^\/onboarding\/?/, '').split('/')[0]
  return Math.max(
    FLOW.findIndex((step) => step.route === route),
    0
  )
}

/** "01", "06": o número grande da etapa. */
export const twoDigits = (n: number) => String(n).padStart(2, '0')

export type Frame =
  /** Celular, capa e Duo fechado: a tela de sempre. */
  | { kind: 'phone' }
  /** Painel escuro à esquerda; o passo à direita, numa coluna. */
  | { kind: 'side'; panel: number; pane: number; column: number }
  /** Faixa escura no topo; o passo numa folha por cima dela. */
  | { kind: 'band'; band: number; column: number }
  /** Meio dobrado: a pergunta em cima, o passo embaixo. */
  | { kind: 'table'; top: number; gap: number; column: number }
  /** A tela de fora do Flip: o aviso para terminar no celular aberto. */
  | { kind: 'cover' }

/**
 * Onde o painel, a faixa e a coluna ficam em cada aparelho (`split9`,
 * `port9` e `table9` do design): o painel tem 42% da tela deitada (40% no
 * 13″ e no Ultra) e a metade no dobrável aberto, até a dobra; a coluna do
 * passo vai até 470 ao lado do painel e até 540 debaixo da faixa.
 */
export function frameOf(layout: Layout, fold: boolean): Frame {
  const { kind, width, height } = layout
  if (kind === 'cover') return { kind: 'cover' }
  if (kind === 'table')
    return {
      kind: 'table',
      top: layout.split,
      gap: layout.gap,
      column: Math.min(540, width - 48)
    }
  if (kind === 'stack')
    return {
      kind: 'band',
      band: Math.round(height * 0.3),
      column: Math.min(540, width - 80)
    }
  if (kind !== 'split') return { kind: 'phone' }
  // No dobrável a dobra divide: o painel numa metade, o passo na outra.
  const panel = fold
    ? layout.split
    : Math.round(width * (layout.wide ? 0.4 : 0.42))
  const pane = width - panel - (fold ? layout.gap : 0)
  return {
    kind: 'side',
    panel,
    pane,
    column: Math.min(470, pane - (fold ? 12 : 48))
  }
}

/**
 * O aviso da tela de fora do Flip: o que já está salvo e o que falta
 * ("Futebol, Basquete e F1 salvos. Falta escolher os times.").
 */
export function coverNote(sports: string[], step: number) {
  const short = sports.map((name) => (name === 'Fórmula 1' ? 'F1' : name))
  const saved =
    short.length === 0
      ? ''
      : `${
          short.length === 1
            ? short[0]
            : `${short.slice(0, -1).join(', ')} e ${short.at(-1)}`
        } ${short.length === 1 ? 'salvo' : 'salvos'}. `
  const missing = [
    'Falta escolher os esportes.',
    'Falta escolher os esportes.',
    'Falta escolher os times.',
    'Falta escolher a distância.',
    'Falta a localização.',
    'Falta confirmar.'
  ][step]
  return `${saved}${missing}`
}
