import { LinearGradient } from 'expo-linear-gradient'
import { createContext, useEffect, useState } from 'react'
import {
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { useLayout, useNavInsets } from '@/components/layout'
import { Text } from '@/components/ui'
import { SPLASH_ON, SPLASH_SIDE } from './splash-letters'

/**
 * Se a splash já saiu. A tela de baixo espera por isso para animar a
 * entrada, que senão tocaria escondida (`app/intro.tsx`). Fora do provedor,
 * vale como saída.
 */
export const SplashDone = createContext(true)

/**
 * A splash do app: a agenda do dia em faixas inclinadas correndo por trás de um
 * "ON / SIDE" que sobe de trás de uma máscara. Segue a tela "02 Splash" do
 * projeto de design (`Onside Selecao 1 Entrada.dc.html`), nas duas variantes:
 * clara (8a, ácido) e escura (8b, tinta), escolhidas pelo tema do sistema.
 *
 * No design a animação fica em laço de 3,6 s para ser vista; no app ela toca
 * uma vez e sai. As medidas (px a 390 de largura) e os tempos são os de lá.
 */

// Agenda de exemplo, a do design: cenário para quando não há jogo de verdade
// para mostrar (nenhum cadastrado hoje, ou a API não respondeu a tempo). Com
// ela a contagem do rodapé não aparece: não se conta jogo inventado.
const SAMPLE_AGENDA = [
  'COR × PAL 21:30',
  'LAL × BOS 22:00',
  'FLA × FLU 16:00',
  'GRE × INT 21:45',
  'F1 · TREINO 16:00',
  'SAO × SAN 19:00'
]

const INK = '#12120f'
const PAPER = '#f1eee6'
const ACID = '#c9f135'
const LIVE = '#e8320c'

const THEMES = {
  light: {
    stage: ACID,
    band: INK,
    bandOpacity: [0.1, 0.16],
    // No claro nenhum jogo ganha destaque; no escuro, um a cada três vem em ácido.
    highlight: null as string | null,
    veil: ['rgba(201,241,53,0)', 'rgba(201,241,53,0.92)'] as const,
    word: INK,
    footer: INK,
    count: INK
  },
  dark: {
    stage: INK,
    band: PAPER,
    bandOpacity: [0.08, 0.14],
    highlight: ACID as string | null,
    veil: ['rgba(18,18,15,0)', 'rgba(18,18,15,0.94)'] as const,
    word: ACID,
    footer: PAPER,
    count: ACID
  }
}
type Theme = (typeof THEMES)[keyof typeof THEMES]

const ROWS = 12
const MIN_ITEMS = 6 // jogos por volta de uma faixa, como no design
const LINE = 164 // altura da máscara de cada linha do "ON / SIDE"
const BASELINE = 161.5 // onde a linha de base das letras cai dentro da máscara
const SQUARE = 45
const DESIGN_WIDTH = 390 // a largura de tela em que o design foi medido
const MARGIN = 22

// Tempos do design (ms): `sp-up` nas duas linhas, `sp-fade` no rodapé.
const RISE = { delay: 216, stagger: 120, duration: 792 }
const FOOTER = { delay: 1640, duration: 648 }
// O rodapé termina de entrar em 2,3 s; a tela fica mais 1,5 s parada para ser lida antes de sair.
const HOLD_UNTIL = 3800
const EXIT = 260
const riseEase = Easing.bezier(0.23, 1, 0.32, 1)

/** Uma faixa: os jogos em fila, duas vezes, andando meia largura em laço. */
function Band({
  index,
  agenda,
  theme
}: {
  index: number
  agenda: string[]
  theme: Theme
}) {
  const [half, setHalf] = useState(0)
  const progress = useSharedValue(0)
  const reverse = index % 2 === 1

  useEffect(() => {
    if (!half) return
    progress.value = 0
    // 18 s na primeira faixa, 3 s a mais em cada uma: nenhuma anda junto.
    progress.value = withRepeat(
      withTiming(1, {
        duration: (18 + 3 * index) * 1000,
        easing: Easing.linear
      }),
      -1
    )
  }, [half, index, progress])

  // As duas direções partem de translateX 0; a que anda para a direita começa
  // meia largura à esquerda pelo layout. Com o transform começando em -half
  // (milhares de pt), o iOS desenhava a faixa duas vezes, uma por cima da outra.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (reverse ? half : -half) * progress.value }]
  }))

  // Cada faixa começa num jogo diferente. Com poucos jogos no dia a fila se
  // repete até encher a faixa, senão sobraria vazio entre uma volta e outra.
  const start = index % agenda.length
  const turn = [...agenda.slice(start), ...agenda.slice(0, start)]
  const items = Array.from(
    { length: Math.max(MIN_ITEMS, turn.length) },
    (_, i) => turn[i % turn.length] as string
  )
  const run = (copy: number) => (
    <View
      key={copy}
      onLayout={
        copy === 0 ? (e) => setHalf(e.nativeEvent.layout.width) : undefined
      }
      style={styles.run}
    >
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fila repete jogos, a posição é a identidade
        <View key={i} style={styles.run}>
          <Text
            style={[
              styles.bandText,
              {
                color:
                  theme.highlight && agenda.indexOf(item) % 3 === 0
                    ? theme.highlight
                    : theme.band
              }
            ]}
          >
            {item}
          </Text>
          <Text style={[styles.slash, { color: theme.band }]}>/</Text>
        </View>
      ))}
    </View>
  )

  return (
    <View style={{ overflow: 'hidden', opacity: theme.bandOpacity[index % 2] }}>
      <Animated.View
        style={[styles.run, reverse && { marginLeft: -half }, style]}
      >
        {run(0)}
        {run(1)}
      </Animated.View>
    </View>
  )
}

/** Uma linha do "ON / SIDE": sobe de baixo da máscara. */
function Line({
  letters,
  color,
  delay,
  scale,
  square = false
}: {
  letters: { d: string; advance: number }
  color: string
  delay: number
  /** Tamanho contra o do design: o "SIDE" com o quadrado tem de caber em qualquer largura de tela. */
  scale: number
  square?: boolean
}) {
  const rise = useSharedValue(0)
  useEffect(() => {
    rise.value = withDelay(
      delay,
      withTiming(1, { duration: RISE.duration, easing: riseEase })
    )
  }, [delay, rise])
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - rise.value) * LINE * scale * 1.05 }]
  }))
  const width = letters.advance + (square ? 12 + SQUARE : 0)
  return (
    <View style={{ height: LINE * scale, overflow: 'hidden' }}>
      <Animated.View style={style}>
        <Svg
          width={width * scale}
          height={LINE * scale}
          viewBox={`0 0 ${width} ${LINE}`}
        >
          <Path
            d={letters.d}
            fill={color}
            transform={`translate(0 ${BASELINE})`}
          />
          {square ? (
            <Path
              d={`M${letters.advance + 12} ${LINE - 22 - SQUARE}h${SQUARE}v${SQUARE}h${-SQUARE}z`}
              fill={LIVE}
            />
          ) : null}
        </Svg>
      </Animated.View>
    </View>
  )
}

export function Splash({
  agenda,
  onDone
}: {
  /** Os jogos de hoje, já escritos como vão na faixa ("FLAMENGO × PALMEIRAS 16:00"). */
  agenda?: string[]
  onDone: () => void
}) {
  const real = agenda && agenda.length > 0 ? agenda : null
  const shown = real ?? SAMPLE_AGENDA
  const theme = THEMES[useColorScheme() === 'dark' ? 'dark' : 'light']
  const window = useWindowDimensions()
  const phone = useLayout().kind === 'phone'
  // No iPhone Duo a barra de status e a ilha ficam na faixa da direita.
  const strip = useNavInsets().right
  const width = window.width - strip
  const fit = (width - 2 * MARGIN) / (DESIGN_WIDTH - 2 * MARGIN)
  // No tablet as letras crescem com a altura (o "ON / SIDE" em 45% dela), e
  // as faixas cobrem a tela toda; no celular, as medidas do design.
  const scale = phone
    ? Math.min(1.3, fit)
    : Math.min(fit, (window.height * 0.45) / (2 * LINE))
  const rows = phone ? ROWS : Math.max(ROWS, Math.ceil(window.height / 56))
  const footer = useSharedValue(0)
  const exit = useSharedValue(0)

  useEffect(() => {
    footer.value = withDelay(
      FOOTER.delay,
      withTiming(1, { duration: FOOTER.duration, easing: Easing.ease })
    )
    exit.value = withDelay(
      HOLD_UNTIL,
      // Saída em ease-out: em ease-in ela demoraria a começar.
      withTiming(1, { duration: EXIT, easing: riseEase })
    )
    const done = setTimeout(onDone, HOLD_UNTIL + EXIT)
    return () => clearTimeout(done)
  }, [exit, footer, onDone])

  const footerStyle = useAnimatedStyle(() => ({
    opacity: footer.value,
    transform: [{ translateY: (1 - footer.value) * 10 }]
  }))
  const exitStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }))

  const count = real
    ? `${real.length} ${real.length === 1 ? 'JOGO' : 'JOGOS'} HOJE`
    : null

  return (
    <Animated.View
      accessibilityLabel="Onside. O jogo é aqui."
      accessible
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.stage },
        exitStyle
      ]}
    >
      <View pointerEvents="none" style={styles.bands}>
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: as faixas são fixas, a posição é a identidade
          <Band key={i} index={i} agenda={shown} theme={theme} />
        ))}
      </View>
      <LinearGradient
        colors={theme.veil}
        locations={[0.3, 0.72]}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.word, { right: MARGIN + strip }]}>
        <Line
          letters={SPLASH_ON}
          color={theme.word}
          delay={RISE.delay}
          scale={scale}
        />
        <Line
          letters={SPLASH_SIDE}
          color={theme.word}
          delay={RISE.delay + RISE.stagger}
          scale={scale}
          square
        />
      </View>
      <Animated.View
        style={[styles.footer, { right: MARGIN + strip }, footerStyle]}
      >
        <Text style={[styles.footerText, { color: theme.footer }]}>
          O JOGO É AQUI
        </Text>
        {count ? (
          <Text style={[styles.footerText, { color: theme.count }]}>
            {count}
          </Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  bands: {
    position: 'absolute',
    top: -60,
    right: -60,
    bottom: -60,
    left: -60,
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }]
  },
  run: { flexDirection: 'row', alignSelf: 'flex-start' },
  // Sem `lineHeight`: menor que a altura natural da fonte, o iOS corta o topo
  // das letras. A margem negativa leva a linha natural do Anton (1,505em, 81)
  // aos 64 do design.
  bandText: {
    fontFamily: 'Anton',
    fontSize: 54,
    marginVertical: -8.6,
    paddingHorizontal: 18
  },
  slash: {
    fontFamily: 'Anton',
    fontSize: 54,
    marginVertical: -8.6,
    opacity: 0.35
  },
  word: { position: 'absolute', left: MARGIN, right: MARGIN, bottom: 160 },
  footer: {
    position: 'absolute',
    left: MARGIN,
    right: MARGIN,
    bottom: 70,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  // Mesmo motivo: a Geist Mono tem 1,3em de altura natural, o design pede 1em.
  footerText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    marginVertical: -1.95
  }
})
