import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, Share, StyleSheet, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  FadeIn,
  useReducedMotion,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Ladder } from '@/components/levels'
import { MedalImage } from '@/components/medal'
import { EASE, haptic } from '@/components/motion'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  PillButton,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { amountLine } from '@/lib/achievements'
import type { MedalId } from '@/lib/medals'
import { trpc } from '@/lib/trpc'

/*
 * Subiu de nível (rodada 6, tela 2 à direita): o momento raro. O número novo
 * grande, a escada atualizada acendendo até ele e a medalha que fechou a
 * conta. Abre no lugar da medalha nova quando ela sobe o nível
 * (`components/achievement-watcher`). O círculo assenta (.9 → 1 e opacidade,
 * 300 ms) e os nós acendem um a um; com menos movimento, tudo parado.
 */

const CIRCLE_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 300, easing: EASE }),
      transform: [{ scale: withTiming(1, { duration: 300, easing: EASE }) }]
    }
  }
}
const TEXT_IN = FadeIn.delay(120).duration(240)

export default function LevelUp() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  useStatusBar('light')
  const { medalha } = useLocalSearchParams<{ medalha?: string }>()
  const mine = useQuery(trpc.achievements.mine.queryOptions())
  const level = mine.data?.level
  const medal = mine.data?.achievements.find((a) => a.id === medalha)
  useEffect(() => {
    if (level) haptic.success()
  }, [level])
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/voce/conquistas')
  if (!level) return <View style={styles.screen} />
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }
      ]}
    >
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={8}
          onPress={close}
          style={styles.round}
        >
          <Icon name="close" size={20} color={PAPER} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar"
          hitSlop={8}
          onPress={() =>
            Share.share({
              message: `Subi para o nível ${level.level} da Onside: ${level.name}. https://onside.sh`
            })
          }
          style={styles.round}
        >
          <Icon name="share" size={20} color={PAPER} />
        </Pressable>
      </View>
      <Text style={styles.kicker}>SUBIU DE NÍVEL</Text>
      <View style={styles.glow}>
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="brilho" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACID} stopOpacity={0.25} />
              <Stop offset="0.68" stopColor={ACID} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#brilho)" />
        </Svg>
        <Animated.View
          entering={reduced ? undefined : CIRCLE_IN}
          style={styles.circle}
        >
          <Text style={styles.number}>{level.level}</Text>
        </Animated.View>
      </View>
      <Animated.View
        entering={reduced ? undefined : TEXT_IN}
        style={styles.copy}
      >
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>
          {level.name}
        </Text>
        <Text style={[text(15, 'Regular', 1.45), styles.line]}>
          {level.unlocked} {level.unlocked === 1 ? 'conquista' : 'conquistas'}.
          {medal
            ? ` A ${medal.name} fechou a conta${medal.where ? `, no ${medal.where}` : ''}.`
            : ''}
        </Text>
      </Animated.View>
      <View style={{ alignSelf: 'stretch' }}>
        <Ladder current={level.level} light />
      </View>
      {medal ? (
        <View style={styles.closer}>
          <MedalImage id={medal.id as MedalId} size={56} />
          <View>
            <Text style={styles.small}>A QUE FECHOU</Text>
            <Text style={[text(16, 'Bold', 1.25), { color: PAPER }]}>
              {medal.name}
            </Text>
            <Text style={styles.small}>{amountLine(medal)}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.cta}>
        <PillButton
          label="Ver minhas conquistas"
          onPress={() => router.replace('/voce/conquistas')}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: INK,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 12
  },
  top: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#26261f',
    alignItems: 'center',
    justifyContent: 'center'
  },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.44,
    color: ACID,
    marginTop: 10
  },
  glow: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6
  },
  circle: {
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 6 }
  },
  // Anton 72/1: margem negativa no lugar do entrelinha curto.
  number: {
    fontFamily: 'Anton',
    fontSize: 72,
    color: INK,
    marginVertical: -17.5
  },
  copy: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  name: {
    fontFamily: 'Anton',
    fontSize: 54,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -13
  },
  line: { color: '#aaa9a4', textAlign: 'center', maxWidth: 300 },
  closer: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.1)',
    backgroundColor: '#1f1f1a'
  },
  small: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5, color: '#aaa9a4' },
  cta: { alignSelf: 'stretch', marginTop: 'auto' }
})
