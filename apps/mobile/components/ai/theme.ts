import { ACID, INK, LIVE, PAPER } from '@/components/ui'
import { PALETTE, usePalette } from '../explore'

/*
 * As cores das peças do chat (Rodada 24), claro e escuro, como o HTML do
 * design escreve. Em cima da paleta do Explorar (`card`, `muted`, `ring`…),
 * que os cards de bar já usam.
 */
const AI = {
  light: {
    ...PALETTE.light,
    /** Fundo da folha (rgba .97 sobre o mapa). */
    sheet: '#f1eee6',
    /** Título da 24a: "assistir?" em vermelho. */
    hot: '#c92b0c',
    /** Chips de contexto e de filtro. */
    soft: 'rgba(18,18,15,.06)',
    softer: 'rgba(18,18,15,.08)',
    /** Contorno dos botões do campo, das fontes e do "Agora não". */
    outline: 'rgba(18,18,15,.10)',
    /** Etiquetas dentro dos passos ("Corinthians", "Hoje"). */
    stepTag: '#e7e3db',
    stepTagText: INK,
    rail: 'rgba(18,18,15,.12)',
    todo: 'rgba(18,18,15,.18)',
    spinTrack: 'rgba(18,18,15,.14)',
    spin: LIVE,
    /** O status "Rodando" da ferramenta. */
    toolPill: '#e7e3db',
    drop: 'rgba(18,18,15,.09)',
    dash: 'rgba(18,18,15,.10)',
    bubble: INK,
    bubbleText: PAPER,
    stop: INK,
    stopMark: PAPER,
    sendShadow: INK,
    thumbOn: 'rgba(201,241,53,.45)',
    tasteRing: 'rgba(18,18,15,.12)',
    switchOn: INK,
    knobOn: ACID,
    switchOff: 'rgba(18,18,15,0.12)',
    confirmShadow: INK,
    /** Contorno do "Agora não" na confirmação. */
    later: 'rgba(18,18,15,.10)',
    /** Anel do número no canto do card (a cor da folha). */
    citeRing: PAPER,
    statusRing: 'rgba(201,241,53,.3)'
  },
  dark: {
    ...PALETTE.dark,
    sheet: '#161613',
    /** Sombra dura dos cards no escuro (a do design é mais forte). */
    shadow: 'rgba(0,0,0,.6)',
    hot: ACID,
    soft: 'rgba(241,238,230,.1)',
    softer: 'rgba(241,238,230,.14)',
    outline: 'rgba(241,238,230,.2)',
    stepTag: 'rgba(241,238,230,.1)',
    stepTagText: PAPER,
    rail: 'rgba(241,238,230,.14)',
    todo: 'rgba(241,238,230,.2)',
    spinTrack: 'rgba(241,238,230,.18)',
    spin: ACID,
    toolPill: '#2c2c27',
    drop: 'rgba(0,0,0,.6)',
    dash: 'rgba(241,238,230,.10)',
    bubble: PAPER,
    bubbleText: INK,
    stop: PAPER,
    stopMark: INK,
    sendShadow: '#000',
    thumbOn: 'rgba(201,241,53,.18)',
    tasteRing: 'rgba(201,241,53,.25)',
    switchOn: ACID,
    knobOn: INK,
    switchOff: '#34342e',
    confirmShadow: '#000',
    later: 'rgba(241,238,230,.22)',
    citeRing: '#161613',
    statusRing: 'rgba(201,241,53,.3)'
  }
}

export type AiPalette = (typeof AI)['light'] | (typeof AI)['dark']

export function useAiPalette(): AiPalette {
  return AI[usePalette().dark ? 'dark' : 'light']
}

export const AI_PALETTE = AI
