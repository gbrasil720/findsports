/*
 * Em que tela o app está (WEB-486), pelas classes das seleções T1–T6 do design.
 * Decide pela largura da janela e pelo sistema, nunca pelo modelo do aparelho:
 *
 * - `phone`: celular e capas dos dobráveis (Fold 8 e Ultra), o layout de sempre;
 * - `duoClosed`: iPhone Duo fechado, mais largo que qualquer iPhone (466 pt);
 * - `split`: lista e detalhe lado a lado (tablet deitado, dobrável aberto);
 * - `stack`: tablet em pé, uma coluna larga;
 * - `table`: meio dobrado na mesa (Duo em laptop, Flex Mode): mostra em cima,
 *   controles embaixo;
 * - `cover`: a tela de fora do Z Flip 8, só o essencial (regra 07 da T1).
 *
 * A navegação de cada um (regras 01, 03, 04, 04b e 05 da T1): a barra nativa
 * no celular, a faixa da direita no Duo, a barra flutuante embaixo no iPad e nos
 * dobráveis abertos, o rail à esquerda nos Galaxy Tab e nenhuma na tela de fora.
 *
 * A postura vem de `modules/fold-posture` (build de desenvolvimento); sem ela
 * (Expo Go), o dobrável aberto é reconhecido pela proporção da tela.
 */

export type LayoutKind =
  | 'phone'
  | 'duoClosed'
  | 'split'
  | 'stack'
  | 'table'
  | 'cover'
export type NavKind = 'tabs' | 'duoRail' | 'float' | 'rail' | 'none'

/** O que `modules/fold-posture` diz da dobra (o mesmo tipo, sem o módulo). */
export type PostureInput = {
  state: 'flat' | 'half' | 'closed' | 'unknown'
  orientation?: 'vertical' | 'horizontal'
  hinge?: { x: number; y: number; width: number; height: number }
}

export type Layout = {
  kind: LayoutKind
  nav: NavKind
  width: number
  height: number
  /**
   * Onde a tela se divide: a largura da coluna da lista (`split`), ou a altura
   * da metade de cima (`table`). No dobrável aberto, a dobra.
   */
  split: number
  /** A largura da dobra entre as duas partes (0 quando a tela é contínua). */
  gap: number
  /** 13″ e Tab S11 Ultra deitados: cabe uma terceira coluna. */
  wide: boolean
}

/** Abaixo disso é celular (o maior iPhone tem 440 pt; o Duo fechado, 466). */
const TABLET = 600
const DUO_CLOSED = 460
/** A dobra do Duo aberto, em pt (design: 40). */
const DUO_HINGE = 40
/** O iPad 13″ deitado tem 1376 pt; o 11″, 1180. */
const WIDE = 1350

export function classify({
  width,
  height,
  os,
  isPad,
  posture = { state: 'unknown' }
}: {
  width: number
  height: number
  os: string
  isPad: boolean
  posture?: PostureInput
}): Layout {
  const short = Math.min(width, height)
  const base = { width, height, wide: width >= WIDE, gap: 0 }
  const half = posture.state === 'half'
  if (os === 'ios' && !isPad) {
    // No iPhone, só o Duo passa de 440: fechado (alto) ou aberto. Aberto, a
    // dobra corta a tela ao meio: em pé ela é horizontal (laptop), deitado,
    // vertical (livro). Plano, a tela é inteira e a lista tem largura própria.
    if (short >= TABLET - 100 && Math.max(width, height) >= 900) {
      if (half && height > width)
        return {
          ...base,
          kind: 'table',
          nav: 'float',
          split: Math.round(height / 2 - DUO_HINGE / 2),
          gap: DUO_HINGE
        }
      if (half)
        return {
          ...base,
          kind: 'split',
          nav: 'duoRail',
          split: Math.round(width / 2 - DUO_HINGE / 2),
          gap: DUO_HINGE
        }
      // Plano e em pé, a tela é quase a de um iPad mini: uma coluna larga.
      if (height > width)
        return { ...base, kind: 'stack', nav: 'duoRail', split: width }
      return { ...base, kind: 'split', nav: 'duoRail', split: 420 }
    }
    if (width >= DUO_CLOSED && height > width)
      return { ...base, kind: 'duoClosed', nav: 'duoRail', split: width }
    return { ...base, kind: 'phone', nav: 'tabs', split: width }
  }
  // A tela de fora do Z Flip 8 (360 x 400 dp): menor que qualquer celular.
  if (os === 'android' && width < 420 && height < 520)
    return { ...base, kind: 'cover', nav: 'none', split: width }
  if (short < TABLET)
    return { ...base, kind: 'phone', nav: 'tabs', split: width }
  // Dobrável Android com a dobra lida (WindowManager): meio dobrado com a dobra
  // deitada é a mesa; a dobra em pé divide lista e mapa, plano ou em livro.
  const hinge = posture.hinge
  if (os === 'android' && hinge && posture.state !== 'unknown') {
    if (posture.orientation === 'horizontal' && half)
      return {
        ...base,
        kind: 'table',
        nav: 'float',
        split: Math.round(hinge.y),
        gap: Math.round(hinge.height)
      }
    if (posture.orientation === 'vertical')
      return {
        ...base,
        kind: 'split',
        nav: 'float',
        split: Math.round(hinge.x),
        gap: Math.round(hinge.width)
      }
  }
  // Sem a postura (Expo Go): dobrável aberto pela proporção, mais quadrado
  // que um tablet, e menor. Divide ao meio, onde fica a dobra.
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

/** A coluna da lista no tablet deitado: 370 no mini, 400 no 11″, 440 no 13″ e no Ultra. */
function listWidth(width: number) {
  if (width >= WIDE) return 440
  if (width >= 1170) return 400
  return 370
}

/** O celular (e a capa) fica em retrato; tablet e dobrável aberto giram. */
export const locksPortrait = (screen: { width: number; height: number }) =>
  Math.min(screen.width, screen.height) < TABLET

/**
 * Uma medida do design que muda com o aparelho (a foto do bar, o nome), pela
 * altura da tela: a dos pontos desenhados, em linha reta entre eles, e a do
 * ponto mais perto fora deles.
 */
export function byHeight(points: [number, number][], height: number) {
  const first = points[0]
  const last = points.at(-1)
  if (!first || !last) return 0
  if (height <= first[0]) return first[1]
  if (height >= last[0]) return last[1]
  const i = points.findIndex(([h]) => h >= height)
  const [h0, v0] = points[i - 1] ?? first
  const [h1, v1] = points[i] ?? last
  return Math.round(v0 + ((v1 - v0) * (height - h0)) / (h1 - h0))
}
