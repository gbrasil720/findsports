import Svg, { G, Path, Rect } from 'react-native-svg'

/*
 * Os ícones do chat que o resto do app não tem, com as camadas do design
 * (30%, cheia, acento). Os demais vêm do `Icon` de `components/ui`.
 */

const THUMB = (c: string) => (
  <>
    <Rect
      x={2.5}
      y={10}
      width={4.5}
      height={10.5}
      rx={1.2}
      fill={c}
      opacity={0.3}
    />
    <Path
      d="M9 10.5 13 3c1.6 0 2.6 1.2 2.3 2.8L14.7 9H19a2 2 0 0 1 2 2.3l-1.2 7.2A2.4 2.4 0 0 1 17.4 20.5H9z"
      fill={c}
    />
  </>
)

const GLYPHS = {
  plus: (c: string) => (
    <Path d="M10.8 4h2.4v6.8H20v2.4h-6.8V20h-2.4v-6.8H4v-2.4h6.8z" fill={c} />
  ),
  /** Para baixo; gire para cima ou para os lados. */
  chevron: (c: string) => (
    <Path
      d="m6 9 6 6 6-6"
      fill="none"
      stroke={c}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  /** A estrelinha do "Pensou por". */
  spark: (c: string) => (
    <>
      <Path
        d="M18.5 13.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M10 2.5l2.2 6.1 6.1 2.2-6.1 2.2L10 19.2l-2.2-6.2-6.1-2.2 6.1-2.2z"
        fill={c}
      />
    </>
  ),
  copy: (c: string) => (
    <>
      <Rect
        x={8}
        y={8}
        width={13}
        height={13}
        rx={2.5}
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M5.5 3h9A2.5 2.5 0 0 1 17 5.5V6H8a2 2 0 0 0-2 2v9h-.5A2.5 2.5 0 0 1 3 14.5v-9A2.5 2.5 0 0 1 5.5 3z"
        fill={c}
      />
    </>
  ),
  redo: (c: string, a: string) => (
    <>
      <Path
        d="M20 12a8 8 0 1 1-3-6.25"
        fill="none"
        stroke={c}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <Path d="M14.5 2.5h6.5V9z" fill={a} />
    </>
  ),
  thumbUp: THUMB,
  thumbDown: (c: string) => <G transform="rotate(180 12 12)">{THUMB(c)}</G>,
  mic: (c: string) => (
    <>
      <Path
        d="M5 11a7 7 0 0 0 14 0h-2.2a4.8 4.8 0 0 1-9.6 0z"
        fill={c}
        opacity={0.3}
      />
      <Rect x={11} y={17} width={2} height={4} rx={1} fill={c} opacity={0.3} />
      <Rect x={8.5} y={2.5} width={7} height={12} rx={3.5} fill={c} />
    </>
  )
}

export type AiGlyph = keyof typeof GLYPHS

export function AiIcon({
  name,
  size,
  color,
  accent = color,
  rotate
}: {
  name: AiGlyph
  size: number
  color: string
  accent?: string
  /** Graus, para o chevron (180 = para cima, 90 = para a esquerda). */
  rotate?: number
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined}
    >
      {GLYPHS[name](color, accent)}
    </Svg>
  )
}
