import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming
} from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs,
  Mask,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
  TextPath
} from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, INK, LIVE, PAPER, Text } from '@/components/ui'

/*
 * A carteirinha do torcedor (rodada 2 do redesign, onboarding B), com as
 * medidas do desenho (`.cart2`): peça de tinta, raio 24, sombra sólida de 4.
 * Em cima a marca e "TORCEDOR / TEMPORADA 26", com a trama de pontos do placar
 * no canto; o nome em Anton; "Torce para" com os times em acid; o que assiste
 * (siglas em mono), o raio e a base. Campo vazio é tracejado; o do passo
 * acende em acid. Depois do picote, o canhoto com o código de barras e o
 * número, nítidos só validada, e o selo de clube carimbado.
 */

export type CardField = 'teams' | 'sports' | 'radius' | 'base' | null

const MONO = 'GeistMono-SemiBold'
const MUTED = '#aaa9a4'
const DASH = '#6b6a63'
const HOT_LABEL = '#3d4a06'

/** Nº 0.128.441: um número fixo por conta, tirado do id. */
export function cardNumber(id: string) {
  let n = 0
  for (const char of id) n = (n * 31 + char.charCodeAt(0)) % 1_000_000
  return `0.${String(Math.floor(n / 1000)).padStart(3, '0')}.${String(n % 1000).padStart(3, '0')}`
}

/** O tracejado de campo vazio ("Escolha um time", "—"). */
function Dash({ children }: { children: string }) {
  return (
    <View style={styles.dash}>
      <Text style={styles.dashText}>{children}</Text>
    </View>
  )
}

/** Um campo: rótulo em mono e o valor; aceso, fundo acid. */
function Field({
  label,
  hot,
  children,
  style
}: {
  label: string
  hot: boolean
  children: React.ReactNode
  style?: object
}) {
  return (
    <View style={[styles.field, hot && { backgroundColor: ACID }, style]}>
      <Text style={[styles.label, { color: hot ? HOT_LABEL : MUTED }]}>
        {label}
      </Text>
      {children}
    </View>
  )
}

/** A trama de pontos do placar, só no canto de cima à direita. */
function Dots() {
  return (
    <Svg style={styles.dots} pointerEvents="none">
      <Defs>
        <Pattern id="pontos" width={7} height={7} patternUnits="userSpaceOnUse">
          <Circle cx={3.5} cy={3.5} r={1.3} fill="rgba(241,238,230,.16)" />
        </Pattern>
        <RadialGradient id="some" cx="100%" cy="0%" rx="110%" ry="100%">
          <Stop offset="0.2" stopColor="#fff" stopOpacity={1} />
          <Stop offset="0.7" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
        <Mask id="canto">
          <Rect width="100%" height="100%" fill="url(#some)" />
        </Mask>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#pontos)" mask="url(#canto)" />
    </Svg>
  )
}

/**
 * O carimbo (rodada 2, "Selo final"): espera a tela trocar e assenta como
 * carimbo, escala 1,12 → 1, gira −20° → −14° e aparece, 240 ms EASE, com o
 * háptico médio no quadro em que encosta. Depois o código de barras e o número
 * saem juntos (`issued`, 200 ms). Movimento reduzido: só a opacidade.
 */
const STAMP_DELAY = 260

export function useStamp() {
  const reduced = useReducedMotion()
  const stamp = useSharedValue(0)
  const issued = useSharedValue(0)
  useEffect(() => {
    const show = () =>
      issued.set(withTiming(1, { duration: 200, easing: EASE }))
    stamp.set(
      withDelay(
        STAMP_DELAY,
        withTiming(
          1,
          { duration: reduced ? 200 : 240, easing: EASE },
          (done) => {
            if (!done) return
            if (!reduced) scheduleOnRN(haptic.stamp)
            scheduleOnRN(show)
          }
        )
      )
    )
  }, [stamp, issued, reduced])
  return { stamp, issued, reduced }
}

/**
 * O selo: disco acid, o texto em volta, o tracejado e o anel da marca. A
 * carteirinha usa o de 80 ("Torcedor validado"); o ingresso, o de 108
 * ("Validado no balcão · Bar do Zé").
 */
export function Seal({
  stamp,
  reduced,
  size = 80,
  label = 'TORCEDOR VALIDADO · ONSIDE · 2026 ·',
  fontSize = 9.6,
  style: place
}: Pick<ReturnType<typeof useStamp>, 'stamp' | 'reduced'> & {
  size?: number
  label?: string
  /** O texto da volta: 9,6 na carteirinha, 8,6 no ingresso (mais longo). */
  fontSize?: number
  style?: object
}) {
  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: stamp.get(), transform: [{ rotate: '-14deg' }] }
      : {
          opacity: Math.min(1, stamp.get() * 1.6),
          transform: [
            { rotate: `${-20 + 6 * stamp.get()}deg` },
            { scale: 1.12 - 0.12 * stamp.get() }
          ]
        }
  )
  return (
    <Animated.View
      style={[styles.seal, { width: size, height: size }, place, style]}
      pointerEvents="none"
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <Path
            id="volta"
            d="M50,50 m-38,0 a38,38 0 1,1 76,0 a38,38 0 1,1 -76,0"
          />
        </Defs>
        <Circle cx={50} cy={50} r={48} fill={ACID} />
        <Circle
          cx={50}
          cy={50}
          r={29}
          fill="none"
          stroke={INK}
          strokeWidth={1.6}
          strokeDasharray="2 2.6"
        />
        <SvgText
          fill={INK}
          fontSize={fontSize}
          fontFamily={MONO}
          letterSpacing={fontSize * 0.11}
        >
          <TextPath href="#volta" startOffset="0">
            {label}
          </TextPath>
        </SvgText>
        <Circle
          cx={50}
          cy={50}
          r={12.5}
          fill="none"
          stroke={INK}
          strokeWidth={5.5}
        />
        <Circle cx={59} cy={59} r={5.2} fill={LIVE} />
      </Svg>
    </Animated.View>
  )
}

/** O código de barras do canhoto: as larguras do desenho. */
const BARS = [
  2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 2,
  1, 3, 1, 1, 2, 1, 1, 2, 3, 1
]

/** O pé da carteirinha: o código de barras e o número (ou "A EMITIR"). */
function Foot({
  validated,
  number,
  since
}: {
  validated: boolean
  number?: string
  since?: string
}) {
  return (
    <View style={styles.foot}>
      <View style={styles.bars}>
        {BARS.map((w, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: traços fixos
            key={i}
            style={{
              width: w,
              marginRight: i % 3 ? 1 : 2,
              backgroundColor: validated ? PAPER : 'rgba(241,238,230,.14)'
            }}
          />
        ))}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.numLabel}>
          {validated ? `DESDE ${since ?? ''}`.trim() : 'A EMITIR'}
        </Text>
        <Text style={styles.num}>
          {validated && number ? `Nº ${number}` : 'Nº ·····'}
        </Text>
      </View>
    </View>
  )
}

/**
 * A carteirinha validada: o pé "A EMITIR" continua até o selo encostar, e
 * então o código e o número aparecem por cima dele.
 */
function Issued({ number, since }: { number?: string; since?: string }) {
  const motion = useStamp()
  const { issued } = motion
  const before = useAnimatedStyle(() => ({ opacity: 1 - issued.get() }))
  const after = useAnimatedStyle(() => ({ opacity: issued.get() }))
  return (
    <>
      <View>
        <Animated.View style={before}>
          <Foot validated={false} />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, after]}>
          <Foot validated number={number} since={since} />
        </Animated.View>
      </View>
      <Seal {...motion} />
    </>
  )
}

/** A marca pequena: o anel com a bola vermelha. */
export function MarkSmall() {
  return (
    <View style={styles.mark}>
      <View style={styles.markRing} />
      <View style={styles.markBall} />
    </View>
  )
}

export function FanCard({
  name,
  teams,
  sports,
  radius,
  base,
  lit = null,
  validated = false,
  number,
  since
}: {
  name: string
  teams: string[]
  /** As siglas do que assiste ("FUT", "F1", "NBA"). */
  sports: string[]
  radius: string | null
  base: string | null
  lit?: CardField
  validated?: boolean
  number?: string
  /** "NOV 2026": quando a carteirinha foi validada. */
  since?: string
}) {
  const palette = usePalette()
  return (
    <View>
      <View style={styles.shadow} />
      <View
        style={[
          styles.card,
          palette.dark && {
            backgroundColor: '#1f1f1a',
            borderWidth: 1,
            borderColor: 'rgba(241,238,230,.1)'
          }
        ]}
      >
        <Dots />
        <View style={styles.top}>
          <View style={styles.logo}>
            <MarkSmall />
            <Text style={styles.word}>ONSIDE</Text>
            <View style={styles.square} />
          </View>
          <Text style={styles.season}>{'TORCEDOR\nTEMPORADA 26'}</Text>
        </View>
        <Text
          numberOfLines={2}
          style={[styles.name, validated && { paddingRight: 84 }]}
        >
          {name.toLocaleUpperCase('pt-BR')}
        </Text>

        <Field label="Torce para" hot={lit === 'teams'}>
          {teams.length ? (
            <Text
              style={[styles.teams, { color: lit === 'teams' ? INK : ACID }]}
            >
              {teams.map((team, i) => (
                <Text key={team}>
                  {i ? (
                    <Text
                      style={{ color: lit === 'teams' ? HOT_LABEL : MUTED }}
                    >
                      {' · '}
                    </Text>
                  ) : null}
                  {team.toLocaleUpperCase('pt-BR')}
                </Text>
              ))}
            </Text>
          ) : (
            <Dash>Escolha um time</Dash>
          )}
        </Field>

        <View style={styles.row}>
          <Field label="Assiste" hot={lit === 'sports'} style={{ flex: 1.3 }}>
            {sports.length ? (
              <View style={styles.pills}>
                {sports.map((mark) => (
                  <View
                    key={mark}
                    style={[
                      styles.pill,
                      lit === 'sports' && {
                        backgroundColor: 'rgba(18,18,15,.08)',
                        borderColor: 'rgba(18,18,15,.25)'
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: lit === 'sports' ? INK : PAPER }
                      ]}
                    >
                      {mark}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Dash>—</Dash>
            )}
          </Field>
          <Field label="Raio" hot={lit === 'radius'} style={{ flex: 0.7 }}>
            {radius ? (
              <Text
                numberOfLines={1}
                style={[
                  styles.value,
                  { color: lit === 'radius' ? INK : PAPER }
                ]}
              >
                {radius}
              </Text>
            ) : (
              <Dash>—</Dash>
            )}
          </Field>
          <Field label="Base" hot={lit === 'base'} style={{ flex: 1.2 }}>
            {base ? (
              <Text
                numberOfLines={1}
                style={[styles.value, { color: lit === 'base' ? INK : PAPER }]}
              >
                {base}
              </Text>
            ) : (
              <Dash>—</Dash>
            )}
          </Field>
        </View>

        {/* O picote, com os recortes dos lados na cor do fundo. */}
        <View style={styles.perforation}>
          <View style={styles.cut} />
          <View
            style={[styles.notch, { left: -7, backgroundColor: palette.bg }]}
          />
          <View
            style={[styles.notch, { right: -7, backgroundColor: palette.bg }]}
          />
        </View>

        {validated ? (
          <Issued number={number} since={since} />
        ) : (
          <Foot validated={false} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: -4,
    borderRadius: 24,
    backgroundColor: '#000'
  },
  card: {
    backgroundColor: INK,
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 12,
    overflow: 'hidden'
  },
  dots: {
    position: 'absolute',
    right: -10,
    top: -10,
    width: '62%',
    height: '70%'
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mark: { width: 18, height: 18 },
  markRing: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: PAPER
  },
  markBall: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: LIVE
  },
  word: {
    fontFamily: 'Anton',
    fontSize: 18,
    letterSpacing: 0.36,
    color: PAPER,
    marginVertical: -4.5
  },
  square: {
    width: 5,
    height: 5,
    backgroundColor: LIVE,
    alignSelf: 'flex-end',
    marginLeft: -5,
    marginBottom: 3
  },
  season: {
    fontFamily: MONO,
    fontSize: 9.5,
    lineHeight: 12.8,
    letterSpacing: 1.14,
    color: MUTED,
    textAlign: 'right'
  },
  // Sem `lineHeight` menor que a altura natural do Anton: o iOS corta o
  // topo. A margem negativa leva a linha aos 0,95em do desenho.
  name: {
    fontFamily: 'Anton',
    fontSize: 30,
    letterSpacing: 0.15,
    color: PAPER,
    marginVertical: -7.4
  },
  field: {
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginVertical: -6,
    marginHorizontal: -8,
    minWidth: 0
  },
  // Geist Mono e Archivo com a altura natural da fonte e margem negativa
  // até a linha do desenho (1em no rótulo, 1,15em no valor).
  label: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 1.14,
    textTransform: 'uppercase',
    marginTop: -1.4,
    marginBottom: 4.6
  },
  value: { fontFamily: 'Archivo-Bold', fontSize: 14, marginVertical: -1.5 },
  teams: {
    fontFamily: 'Anton',
    fontSize: 24,
    letterSpacing: 0.24,
    marginVertical: -6
  },
  dash: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.22)',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 9
  },
  dashText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    color: DASH,
    marginVertical: -1
  },
  row: { flexDirection: 'row', gap: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: 'rgba(241,238,230,.07)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.14)'
  },
  pillText: {
    fontFamily: MONO,
    fontSize: 10.5,
    letterSpacing: 0.42,
    marginVertical: -1.5
  },
  perforation: { height: 14, marginHorizontal: -16 },
  cut: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 6,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.18)'
  },
  notch: {
    position: 'absolute',
    top: 0,
    width: 14,
    height: 14,
    borderRadius: 7
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14
  },
  bars: { flexDirection: 'row', height: 30 },
  numLabel: {
    fontFamily: MONO,
    fontSize: 9,
    letterSpacing: 1.08,
    color: MUTED,
    marginBottom: 5
  },
  num: {
    fontFamily: MONO,
    fontSize: 15,
    color: PAPER,
    fontVariant: ['tabular-nums']
  },
  seal: {
    position: 'absolute',
    right: 14,
    top: 50,
    width: 80,
    height: 80,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 2 }
  }
})
