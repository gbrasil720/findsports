import { isLiquidGlassAvailable } from 'expo-glass-effect'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View
} from 'react-native'
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import Svg, {
  Defs,
  Mask,
  RadialGradient,
  Rect,
  Stop,
  Circle as SvgCircle
} from 'react-native-svg'
import { Glass } from '@/components/glass'
import { EASE, haptic, ScalePress } from '@/components/motion'
import { ACID, INK, PAPER, text } from '@/components/ui'

/*
 * Primeiro acesso (4o do design, `fCoach` da Rodada 4): o Explorar escurece
 * com um furo em volta do botão da IA na barra, o anel acid em volta dele e o
 * balão "Busca com IA". Uma vez só, guardado no aparelho. "Agora não" e
 * "Entendi" fecham; tocar no botão (o furo) abre a busca.
 *
 * O design só desenha o claro; no escuro, o balão é tinta com texto papel e
 * a sombra continua acid.
 */

const SEEN_KEY = 'onside.coach-ia'

/**
 * Centro do botão da IA a partir do canto de baixo à direita. No design
 * (390 x 844) é x = 344, y = 784; a barra nativa do iOS 26 o põe em
 * x = 338, y = 792 (medido no iPhone 16e), e é ele que o furo tem de cercar.
 */
const HOLE = { right: 52, bottom: 52, r: 44 }

const LIQUID = isLiquidGlassAvailable()

// Balão: sobe e cresce um pouco, assenta. Os botões de vidro entram só com
// movimento (vidro não desenha a meio caminho da opacidade).
const BALLOON_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 10 }, { scale: 0.94 }]
    },
    animations: {
      opacity: withDelay(120, withTiming(1, { duration: 180 })),
      transform: [
        {
          translateY: withDelay(
            120,
            withTiming(0, { duration: 260, easing: EASE })
          )
        },
        {
          scale: withDelay(120, withTiming(1, { duration: 260, easing: EASE }))
        }
      ]
    }
  }
}
const BUTTONS_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: {
      opacity: LIQUID ? 1 : 0,
      transform: [{ translateY: 10 }]
    },
    animations: {
      opacity: withDelay(200, withTiming(1, { duration: 180 })),
      transform: [
        {
          translateY: withDelay(
            200,
            withTiming(0, { duration: 260, easing: EASE })
          )
        }
      ]
    }
  }
}
// Sai mais rápido do que entra: quem fechou já decidiu.
const BALLOON_OUT = FadeOut.duration(120)
const DIM_IN = FadeIn.duration(220)
const DIM_OUT = FadeOut.duration(160)

/** Se o coach ainda não foi visto neste aparelho. `force` mostra de novo (DEV). */
export function useCoachPending(force: boolean) {
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (force) {
      setPending(true)
      return
    }
    SecureStore.getItemAsync(SEEN_KEY)
      .then((seen) => {
        if (!seen) setTimeout(() => setPending(true), 700)
      })
      .catch(() => {})
  }, [force])
  const done = () => {
    setPending(false)
    SecureStore.setItemAsync(SEEN_KEY, '1').catch(() => {})
  }
  return { pending, done }
}

export function AiCoach({
  onClose,
  onOpen
}: {
  onClose: () => void
  onOpen: () => void
}) {
  const { width, height } = useWindowDimensions()
  const dark = useColorScheme() === 'dark'
  const cx = width - HOLE.right
  const cy = height - HOLE.bottom
  // O halo do anel respira devagar, para o olho achar o botão.
  const breathe = useSharedValue(1)
  useEffect(() => {
    breathe.set(
      withDelay(
        500,
        withRepeat(
          withTiming(1.08, {
            duration: 900,
            easing: Easing.inOut(Easing.sin)
          }),
          -1,
          true
        )
      )
    )
  }, [breathe])
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.get() }]
  }))

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        entering={DIM_IN}
        exiting={DIM_OUT}
        style={StyleSheet.absoluteFill}
      >
        {/* Escurece tudo, menos um círculo em volta do botão da IA, com a
            borda de 2 pt em degradê do design. Absorve os toques. */}
        <Pressable style={StyleSheet.absoluteFill} accessible={false}>
          <Svg width={width} height={height}>
            <Defs>
              <RadialGradient
                id="hole"
                cx={cx}
                cy={cy}
                r={HOLE.r + 2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset={HOLE.r / (HOLE.r + 2)} stopColor="#000" />
                <Stop offset={1} stopColor="#fff" />
              </RadialGradient>
              <Mask id="dim">
                <Rect width={width} height={height} fill="#fff" />
                <SvgCircle cx={cx} cy={cy} r={HOLE.r + 2} fill="url(#hole)" />
              </Mask>
            </Defs>
            <Rect
              width={width}
              height={height}
              fill="rgba(18,18,15,.62)"
              mask="url(#dim)"
            />
          </Svg>
        </Pressable>

        {/* O anel: 3 pt de acid colado no círculo de 76 e o halo de 7 pt. */}
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { left: cx - 48, top: cy - 48 }, halo]}
        />
        <View
          pointerEvents="none"
          style={[styles.ring, { left: cx - 41, top: cy - 41 }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir a busca com IA"
          onPress={() => {
            haptic.select()
            onOpen()
          }}
          style={[styles.hit, { left: cx - 38, top: cy - 38 }]}
        />
      </Animated.View>

      <View pointerEvents="box-none" style={styles.callout}>
        <Animated.View
          entering={BALLOON_IN}
          exiting={BALLOON_OUT}
          style={[styles.balloon, { backgroundColor: dark ? INK : PAPER }]}
        >
          <Text
            style={[text(15, 'Regular', 1.45), { color: dark ? PAPER : INK }]}
          >
            <Text style={{ fontFamily: 'Archivo-Bold' }}>
              Busca com IA{'\n'}
            </Text>
            Quando quiser algo específico, toque aqui e diga o que procura.
          </Text>
        </Animated.View>
        <Animated.View entering={BUTTONS_IN} style={styles.buttons}>
          <ScalePress accessibilityRole="button" onPress={onClose}>
            <Glass tone="dark" interactive style={styles.later}>
              <Text style={[text(14, 'Bold', 1.2), { color: PAPER }]}>
                Agora não
              </Text>
            </Glass>
          </ScalePress>
          <ScalePress
            accessibilityRole="button"
            onPress={onClose}
            style={styles.ok}
          >
            <Text style={[text(14, 'Bold', 1.2), { color: INK }]}>Entendi</Text>
          </ScalePress>
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  halo: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 7,
    borderColor: 'rgba(201,241,53,.3)'
  },
  ring: {
    position: 'absolute',
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    borderColor: ACID
  },
  hit: { position: 'absolute', width: 76, height: 76, borderRadius: 38 },
  callout: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 118,
    alignItems: 'flex-end',
    gap: 12
  },
  balloon: {
    maxWidth: 250,
    // Cresce a partir do canto que aponta para o botão da IA.
    transformOrigin: 'bottom right',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 4,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  },
  buttons: { flexDirection: 'row', gap: 8 },
  later: {
    height: 42,
    paddingHorizontal: 16,
    borderRadius: 21,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  ok: {
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    justifyContent: 'center',
    backgroundColor: ACID,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  }
})
