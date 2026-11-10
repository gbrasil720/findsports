import { LEVELS } from '@findsports_oficial/api/lib/achievements'
import { useEffect } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { EASE } from '@/components/motion'
import { ACID, INK, PAPER, Text, text } from '@/components/ui'

/*
 * A escada dos cinco níveis (`.lad` da rodada 6), sempre sobre tinta: os
 * passados em papel, o atual em acid com o anel, os que faltam apagados. Os
 * níveis e quantas conquistas cada um pede são do servidor (`LEVELS`).
 */

// Constantes de módulo: o Reanimated recomeça a entrada se o objeto muda.
const LIGHT_IN = [0, 1, 2, 3, 4].map((i) =>
  FadeIn.delay(300 + i * 60).duration(180)
)

/**
 * Barra de progresso da rodada 6 (nível, duelo, perto de sair): parada ao
 * abrir; quando o número muda, anda até o novo (400 ms EASE). É absoluta e
 * sem filhos, então animar a largura não mexe em mais nada.
 */
export function GrowBar({
  share,
  style
}: {
  share: number
  style: StyleProp<ViewStyle>
}) {
  const width = useSharedValue(share)
  useEffect(() => {
    width.set(withTiming(share, { duration: 400, easing: EASE }))
  }, [share, width])
  const grow = useAnimatedStyle(() => ({ width: `${width.get() * 100}%` }))
  return <Animated.View style={[style, grow]} />
}

export function Ladder({
  current,
  light
}: {
  current: number
  /** Subiu de nível: os nós acendem em sequência, 60 ms entre eles. */
  light?: boolean
}) {
  const reduced = useReducedMotion()
  return (
    <View style={styles.ladder}>
      <View style={styles.ladderLine} />
      {LEVELS.map((l, index) => {
        const past = l.level < current
        const now = l.level === current
        const node = (
          <View
            style={[
              styles.node,
              past
                ? { backgroundColor: PAPER, borderWidth: 0 }
                : now
                  ? styles.nodeNow
                  : null
            ]}
          >
            <Text
              style={[
                styles.nodeText,
                { color: past || now ? INK : '#6b6a63' }
              ]}
            >
              {l.level}
            </Text>
          </View>
        )
        return (
          <View key={l.level} style={styles.rung}>
            {light && !reduced && (past || now) ? (
              // O nó apagado por baixo e o aceso entrando por cima: enquanto
              // espera a vez, o nó não some.
              <View>
                <View style={styles.node}>
                  <Text style={[styles.nodeText, { color: '#6b6a63' }]}>
                    {l.level}
                  </Text>
                </View>
                <Animated.View
                  entering={LIGHT_IN[index]}
                  style={StyleSheet.absoluteFill}
                >
                  {node}
                </Animated.View>
              </View>
            ) : (
              node
            )}
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.rungName, { color: now ? PAPER : '#aaa9a4' }]}
            >
              {l.name}
            </Text>
            <Text style={styles.rungFrom}>{l.from}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  ladder: { flexDirection: 'row' },
  ladderLine: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: 15,
    height: 2,
    backgroundColor: '#34342d'
  },
  rung: { flex: 1, alignItems: 'center', gap: 4 },
  node: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#26261f',
    borderWidth: 1.5,
    borderColor: '#34342d',
    alignItems: 'center',
    justifyContent: 'center'
  },
  nodeNow: {
    backgroundColor: ACID,
    borderWidth: 4,
    borderColor: 'rgba(201,241,53,.25)'
  },
  nodeText: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  rungName: { ...text(10.5, 'SemiBold', 1.15), maxWidth: '96%' },
  rungFrom: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    color: '#6b6a63'
  }
})
