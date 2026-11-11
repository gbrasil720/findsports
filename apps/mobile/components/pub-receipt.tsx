import { ONBOARDING_TRIAL } from '@findsports_oficial/api/lib/plan-limits'
import { type ReactNode, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { HardShadow } from '@/components/explore'
import { MarkSmall } from '@/components/fan-card'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text } from '@/components/ui'

/*
 * O comprovante do cadastro do bar (rodada 10): o mesmo do web
 * (`apps/web/src/components/onboarding/pub-receipt.tsx` e `.ob-paper` em
 * `onboarding-v3.css`). A impressora térmica solta o papel linha a linha: cada
 * linha entra de −10 com opacidade em 350 ms, 95 ms depois da anterior, e o
 * papel cresce junto (no web, `max-height` da linha). O LED pisca 6 vezes, em
 * passos de 1 s, e o háptico de sucesso sai na última linha. Movimento
 * reduzido: a fita pronta. Não é documento fiscal; nada é cobrado hoje.
 */

const STEP_MS = 95
const FEED_MS = 350
const FEED: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -10 }] },
    animations: {
      opacity: withTiming(1, { duration: FEED_MS, easing: EASE }),
      transform: [
        { translateY: withTiming(0, { duration: FEED_MS, easing: EASE }) }
      ]
    }
  }
}
const GROW = LinearTransition.duration(FEED_MS).easing(EASE)
// O código de barras do web: 38 barras de 1, 2 ou 3 de largura.
const BARS = Array.from({ length: 38 }, (_, i) => ({
  id: `b${i}`,
  width: [1, 2, 1, 3, 1, 2, 2, 1][i % 8] ?? 1
}))
const PAPER = '#fbfaf6'
const MUTED = '#55554f'

const date = (value: Date) =>
  `${String(value.getDate()).padStart(2, '0')}/${String(value.getMonth() + 1).padStart(2, '0')}/${value.getFullYear()}`
const time = (value: Date) =>
  `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`

type Kind = 'logo' | 'c' | 'm' | 'b' | 'cut' | 'note' | 'tot' | 'bars'

export function PubReceipt({
  bar,
  until,
  issuedAt,
  continueLabel,
  onContinue
}: {
  bar: {
    name: string
    address: string
    neighborhood: string
    city: string
    uf?: string
  }
  until: Date
  issuedAt: Date
  continueLabel: string
  onContinue: () => void
}) {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const [run, setRun] = useState(0)
  // O rodapé (dois botões e a nota) cobre o fim da rolagem: a folga é a
  // altura dele, medida.
  const [foot, setFoot] = useState(220)
  const lines: [Kind, ReactNode, ReactNode?][] = [
    ['logo', null],
    ['c', 'COMPROVANTE DE CADASTRO'],
    ['m', date(issuedAt), time(issuedAt)],
    ['cut', null],
    ['b', bar.name.toUpperCase()],
    ['m', bar.address],
    ['m', `${bar.neighborhood} · ${bar.city}${bar.uf ? `/${bar.uf}` : ''}`],
    ['cut', null],
    ['b', 'TESTE GRÁTIS', 'R$ 0,00'],
    ['m', `${ONBOARDING_TRIAL.days} dias`, `até ${date(until)}`],
    ['m', 'Cartão', 'não pedido'],
    ['m', 'Plano', 'você escolhe já já'],
    ['m', '', 'depois do primeiro jogo'],
    ['cut', null],
    ['b', 'PRIMEIRO JOGO', 'por conta da Onside'],
    ['m', 'Não conta no limite', 'de nenhum plano'],
    [
      'note',
      'Nada é cobrado no teste. O plano você escolhe logo depois do primeiro jogo; só cobra se você contratar.'
    ],
    ['cut', null],
    ['tot', 'TOTAL HOJE', 'R$ 0,00'],
    ['bars', null],
    ['c', 'obrigado por torcer com a gente']
  ]
  // Quantas linhas já saíram: cresce de 95 em 95 ms; reduzido, todas.
  const [shown, setShown] = useState(reduced ? lines.length : 0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: recomeça a cada impressão
  useEffect(() => {
    if (reduced) {
      setShown(lines.length)
      haptic.success()
      return
    }
    setShown(0)
    let n = 0
    const timer = setInterval(() => {
      n += 1
      setShown(n)
      if (n >= lines.length) {
        clearInterval(timer)
        setTimeout(() => haptic.success(), FEED_MS)
      }
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [run, reduced])

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 28,
          paddingBottom: foot + 24,
          paddingHorizontal: 16,
          alignItems: 'center'
        }}
      >
        <Text style={[styles.kicker, { color: palette.muted }]}>
          PRONTO. SAIU O SEU COMPROVANTE
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.ink }]}
        >
          {`${bar.name} está no ar`}
        </Text>
        <Printer run={run} reduced={reduced} />
        <Animated.View
          key={run}
          layout={reduced ? undefined : GROW}
          accessible
          accessibilityLabel={`Comprovante de cadastro de ${bar.name}. Teste grátis de ${ONBOARDING_TRIAL.days} dias até ${date(until)}, cartão não pedido, total hoje zero reais.`}
          style={styles.paper}
        >
          {lines.slice(0, shown).map(([kind, left, right], i) => (
            <Animated.View
              // biome-ignore lint/suspicious/noArrayIndexKey: as linhas são fixas e saem na ordem do papel
              key={i}
              entering={reduced ? undefined : FEED}
            >
              <Line kind={kind} left={left} right={right} />
            </Animated.View>
          ))}
          <View style={styles.edge}>
            <Svg
              width="100%"
              height={8}
              viewBox="0 0 120 8"
              preserveAspectRatio="none"
            >
              <Path
                d={`M0 0 ${Array.from({ length: 10 }, (_, k) => `L${k * 12 + 6} 8 L${k * 12 + 12} 0`).join(' ')} Z`}
                fill={PAPER}
              />
            </Svg>
          </View>
        </Animated.View>
      </ScrollView>
      <View
        onLayout={(e) => setFoot(e.nativeEvent.layout.height)}
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + 10, backgroundColor: palette.bg }
        ]}
      >
        <Pressable accessibilityRole="button" onPress={onContinue}>
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View style={styles.cta}>
            <Icon name="plus" size={20} color={INK} />
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              {continueLabel}
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setRun((n) => n + 1)}
          style={[styles.ghost, { borderColor: palette.line }]}
        >
          <Text style={[text(16, 'Bold', 1.2), { color: palette.ink }]}>
            Imprimir de novo
          </Text>
        </Pressable>
        <Text
          style={[
            text(13, 'Regular', 1.4),
            { color: palette.muted, textAlign: 'center' }
          ]}
        >
          O bar já está no mapa; com um jogo na grade, aparece nas buscas do
          dia.
        </Text>
      </View>
    </View>
  )
}

function Line({
  kind,
  left,
  right
}: {
  kind: Kind
  left: ReactNode
  right?: ReactNode
}) {
  if (kind === 'logo')
    return (
      <View style={styles.logo}>
        <MarkSmall />
        <Text style={styles.logoText}>ONSIDE</Text>
      </View>
    )
  if (kind === 'cut') return <View style={styles.cut} />
  if (kind === 'bars')
    return (
      <View style={styles.bars}>
        {BARS.map((bar) => (
          <View
            key={bar.id}
            style={{ width: bar.width, height: 38, backgroundColor: INK }}
          />
        ))}
      </View>
    )
  if (kind === 'note')
    return <Text style={[styles.mono, styles.note]}>{left}</Text>
  const font =
    kind === 'tot' ? styles.tot : kind === 'b' ? styles.bold : styles.mono
  const color = kind === 'm' ? MUTED : INK
  if (kind === 'c')
    return (
      <Text style={[styles.mono, { color: INK, textAlign: 'center' }]}>
        {left}
      </Text>
    )
  return (
    <View style={styles.row}>
      <Text style={[font, { color, flexShrink: 1 }]}>{left}</Text>
      {right !== undefined ? (
        <Text style={[font, { color, flexShrink: 1, textAlign: 'right' }]}>
          {right}
        </Text>
      ) : null}
    </View>
  )
}

/** A impressora: a fenda por onde sai o papel e o LED aceso, que pisca. */
function Printer({ run, reduced }: { run: number; reduced: boolean }) {
  const led = useSharedValue(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: pisca a cada impressão
  useEffect(() => {
    if (reduced) return
    // `steps(1)` do web: meio segundo apagado, meio aceso, 6 vezes.
    led.set(
      withRepeat(
        withSequence(
          withTiming(0.2, { duration: 0 }),
          withTiming(0.2, { duration: 500 }),
          withTiming(1, { duration: 0 }),
          withTiming(1, { duration: 500 })
        ),
        6
      )
    )
  }, [run, reduced])
  const style = useAnimatedStyle(() => ({ opacity: led.get() }))
  return (
    <View style={styles.printer}>
      <View style={styles.slot} />
      <Animated.View style={[styles.led, style]} />
    </View>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 10
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 40,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginVertical: -9.7
  },
  printer: {
    zIndex: 2,
    width: '96%',
    maxWidth: 360,
    height: 34,
    marginTop: 28,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#12120f',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  slot: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 6,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#000'
  },
  led: {
    position: 'absolute',
    top: 9,
    right: 16,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: ACID,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 }
  },
  paper: {
    zIndex: 1,
    width: '88%',
    maxWidth: 340,
    marginTop: -8,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 26,
    backgroundColor: PAPER,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 }
  },
  // O picote no fluxo do papel: acompanha o papel enquanto ele cresce.
  edge: { height: 8, marginHorizontal: -18, marginTop: 26, marginBottom: -34 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    lineHeight: 19,
    color: INK
  },
  bold: { fontFamily: 'GeistMono-Bold', fontSize: 13, lineHeight: 19 },
  tot: { fontFamily: 'Anton', fontSize: 24, lineHeight: 30, marginTop: 2 },
  note: { fontSize: 12, lineHeight: 17, color: MUTED, marginTop: 4 },
  cut: {
    marginVertical: 10,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(18,18,15,.35)'
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8
  },
  logoText: { fontFamily: 'Anton', fontSize: 24, color: INK },
  bars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2,
    marginTop: 14,
    marginBottom: 6
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10
  },
  cta: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  ghost: {
    height: 50,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
