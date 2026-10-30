/*
 * Em que tela o app está (WEB-486), pelas classes das seleções T1–T6 do design.
 * Decide pela largura da janela e pelo sistema, nunca pelo modelo do aparelho:
 *
 * - `phone`: celular e capas dos dobráveis (Fold 8 e Ultra), o layout de sempre;
 * - `duoClosed`: iPhone Duo fechado, mais largo que qualquer iPhone (466 pt);
 * - `split`: lista e detalhe lado a lado (tablet deitado, dobrável aberto);
 * - `stack`: tablet em pé, uma coluna larga.
 *
 * A navegação de cada um (regras 01, 03, 04, 04b e 05 da T1): a barra nativa
 * no celular, a faixa da direita no Duo, a barra flutuante embaixo no iPad e nos
 * dobráveis abertos, e o rail à esquerda nos Galaxy Tab.
 */

export type LayoutKind = 'phone' | 'duoClosed' | 'split' | 'stack'
export type NavKind = 'tabs' | 'duoRail' | 'float' | 'rail'

export type Layout = {
  kind: LayoutKind
  nav: NavKind
  width: number
  height: number
  /** Onde a tela se divide: a dobra no dobrável aberto, senão a coluna da lista. */
  split: number
  /** 13″ e Tab S11 Ultra deitados: cabe uma terceira coluna. */
  wide: boolean
}

/** Abaixo disso é celular (o maior iPhone tem 440 pt; o Duo fechado, 466). */
const TABLET = 600
const DUO_CLOSED = 460
/** O iPad 13″ deitado tem 1376 pt; o 11″, 1180. */
const WIDE = 1350

export function classify({
  width,
  height,
  os,
  isPad
}: {
  width: number
  height: number
  os: string
  isPad: boolean
}): Layout {
  const short = Math.min(width, height)
  const base = { width, height, wide: width >= WIDE }
  if (os === 'ios' && !isPad) {
    // No iPhone, só o Duo passa de 440: fechado (alto) ou aberto (deitado).
    if (width >= TABLET)
      return { ...base, kind: 'split', nav: 'duoRail', split: listWidth(width) }
    if (width >= DUO_CLOSED)
      return { ...base, kind: 'duoClosed', nav: 'duoRail', split: width }
    return { ...base, kind: 'phone', nav: 'tabs', split: width }
  }
  if (short < TABLET)
    return { ...base, kind: 'phone', nav: 'tabs', split: width }
  // ponytail: dobrável aberto pela proporção (mais quadrado que um tablet, e
  // menor). A postura de verdade (livro, Flex Mode) e a posição da dobra vêm
  // da Jetpack WindowManager, que exige build de desenvolvimento.
  const foldable =
    os === 'android' && short < 900 && short / Math.max(width, height) > 0.72
  if (foldable)
    return {
      ...base,
      kind: 'split',
      nav: 'float',
      split: Math.round(width / 2)
    }
  const nav = os === 'android' ? 'rail' : 'float'
  if (height > width) return { ...base, kind: 'stack', nav, split: width }
  return { ...base, kind: 'split', nav, split: listWidth(width) }
}

/** A coluna da lista no tablet deitado: 370 no mini, 400 no 11″, 430 no 13″. */
function listWidth(width: number) {
  if (width >= WIDE) return 440
  if (width >= 1170) return 400
  return 370
}

/** O celular (e a capa) fica em retrato; tablet e dobrável aberto giram. */
export const locksPortrait = (screen: { width: number; height: number }) =>
  Math.min(screen.width, screen.height) < TABLET
