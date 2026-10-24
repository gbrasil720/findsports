import { createContext, type ReactNode, useContext } from 'react'
import { useColorScheme } from 'react-native'

/*
 * A tabela de cores do app, claro e escuro. É a fonte das duas formas de cor:
 * `usePalette()` (JS, para cor calculada e para o Android) e as constantes
 * dinâmicas do iOS de `components/ui.tsx` (`FG`, `BG`...), que saem daqui.
 */

export const INK = '#12120f'
export const PAPER = '#f1eee6'
export const ACID = '#c9f135'
export const LIVE = '#e8320c'
export const MUTED = '#55554f'
export const ACCENT = '#c92b0c'

export const PALETTE = {
  light: {
    dark: false,
    bg: PAPER,
    sheet: PAPER,
    card: '#faf8f3',
    ink: INK,
    muted: MUTED,
    line: 'rgba(18,18,15,.12)',
    ring: 'rgba(18,18,15,.08)',
    mark: '#e7e3db',
    markRing: 'rgba(18,18,15,.08)',
    dash: 'rgba(18,18,15,.16)',
    grabber: 'rgba(18,18,15,.18)',
    live: ACCENT,
    accent: LIVE,
    shadow: 'rgba(18,18,15,.09)',
    liveShadow: 'rgba(232,50,12,.28)',
    /** O trecho em destaque do título: vermelho no claro, acid no escuro. */
    hot: ACCENT,
    /** Caixa de texto. */
    field: '#fffdf8',
    /** Borda fina de card das telas de conta. */
    cardLine: 'rgba(18,18,15,.08)',
    /** Borda de campo e trilho vazio. */
    fieldLine: 'rgba(18,18,15,.14)',
    /** A sombra dura dos botões acid: tinta some no fundo de tinta, vira preto. */
    edge: INK,
    /** A sombra dura dos cards das telas de conta ("4px 4px 0"). */
    drop: 'rgba(18,18,15,.09)'
  },
  dark: {
    dark: true,
    bg: INK,
    sheet: '#161613',
    card: '#1c1c18',
    ink: PAPER,
    muted: '#aaa9a4',
    line: 'rgba(241,238,230,.1)',
    ring: 'rgba(241,238,230,.09)',
    mark: '#2a2a25',
    markRing: 'rgba(241,238,230,.12)',
    dash: 'rgba(241,238,230,.16)',
    grabber: 'rgba(241,238,230,.2)',
    live: '#f3421d',
    accent: ACID,
    shadow: 'rgba(0,0,0,.35)',
    liveShadow: 'rgba(232,50,12,.30)',
    hot: ACID,
    field: '#1c1c18',
    cardLine: 'rgba(241,238,230,.1)',
    fieldLine: 'rgba(241,238,230,.16)',
    edge: '#000',
    drop: '#000'
  }
}
export type Palette = (typeof PALETTE)['light'] | (typeof PALETTE)['dark']

const Current = createContext<Palette>(PALETTE.light)

/** A paleta do trecho: a do tema do sistema, ou a que um `PaletteProvider` pôs. */
export const usePalette = () => useContext(Current)

/**
 * Sem `value`, segue o tema do sistema (montado uma vez, em `app/_layout`).
 * Com `value`, troca a paleta daquele trecho, e de tudo dentro dele: o
 * ingresso escuro sobre a tela clara, por exemplo. Para mudar uma cor de uma
 * peça só, prefira o prop dela (`Card fill`).
 */
export function PaletteProvider({
  value,
  children
}: {
  value?: Palette
  children: ReactNode
}) {
  const system = PALETTE[useColorScheme() === 'dark' ? 'dark' : 'light']
  return <Current.Provider value={value ?? system}>{children}</Current.Provider>
}
