import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { setStatusBarStyle } from 'expo-status-bar'
import {
  Children,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import {
  Alert,
  DynamicColorIOS,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useColorScheme,
  View,
  type ViewStyle
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G, Path, Rect } from 'react-native-svg'
import { Glass } from '@/components/glass'
import {
  EASE,
  enterAt,
  haptic,
  POP_FAST,
  SWAP,
  usePress
} from '@/components/motion'

/*
 * As peças das telas de conta ("04 Conta" do design): botão de voltar em
 * vidro, campo, botões, título em Anton, caixa de seleção e medidor de senha.
 * Medidas do design a 390 x 844.
 */

export const INK = '#12120f'
export const PAPER = '#f1eee6'
export const ACID = '#c9f135'
export const LIVE = '#e8320c'
export const MUTED = '#55554f'
export const ACCENT = '#c92b0c'

/*
 * Cores que seguem o tema do sistema. O design só desenha as telas de conta
 * e o onboarding no claro; no escuro valem as mesmas formas com tinta e papel
 * trocados e o acid no lugar do vermelho (a regra da tab bar do design). São
 * cores dinâmicas do iOS: trocam sozinhas, então servem no `StyleSheet` de
 * módulo e no SVG. Onde a cor é calculada em JS (`interpolateColor`,
 * gradiente), use `useColorScheme`.
 *
 * ponytail: no Android ficam no claro; trocar por um hook de tema quando o
 * app for testado lá.
 */
export const themed = (light: string, dark: string) =>
  (Platform.OS === 'ios'
    ? DynamicColorIOS({ light, dark })
    : light) as unknown as string
/** Texto e traço: tinta no claro, papel no escuro. */
export const FG = themed(INK, PAPER)
/** Fundo da tela. */
export const BG = themed(PAPER, INK)
/** O detalhe dos ícones: vermelho no claro, acid no escuro (em acid, passe LIVE). */
export const SPARK = themed(LIVE, ACID)
/** Texto secundário. */
export const SUB = themed(MUTED, '#aaa9a4')
/** O trecho em destaque do título. */
export const HOT = themed(ACCENT, ACID)
/** Card sobre o fundo. */
export const CARD = themed('#faf8f3', '#1c1c18')
/** Caixa de texto. */
export const FIELD = themed('#fffdf8', '#1c1c18')
/** Placa apagada (mapa vazio, capa sem foto). */
export const STONE = themed('#e7e3db', '#2a2a25')
/** Borda fina de card. */
export const LINE = themed('rgba(18,18,15,.08)', 'rgba(241,238,230,.1)')
/** Borda de campo e trilho vazio. */
export const LINE_STRONG = themed('rgba(18,18,15,.14)', 'rgba(241,238,230,.16)')
/** A sombra dura dos botões acid: tinta some no fundo de tinta, vira preto. */
export const EDGE = themed(INK, '#000')
// O visto acid na caixa de tinta; na caixa de papel (escuro), tinta.
const CHECK = themed(ACID, INK)
const FIELD_DROP = themed('rgba(18,18,15,.05)', 'rgba(0,0,0,.5)')
const PLACEHOLDER = themed('rgba(85,85,79,.6)', 'rgba(170,169,164,.6)')
/** A sombra dura dos cards ("4px 4px 0"). */
export const DROP = themed('rgba(18,18,15,.09)', '#000')

/** Texto em Archivo com a altura de linha 1,4 do design. */
export const text = (
  fontSize: number,
  weight: 'Regular' | 'SemiBold' | 'Bold' = 'Regular',
  lineHeight = 1.4
) => ({
  fontFamily: `Archivo-${weight}`,
  fontSize,
  lineHeight: fontSize * lineHeight
})

// --- Ícones (os do design, em 24 x 24: camada a 30%, camada cheia, acento) --

export function Icon({
  name,
  size = 19,
  color = FG,
  accent = SPARK
}: {
  name: keyof typeof ICONS
  size?: number
  color?: string
  /** O detalhe do ícone: vermelho no claro, acid no escuro. */
  accent?: string
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ICONS[name](color, accent)}
    </Svg>
  )
}

/** As setinhas de "abre menu" (⇅), ao lado de um rótulo. */
export function UpDown({ color = FG }: { color?: string }) {
  return (
    <Svg width={8} height={14} viewBox="0 0 8 14">
      <Path d="M4 1 7.4 5H.6zM4 13 .6 9h6.8z" fill={color} opacity={0.7} />
    </Svg>
  )
}

const ICONS = {
  back: (c: string) => (
    <Path d="M15.6 3.4 17.4 5.2 10.6 12l6.8 6.8-1.8 1.8L7 12z" fill={c} />
  ),
  close: (c: string) => (
    <Path
      d="M6.3 4.6 12 10.3l5.7-5.7 1.7 1.7-5.7 5.7 5.7 5.7-1.7 1.7-5.7-5.7-5.7 5.7-1.7-1.7 5.7-5.7-5.7-5.7z"
      fill={c}
    />
  ),
  next: (c: string) => (
    <Path d="M8.4 3.4 6.6 5.2 13.4 12l-6.8 6.8 1.8 1.8L17 12z" fill={c} />
  ),
  check: (c: string) => (
    <Path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" fill={c} />
  ),
  person: (c: string) => (
    <>
      <Path d="M3.5 21a8.5 8.5 0 0 1 17 0z" fill={c} opacity={0.3} />
      <Circle cx={12} cy={8} r={4.6} fill={c} />
    </>
  ),
  mail: (c: string) => (
    <>
      <Rect
        x={2.5}
        y={4.5}
        width={19}
        height={15}
        rx={2.5}
        fill={c}
        opacity={0.3}
      />
      <Path d="m3.2 6.6 8.8 6.4 8.8-6.4v2.6L12 15.6 3.2 9.2z" fill={c} />
    </>
  ),
  lock: (c: string, a: string) => (
    <>
      <Rect
        x={4}
        y={10}
        width={16}
        height={11.5}
        rx={2.5}
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10h-2.4V7.5a2.1 2.1 0 0 0-4.2 0V10z"
        fill={c}
      />
      <Circle cx={12} cy={15.6} r={2} fill={a} />
    </>
  ),
  fan: (c: string, a: string) => (
    <>
      <Path
        d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z"
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z"
        fill={c}
      />
      <Path
        d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"
        fill={a}
      />
    </>
  ),
  bar: (c: string, a: string) => (
    <>
      <G fill={c} opacity={0.3}>
        <Path d="M5 6h11v13.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z" />
        <Path d="M16 9h2.2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H16v-2h2v-4h-2z" />
      </G>
      <Path
        d="M5 11h11v8.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 19.5z"
        fill={c}
      />
      <G fill={a}>
        <Circle cx={7.4} cy={5.6} r={2.6} />
        <Circle cx={11} cy={4.6} r={2.9} />
        <Circle cx={14.2} cy={5.8} r={2.3} />
      </G>
    </>
  ),
  fire: (c: string) => (
    <>
      <Path
        d="M12 22a7 7 0 0 1-7-7c0-4.6 3.5-6 3.5-10.5 3.5 2.3 4.7 4.7 4.7 7 1.2-1.2 1.7-2.3 1.7-3.5C17.2 10.3 19 12.6 19 15a7 7 0 0 1-7 7z"
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M12 22a3.6 3.6 0 0 1-3.6-3.6c0-2.4 1.8-3.4 2.4-5.4 2.6 1.5 4.8 3 4.8 5.4A3.6 3.6 0 0 1 12 22z"
        fill={c}
      />
    </>
  ),
  map: (c: string, a: string) => (
    <>
      <Path
        d="M2.5 6.2 8.6 4l6.2 2.2L21 4v13.8L14.8 20l-6.2-2.2-6.1 2.2z"
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M15.2 4.6a3.9 3.9 0 0 1 3.9 3.9c0 2.9-3.9 6.9-3.9 6.9s-3.9-4-3.9-6.9a3.9 3.9 0 0 1 3.9-3.9z"
        fill={c}
      />
      <Circle cx={15.2} cy={8.5} r={1.45} fill={a} />
    </>
  ),
  people: (c: string) => (
    <>
      <G fill={c} opacity={0.3}>
        <Circle cx={16.5} cy={8} r={3.4} />
        <Path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />
      </G>
      <Circle cx={9} cy={8} r={4} fill={c} />
      <Path d="M2 20.5a7 7 0 0 1 14 0z" fill={c} />
    </>
  ),
  search: (c: string) => (
    <>
      <Circle cx={10.5} cy={10.5} r={7} fill={c} opacity={0.3} />
      <Path
        fillRule="evenodd"
        d="M10.5 2.5a8 8 0 0 1 6.3 12.9l4.4 4.4-1.6 1.6-4.4-4.4A8 8 0 1 1 10.5 2.5zm0 2.4a5.6 5.6 0 1 0 0 11.2 5.6 5.6 0 0 0 0-11.2z"
        fill={c}
      />
    </>
  ),
  pin: (c: string) => (
    <Path
      fillRule="evenodd"
      d="M12 2a7.5 7.5 0 0 1 7.5 7.5c0 5.5-7.5 12.5-7.5 12.5S4.5 15 4.5 9.5A7.5 7.5 0 0 1 12 2zm0 4.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8z"
      fill={c}
    />
  ),
  tv: (c: string, a: string) => (
    <>
      <Rect
        x={2.5}
        y={4}
        width={19}
        height={13}
        rx={2.5}
        fill={c}
        opacity={0.3}
      />
      <Rect x={8} y={18.6} width={8} height={2.4} rx={1.2} fill={c} />
      <Path d="M4.5 6.5h15v8h-15z" fill={c} opacity={0.55} />
      <Circle cx={18} cy={8.2} r={1.7} fill={a} />
    </>
  ),
  shield: (c: string) => (
    <>
      <Path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10.2z" fill={c} opacity={0.35} />
      <Path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10.2z" fill={c} />
    </>
  ),
  bell: (c: string, a: string) => (
    <>
      <Path d="M5 17V11a7 7 0 0 1 14 0v6l1.6 2H3.4z" fill={c} opacity={0.3} />
      <Path d="M9.4 20a2.6 2.6 0 0 0 5.2 0z" fill={c} />
      <Path d="M3.4 19 5 17h14l1.6 2z" fill={c} />
      <Circle cx={18} cy={5.5} r={3.2} fill={a} />
    </>
  ),
  outdoor: (c: string, a: string) => (
    <>
      <Path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z" fill={c} opacity={0.3} />
      <Rect x={11} y={11} width={2.2} height={10} rx={1.1} fill={c} />
      <Path d="M3 12h18v1.4H3z" fill={c} />
      <Circle cx={12} cy={3.4} r={1.5} fill={a} />
    </>
  ),
  sound: (c: string) => (
    <>
      <Path
        d="M16 7.5a6 6 0 0 1 0 9M18.6 4.8a10 10 0 0 1 0 14.4"
        stroke={c}
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
        opacity={0.3}
      />
      <Path d="M3 9h4l5-4.5v15L7 15H3z" fill={c} />
    </>
  ),
  premiere: (c: string) => (
    <>
      <Rect
        x={2.5}
        y={4.5}
        width={19}
        height={15}
        rx={3}
        fill={c}
        opacity={0.3}
      />
      <Path d="m10 8.4 6 3.6-6 3.6z" fill={c} />
    </>
  ),
  ticket: (c: string) => (
    <>
      <Path
        d="M2.5 6.5h19v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-19v-3.2a2.3 2.3 0 0 0 0-4.6z"
        fill={c}
        opacity={0.25}
      />
      <Path d="M15.5 6.5h6v3.2a2.3 2.3 0 0 0 0 4.6v3.2h-6z" fill={c} />
      <Circle cx={8.6} cy={12} r={2} fill={INK} />
    </>
  ),
  medal: (c: string) => (
    <>
      <Path
        d="M6.5 2h4.2l2.4 6.2H8.9zM13.3 2h4.2l-2.4 6.2h-4.2z"
        fill={c}
        opacity={0.35}
      />
      <Circle cx={12} cy={15} r={6.6} fill={c} />
      <Path
        d="m12 11.6 1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z"
        fill={INK}
      />
    </>
  ),
  arrowUp: (c: string) => (
    <Path
      d="M12 3.5 19 10.5l-1.7 1.7-4.1-4.1V20.5h-2.4V8.1l-4.1 4.1L5 10.5z"
      fill={c}
    />
  ),
  share: (c: string) => (
    <>
      <Path
        d="M4.5 10.5h4v2h-2v7h11v-7h-2v-2h4v11h-15z"
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M12 2.2 16.6 7l-1.5 1.5L13.1 6.4V15h-2.2V6.4L8.9 8.5 7.4 7z"
        fill={c}
      />
    </>
  ),
  ranking: (c: string, a: string) => (
    <>
      <Path d="M2 11.5h6V21H2zM16 14h6v7h-6z" fill={c} opacity={0.35} />
      <Path d="M8.7 7.5h6.6V21H8.7z" fill={c} />
      <Path
        d="M12 1.1Q12.45 3.15 14.5 3.6Q12.45 4.05 12 6.1Q11.55 4.05 9.5 3.6Q11.55 3.15 12 1.1Z"
        fill={a}
      />
    </>
  ),
  you: (c: string, a: string) => (
    <>
      <Path
        fillRule="evenodd"
        d="M11 2.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zm0 3.6a4.9 4.9 0 1 0 0 9.8 4.9 4.9 0 0 0 0-9.8z"
        fill={c}
      />
      <Circle cx={17.6} cy={17.6} r={3.4} fill={a} />
    </>
  ),
  sparkle: (c: string, a: string) => (
    <>
      <Path
        d="M18.6 1.7Q19.3 4.7 22.3 5.4Q19.3 6.1 18.6 9.1Q17.9 6.1 14.9 5.4Q17.9 4.7 18.6 1.7Z"
        fill={c}
        opacity={0.3}
      />
      <Path
        d="M10 5.4Q11.35 11.85 17.8 13.2Q11.35 14.55 10 21Q8.65 14.55 2.2 13.2Q8.65 11.85 10 5.4Z"
        fill={c}
      />
      <Path
        d="M19.2 15.1Q19.7 17.3 21.9 17.8Q19.7 18.3 19.2 20.5Q18.7 18.3 16.5 17.8Q18.7 17.3 19.2 15.1Z"
        fill={a}
      />
    </>
  ),
  gear: (c: string) => (
    <>
      <Circle cx={12} cy={12} r={9} fill={c} opacity={0.3} />
      <Path
        fillRule="evenodd"
        d="M10.6 2h2.8l.5 2.7 1.9.8 2.3-1.6 2 2-1.6 2.3.8 1.9 2.7.5v2.8l-2.7.5-.8 1.9 1.6 2.3-2 2-2.3-1.6-1.9.8-.5 2.7h-2.8l-.5-2.7-1.9-.8-2.3 1.6-2-2 1.6-2.3-.8-1.9L2 13.4v-2.8l2.7-.5.8-1.9-1.6-2.3 2-2 2.3 1.6 1.9-.8zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"
        fill={c}
      />
    </>
  ),
  chat: (c: string) => (
    <>
      <Path
        d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4h.5A2.5 2.5 0 0 1 3 14.5z"
        fill={c}
        opacity={0.3}
      />
      <Circle cx={8} cy={10} r={1.6} fill={c} />
      <Circle cx={12} cy={10} r={1.6} fill={c} />
      <Circle cx={16} cy={10} r={1.6} fill={c} />
    </>
  ),
  star: (c: string) => (
    <Path
      d="m12 2.8 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
      fill={c}
    />
  ),
  sliders: (c: string, a: string) => (
    <>
      <Rect
        x={3}
        y={5.5}
        width={18}
        height={3}
        rx={1.5}
        fill={c}
        opacity={0.35}
      />
      <Rect
        x={3}
        y={15.5}
        width={18}
        height={3}
        rx={1.5}
        fill={c}
        opacity={0.35}
      />
      <Circle cx={15.5} cy={7} r={3.2} fill={c} />
      <Circle cx={8.5} cy={17} r={3.2} fill={a} />
    </>
  )
}

// --- Barra de status -------------------------------------------------------

/**
 * A cor da barra de status da tela em foco. Não dá para usar `<StatusBar>`
 * (com telas empilhadas, a de baixo re-renderizando ganha da de cima) nem a
 * opção `statusBarStyle` da pilha (o Expo Go não liga
 * `UIViewControllerBasedStatusBarAppearance`). E ao voltar para uma tela o
 * react-native-screens reaplica o padrão no fim da transição: por isso
 * também no `transitionEnd`.
 */
export function useStatusBar(wanted: 'light' | 'dark' | 'auto') {
  const navigation = useNavigation()
  // "auto" resolvido aqui: o do expo-status-bar só olha o tema na hora da
  // chamada, e trocar o tema com a tela aberta deixaria a barra errada.
  const scheme = useColorScheme()
  const style =
    wanted === 'auto' ? (scheme === 'dark' ? 'light' : 'dark') : wanted
  useFocusEffect(useCallback(() => setStatusBarStyle(style), [style]))
  useEffect(
    () =>
      navigation.addListener(
        'transitionEnd' as never,
        (event: { data?: { closing?: boolean } }) => {
          if (!event.data?.closing) setStatusBarStyle(style)
        }
      ),
    [navigation, style]
  )
}

// --- Tela -------------------------------------------------------------------

/**
 * A moldura das telas de conta: fundo papel (ou tinta), conteúdo que rola
 * acima do teclado e, opcional, um rodapé preso embaixo.
 */
export function Screen({
  dark,
  lightStatus,
  gap,
  top = 8,
  padding = 20,
  header,
  footer,
  children
}: {
  dark?: boolean
  /** Barra de status clara mesmo em fundo papel (a foto do login). */
  lightStatus?: boolean
  gap: number
  /** Distância do topo seguro até o conteúdo (62 no design, com 54 de barra). */
  top?: number
  padding?: number
  /** Fica atrás do conteúdo, no topo, e rola junto (a foto do login). */
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  useStatusBar(dark || lightStatus ? 'light' : 'auto')
  // A entrada em sequência vale só para o que nasce com a tela; o que aparece
  // depois (erro, aviso) entra sozinho, na hora.
  const born = useRef(Date.now())
  // Uma entrada por elemento, guardada na primeira renderização (ver `POP`
  // em `motion.tsx`).
  const entries = useRef(new Map<string, ReturnType<typeof enterAt>>())
  const entering = (key: string, index: number) => {
    let entry = entries.current.get(key)
    if (!entry) {
      entry = enterAt(index, Date.now() - born.current > 700)
      entries.current.set(key, entry)
    }
    return entry
  }
  const items = Children.toArray(children)
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: dark ? INK : BG }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: header ? 0 : insets.top + top,
          paddingHorizontal: header ? 0 : padding,
          paddingBottom: 24,
          gap
        }}
      >
        {header}
        {items.map((child, index) =>
          // O voltar é vidro, e vidro com transparência animada sai errado no
          // iOS 26; ele chega com a própria transição da tela.
          isValidElement(child) && child.type === BackButton ? (
            child
          ) : (
            <Animated.View
              key={String(isValidElement(child) ? child.key : index)}
              entering={entering(
                String(isValidElement(child) ? child.key : index),
                index
              )}
            >
              {child}
            </Animated.View>
          )
        )}
      </ScrollView>
      {footer ? (
        <Animated.View
          entering={entering('footer', items.length)}
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom - 4, 16),
            gap: 12
          }}
        >
          {footer}
        </Animated.View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

// --- Navegação --------------------------------------------------------------

/** O botão redondo de voltar (ou fechar), em vidro. */
export function BackButton({
  tone: forced,
  icon = 'back',
  onPress
}: {
  /** Sem tom, segue o tema do sistema. */
  tone?: 'light' | 'dark'
  icon?: 'back' | 'close'
  onPress?: () => void
}) {
  const router = useRouter()
  const scheme = useColorScheme()
  const tone = forced ?? (scheme === 'dark' ? 'dark' : 'light')
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'close' ? 'Fechar' : 'Voltar'}
      hitSlop={8}
      onPress={onPress ?? (() => router.back())}
      style={{ alignSelf: 'flex-start' }}
    >
      {/* Vidro só aparece com algo atrás; sobre o papel liso, a base branca
          e a sombra do design (0 12px 30px -10px) fazem o círculo. */}
      <View style={forced !== 'dark' && styles.roundBase}>
        <Glass tone={tone} interactive style={styles.round}>
          <Icon name={icon} size={18} color={tone === 'light' ? INK : PAPER} />
        </Glass>
      </View>
    </Pressable>
  )
}

// --- Título -----------------------------------------------------------------

/**
 * Título em Anton, linha a linha como o design quebra. Sem `lineHeight`: no
 * iOS ele corta o topo das letras quando é menor que a altura da fonte
 * (1,505em); a margem negativa leva a linha ao 1.02 do design.
 */
export function Title({
  lines,
  size,
  color = FG,
  accentColor = HOT
}: {
  lines: [string, string?][]
  size: number
  color?: string
  accentColor?: string
}) {
  const style = {
    fontFamily: 'Anton',
    fontSize: size,
    letterSpacing: -0.02 * size,
    marginVertical: -0.2425 * size,
    textTransform: 'uppercase' as const,
    color
  }
  return (
    <View accessible accessibilityRole="header">
      {lines.map(([plain, accent]) => (
        <Text key={plain + accent} style={style}>
          {plain}
          {accent ? <Text style={{ color: accentColor }}>{accent}</Text> : null}
        </Text>
      ))}
    </View>
  )
}

// --- Botões -----------------------------------------------------------------

/** Sombra dura: um bloco da cor da sombra atrás, deslocado. */
function HardShadow({
  color,
  x,
  y,
  radius
}: {
  color: string
  x: number
  y: number
  radius: number
}) {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: color,
          borderRadius: radius,
          transform: [{ translateX: x }, { translateY: y }]
        }
      ]}
    />
  )
}

/** O botão retangular acid dos formulários ("Criar conta grátis"...). */
export function BlockButton({
  label,
  onPress,
  disabled,
  trailing,
  shadow = EDGE,
  style
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  trailing?: boolean
  shadow?: string
  style?: StyleProp<ViewStyle>
}) {
  const press = usePress(3, 3)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={style}
    >
      {/* Transparência no conjunto: só no botão, a sombra apareceria por trás. */}
      <View style={disabled && { opacity: 0.45 }}>
        <HardShadow color={shadow} x={3} y={3} radius={4} />
        <Animated.View style={[styles.block, press.style]}>
          <Animated.View key={label} entering={SWAP} style={styles.row}>
            <Text style={[text(15, 'Bold'), { color: INK }]}>{label}</Text>
            {trailing ? (
              <Icon name="next" size={16} color={INK} accent={LIVE} />
            ) : null}
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  )
}

/** O botão em pílula acid do rodapé ("Continuar", "Abrir app de e-mail"). */
export function PillButton({
  label,
  onPress,
  trailing,
  edge = EDGE,
  disabled
}: {
  label: string
  onPress: () => void
  trailing?: boolean
  edge?: string
  disabled?: boolean
}) {
  const press = usePress(0, 3)
  return (
    <View
      style={[
        styles.pillEdge,
        { backgroundColor: edge },
        disabled && { opacity: 0.45 }
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Animated.View style={[styles.pill, press.style]}>
          {/* O rótulo que muda ("Continuar" e "Começar") troca suave. */}
          <Animated.View key={label} entering={SWAP} style={styles.row}>
            <Text style={[text(15, 'Bold'), { color: INK }]}>{label}</Text>
            {trailing ? (
              <Icon name="next" size={17} color={INK} accent={LIVE} />
            ) : null}
          </Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  )
}

/** Link em texto: "Já tem conta? **Entrar**". */
export function TextLink({
  lead,
  label,
  onPress,
  underline,
  color = FG,
  leadColor = SUB,
  size = 14
}: {
  lead?: string
  label: string
  onPress: () => void
  underline?: boolean
  color?: string
  leadColor?: string
  size?: number
}) {
  return (
    <Text style={[text(size), { color: leadColor, textAlign: 'center' }]}>
      {lead ? `${lead} ` : null}
      <Text
        accessibilityRole="link"
        onPress={onPress}
        suppressHighlighting
        style={[
          text(size, 'Bold'),
          { color },
          underline && { textDecorationLine: 'underline' }
        ]}
      >
        {label}
      </Text>
    </Text>
  )
}

// --- Campo ------------------------------------------------------------------

/** Campo do design: rótulo (com ação opcional à direita) e a caixa com ícone. */
export function Field({
  label,
  icon,
  action,
  bare,
  ...input
}: TextInputProps & {
  label: string
  icon: 'person' | 'mail' | 'lock' | 'search' | 'pin'
  action?: { label: string; onPress: () => void }
  /** Sem a linha do rótulo (que ainda vale para leitores de tela). */
  bare?: boolean
}) {
  const [focused, setFocused] = useState(false)
  // O foco acende: a borda escurece e a sombra acid sai de trás da caixa.
  const focus = useSharedValue(0)
  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: 180, easing: EASE })
  }, [focused, focus])
  // A borda de foco é uma camada por cima que só muda de opacidade: animar
  // `borderWidth` refaria o layout do campo a cada quadro.
  const ring = useAnimatedStyle(() => ({ opacity: focus.value }))
  const glow = useAnimatedStyle(() => ({
    opacity: focus.value,
    transform: [
      { translateX: focus.value * 3 },
      { translateY: focus.value * 3 }
    ]
  }))
  return (
    <View style={{ gap: 7 }}>
      <View style={[styles.labelRow, bare && { display: 'none' }]}>
        <Text style={[text(13, 'SemiBold'), { color: FG }]}>{label}</Text>
        {action ? (
          <Text
            accessibilityRole="button"
            onPress={action.onPress}
            suppressHighlighting
            style={[text(13, 'SemiBold'), { color: SUB }]}
          >
            {action.label}
          </Text>
        ) : null}
      </View>
      <View>
        <HardShadow color={FIELD_DROP} x={3} y={3} radius={5} />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.glow, glow]}
        />
        <View style={styles.input}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.ring, ring]}
          />
          <Icon name={icon} color={focused ? FG : SUB} />
          <TextInput
            accessibilityLabel={label}
            placeholderTextColor={PLACEHOLDER}
            selectionColor={FG}
            cursorColor={FG}
            style={styles.inputText}
            {...input}
            onFocus={(event) => {
              setFocused(true)
              input.onFocus?.(event)
            }}
            onBlur={(event) => {
              setFocused(false)
              input.onBlur?.(event)
            }}
          />
        </View>
      </View>
    </View>
  )
}

// --- Senha ------------------------------------------------------------------

/**
 * O que o design pede de uma senha. Só o tamanho é regra (o servidor exige 8,
 * como o web); o resto mede a força.
 */
export const PASSWORD_RULES = [
  { label: '8 caracteres ou mais', test: (p: string) => p.length >= 8 },
  { label: 'Uma maiúscula', test: (p: string) => /[A-ZÀ-Ý]/.test(p) },
  { label: 'Um número', test: (p: string) => /\d/.test(p) },
  { label: 'Um símbolo', test: (p: string) => /[^\p{L}\d]/u.test(p) }
]
export const MIN_PASSWORD = 8
export const passwordScore = (password: string) =>
  PASSWORD_RULES.filter((rule) => rule.test(password)).length
export const STRENGTH = ['', 'Fraca', 'Média', 'Forte', 'Muito forte']

/** As quatro barras de força. */
export function StrengthBars({
  score,
  empty = LINE_STRONG
}: {
  score: number
  empty?: string
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4].map((step) => (
        <StrengthBar key={step} on={step <= score} empty={empty} />
      ))}
    </View>
  )
}

/** Uma barra: a tinta enche da esquerda para a direita. */
function StrengthBar({ on, empty }: { on: boolean; empty: string }) {
  const fill = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    fill.value = withTiming(on ? 1 : 0, { duration: 260, easing: EASE })
  }, [on, fill])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.value }]
  }))
  return (
    <View style={[styles.bar, { backgroundColor: empty }]}>
      <Animated.View style={[styles.barFill, style]} />
    </View>
  )
}

// --- Caixa de seleção -------------------------------------------------------

export function Checkbox({
  checked,
  onChange,
  children
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        haptic.select()
        onChange(!checked)
      }}
      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? (
          <Animated.View entering={POP_FAST}>
            <Icon name="check" size={14} color={CHECK} />
          </Animated.View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  )
}

// --- Contagem para reenviar -------------------------------------------------

/** Segundos até poder reenviar; `restart` recomeça. */
export function useCountdown(seconds: number) {
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(timer)
  }, [left])
  return {
    left,
    label: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    restart: () => setLeft(seconds)
  }
}

// --- E-mail -----------------------------------------------------------------

/** Os apps de e-mail do design. Apple Mail só existe no iOS. */
export const MAIL_APPS = [
  { label: 'Gmail', url: 'googlegmail://' },
  { label: 'Outlook', url: 'ms-outlook://' },
  ...(Platform.OS === 'ios' ? [{ label: 'Apple Mail', url: 'message://' }] : [])
]

export const openMailApp = (label: string, url: string) =>
  Linking.openURL(url).catch(() =>
    Alert.alert(`Não achamos o ${label} neste aparelho.`)
  )

/** "gabriel@onside.sh" vira "g•••••@onside.sh", como no design. */
export const maskEmail = (email: string) => {
  const [user, domain] = email.split('@')
  return domain ? `${user.slice(0, 1)}•••••@${domain}` : email
}

/** A mensagem de erro de uma resposta do better-auth, em português. */
export function authErrorMessage(
  error: { code?: string; message?: string; status?: number },
  fallback: string
) {
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'E-mail ou senha incorretos.'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'Já existe uma conta com este e-mail.'
    case 'INVALID_EMAIL':
      return 'Confira o e-mail.'
    case 'PASSWORD_TOO_SHORT':
      return `A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`
    case 'INVALID_TOKEN':
      return 'Este link expirou ou já foi usado. Peça outro.'
    case 'INVALID_TWO_FACTOR_CODE':
    case 'INVALID_CODE':
      return 'Código incorreto. Confira no app autenticador.'
    case 'INVALID_BACKUP_CODE':
      return 'Código de recuperação incorreto.'
  }
  if (error.status === 429) return 'Muitas tentativas. Espere um pouco.'
  return fallback
}

const styles = StyleSheet.create({
  roundBase: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,.55)',
    shadowColor: INK,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  block: {
    minHeight: 54,
    paddingHorizontal: 20,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: ACID
  },
  // A tinta embaixo é a sombra "0 3px 0" do design; não conta na altura.
  pillEdge: {
    height: 59,
    marginBottom: -3,
    borderRadius: 28,
    shadowColor: 'rgb(110,140,0)',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 10 }
  },
  pill: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACID,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,.65)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(90,120,0,.25)'
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  input: {
    height: 54,
    paddingHorizontal: 14,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: LINE_STRONG
  },
  glow: { borderRadius: 5, backgroundColor: ACID },
  ring: {
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: FG
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  inputText: {
    flex: 1,
    height: '100%',
    fontFamily: 'Archivo-Regular',
    fontSize: 16,
    color: FG
  },
  bar: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: FG,
    transformOrigin: 'left'
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: themed('rgba(18,18,15,.3)', 'rgba(241,238,230,.35)')
  },
  boxChecked: { backgroundColor: FG, borderColor: FG }
})
