import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs,
  Path,
  Text as SvgText,
  TextPath
} from 'react-native-svg'
import { usePalette } from '@/components/theme'
import { ACID, INK, LIVE, PAPER, Text } from '@/components/ui'

/*
 * A carteirinha do torcedor (rodada 2 do redesign, onboarding B): ingresso,
 * crachá e placar. Peça de tinta com a sombra sólida dos cartões; o nome em
 * Anton, "Torce para" em acid, o que assiste, o raio e a base. Campo vazio é
 * tracejado; o do passo atual acende em acid. Depois do picote, o canhoto com
 * o código de barras e o número, que só aparecem validada, e o selo de clube
 * carimbado no fim. Sem escudos: times só pelo nome.
 */

export type CardField = 'teams' | 'sports' | 'radius' | 'base' | null

const MONO = 'GeistMono-SemiBold'

/** Nº 0.128.441: um número fixo por conta, tirado do id. */
export function cardNumber(id: string) {
  let n = 0
  for (const char of id) n = (n * 31 + char.charCodeAt(0)) % 1_000_000
  return `0.${String(Math.floor(n / 1000)).padStart(3, '0')}.${String(n % 1000).padStart(3, '0')}`
}

function Label({ children, on }: { children: string; on: boolean }) {
  return (
    <Text style={[styles.label, { color: on ? INK : '#8f8d87' }]}>
      {children}
    </Text>
  )
}

/** Um campo da carteirinha: acende em acid quando é o do passo. */
function Field({
  label,
  on,
  empty,
  children,
  style
}: {
  label: string
  on: boolean
  empty: boolean
  children: React.ReactNode
  style?: object
}) {
  return (
    <View style={[styles.field, on && styles.fieldOn, style]}>
      <Label on={on}>{label}</Label>
      {empty ? (
        <View style={[styles.dashed, on && { borderColor: INK }]}>
          <Text style={[styles.mono, { color: on ? INK : '#8f8d87' }]}>–</Text>
        </View>
      ) : (
        children
      )}
    </View>
  )
}

/** O selo: disco acid com o texto em volta e o anel da marca no meio. */
function Seal() {
  const reduced = useReducedMotion()
  const stamp = useSharedValue(0)
  useEffect(() => {
    stamp.set(
      reduced
        ? withTiming(1, { duration: 200 })
        : withSpring(1, { duration: 350, dampingRatio: 0.8 })
    )
  }, [stamp, reduced])
  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: stamp.get() }
      : {
          opacity: Math.min(1, stamp.get() * 2),
          transform: [
            { scale: 1.25 - 0.25 * stamp.get() },
            { rotate: '-12deg' }
          ]
        }
  )
  const r = 30
  return (
    <Animated.View style={[styles.seal, style]} pointerEvents="none">
      <Svg width={76} height={76} viewBox="0 0 76 76">
        <Defs>
          <Path
            id="volta"
            d={`M38,38 m-${r},0 a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 -${2 * r},0`}
          />
        </Defs>
        <Circle cx={38} cy={38} r={37} fill={ACID} />
        <Circle
          cx={38}
          cy={38}
          r={33}
          fill="none"
          stroke={INK}
          strokeWidth={1}
        />
        <SvgText
          fill={INK}
          fontSize={7.4}
          fontFamily={MONO}
          letterSpacing={1.4}
        >
          <TextPath href="#volta">TORCEDOR VALIDADO · ONSIDE · 2026 ·</TextPath>
        </SvgText>
        <Circle
          cx={36}
          cy={36}
          r={9}
          fill="none"
          stroke={INK}
          strokeWidth={4}
        />
        <Circle cx={44} cy={44} r={4} fill={LIVE} />
      </Svg>
    </Animated.View>
  )
}

/** O código de barras do canhoto: traços fixos, nítidos só validada. */
const BARS = [
  3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3
]

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
  radius: number | null
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
      <View
        style={[
          styles.shadow,
          { backgroundColor: palette.dark ? '#000' : 'rgba(18,18,15,.22)' }
        ]}
      />
      <View style={styles.card}>
        <View style={styles.dots} pointerEvents="none">
          {Array.from({ length: 60 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: trama fixa
            <View key={i} style={styles.dot} />
          ))}
        </View>
        <View style={styles.head}>
          <View style={styles.brand}>
            <View style={styles.ring} />
            <View style={styles.ball} />
            <Text style={styles.word}>
              ONSIDE<Text style={{ color: LIVE }}>.</Text>
            </Text>
          </View>
          <Text style={[styles.mono, styles.season]}>
            {'TORCEDOR\nTEMPORADA 26'}
          </Text>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={styles.name}>
          {name.toLocaleUpperCase('pt-BR')}
        </Text>
        {validated ? <Seal /> : null}

        <View style={[styles.teams, lit === 'teams' && styles.fieldOn]}>
          <Label on={lit === 'teams'}>TORCE PARA</Label>
          {teams.length ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.teamText, { color: lit === 'teams' ? INK : ACID }]}
            >
              {teams.join(' · ').toLocaleUpperCase('pt-BR')}
            </Text>
          ) : (
            <View
              style={[
                styles.dashed,
                styles.dashedWide,
                lit === 'teams' && { borderColor: INK }
              ]}
            >
              <Text
                style={[
                  styles.mono,
                  { color: lit === 'teams' ? INK : '#8f8d87' }
                ]}
              >
                Escolha um time
              </Text>
            </View>
          )}
        </View>

        <View style={styles.row}>
          <Field
            label="ASSISTE"
            on={lit === 'sports'}
            empty={!sports.length}
            style={{ flex: 1.4 }}
          >
            <View style={styles.marks}>
              {sports.slice(0, 4).map((mark) => (
                <View
                  key={mark}
                  style={[
                    styles.mark,
                    {
                      borderColor:
                        lit === 'sports' ? INK : 'rgba(241,238,230,.3)'
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.markText,
                      { color: lit === 'sports' ? INK : PAPER }
                    ]}
                  >
                    {mark}
                  </Text>
                </View>
              ))}
            </View>
          </Field>
          <Field
            label="RAIO"
            on={lit === 'radius'}
            empty={radius === null}
            style={{ flex: 0.8 }}
          >
            <Text
              style={[styles.value, { color: lit === 'radius' ? INK : PAPER }]}
            >
              {radius} km
            </Text>
          </Field>
          <Field
            label="BASE"
            on={lit === 'base'}
            empty={!base}
            style={{ flex: 1.3 }}
          >
            <Text
              numberOfLines={1}
              style={[styles.value, { color: lit === 'base' ? INK : PAPER }]}
            >
              {base}
            </Text>
          </Field>
        </View>

        {/* O picote, com os recortes dos lados na cor do fundo. */}
        <View style={styles.perforation}>
          <View
            style={[styles.notch, { left: -26, backgroundColor: palette.bg }]}
          />
          <View style={styles.cut} />
          <View
            style={[styles.notch, { right: -26, backgroundColor: palette.bg }]}
          />
        </View>

        <View style={styles.stub}>
          <View style={[styles.bars, { opacity: validated ? 1 : 0.35 }]}>
            {BARS.map((w, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: traços fixos
              <View key={i} style={[styles.bar, { width: w }]} />
            ))}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.label, { color: '#8f8d87' }]}>
              {validated ? `DESDE ${since ?? ''}`.trim() : 'A EMITIR'}
            </Text>
            <Text style={[styles.mono, { color: PAPER, fontSize: 13 }]}>
              Nº {validated && number ? number : '· · · · ·'}
            </Text>
          </View>
        </View>
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
    borderRadius: 24
  },
  card: {
    backgroundColor: INK,
    borderRadius: 24,
    padding: 16,
    paddingBottom: 14,
    gap: 10,
    overflow: 'hidden'
  },
  dots: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 120,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    opacity: 0.18
  },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: PAPER },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 20 },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3.5,
    borderColor: PAPER
  },
  ball: {
    position: 'absolute',
    left: 11,
    top: 12,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: LIVE
  },
  word: { fontFamily: 'Anton', fontSize: 15, color: PAPER, marginVertical: -4 },
  season: { color: '#8f8d87', fontSize: 9, textAlign: 'right', lineHeight: 12 },
  name: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    marginVertical: -7,
    marginTop: 2
  },
  teams: { gap: 4, marginHorizontal: -8, padding: 8, borderRadius: 12 },
  teamText: { fontFamily: 'Anton', fontSize: 24, marginVertical: -6 },
  row: { flexDirection: 'row', gap: 8 },
  field: { gap: 5, marginHorizontal: -4, padding: 6, borderRadius: 10 },
  fieldOn: { backgroundColor: ACID },
  label: { fontFamily: MONO, fontSize: 9, letterSpacing: 0.6 },
  mono: { fontFamily: MONO, fontSize: 11 },
  dashed: {
    alignSelf: 'flex-start',
    minWidth: 26,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.3)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dashedWide: { paddingHorizontal: 10 },
  marks: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  mark: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2
  },
  markText: { fontFamily: MONO, fontSize: 9.5 },
  value: { fontFamily: 'Archivo-Bold', fontSize: 14 },
  perforation: { height: 12, justifyContent: 'center', marginHorizontal: -16 },
  cut: {
    marginHorizontal: 16,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.22)'
  },
  notch: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    top: -4
  },
  stub: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end'
  },
  bars: { flexDirection: 'row', gap: 2, height: 28, alignItems: 'stretch' },
  bar: { backgroundColor: PAPER },
  seal: { position: 'absolute', top: 44, right: 14 }
})
