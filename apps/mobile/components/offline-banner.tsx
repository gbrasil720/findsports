import { onlineManager, useQueryClient } from '@tanstack/react-query'
import * as Network from 'expo-network'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View
} from 'react-native'
import Animated, {
  Easing,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
  FadeIn,
  type LayoutAnimation,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FullWindowOverlay } from 'react-native-screens'
import { Glass } from '@/components/glass'
import { haptic, usePressScale } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  INK,
  LIVE,
  MAX_FONT_SCALE,
  PAPER,
  Text,
  text
} from '@/components/ui'

/*
 * "Sem internet" (14j do design, Rodada 14; WEB-460): a faixa de vidro no
 * topo, por cima de qualquer tela, folhas e modais inclusive (no iOS, numa
 * janela própria, que só pega o toque na faixa). Quem sabe da rede é o
 * `onlineManager`, ligado ao `expo-network` em `lib/query-client.ts`; ao
 * voltar, ele relê a tela e a faixa sobe. "Tentar" pergunta ao sistema se a
 * rede voltou e, se voltou, relê as consultas à vista na hora.
 */

const subscribe = (notify: () => void) => onlineManager.subscribe(notify)
const LABEL = 'Sem internet · mostrando o que estava salvo'
/** O "Tentando…" fica à vista pelo menos isso, para ser lido. */
const MIN_TRY_MS = 700

export function useOnline() {
  return useSyncExternalStore(subscribe, () => onlineManager.isOnline())
}

// Desce de trás da barra de status e sobe ao sair, só com movimento: vidro
// com transparência animada sai errado no iOS 26. Sair é mais rápido que
// entrar.
const OUT = Easing.bezier(0.23, 1, 0.32, 1)
const ENTER = (values: EntryAnimationsValues): LayoutAnimation => {
  'worklet'
  return {
    initialValues: {
      transform: [{ translateY: -(values.targetOriginY + values.targetHeight) }]
    },
    animations: {
      transform: [{ translateY: withTiming(0, { duration: 280, easing: OUT }) }]
    }
  }
}
const EXIT = (values: ExitAnimationsValues): LayoutAnimation => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: {
      transform: [
        {
          translateY: withTiming(
            -(values.currentOriginY + values.currentHeight),
            { duration: 200, easing: OUT }
          )
        }
      ]
    }
  }
}

export function OfflineBanner() {
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  const [trying, setTrying] = useState(false)
  const press = usePressScale(0.95)

  useEffect(() => {
    if (!online) AccessibilityInfo.announceForAccessibility(LABEL)
  }, [online])

  const retry = async () => {
    if (trying) return
    setTrying(true)
    const [state] = await Promise.all([
      Network.getNetworkStateAsync().catch(() => null),
      new Promise((done) => setTimeout(done, MIN_TRY_MS))
    ])
    setTrying(false)
    if (state?.isConnected === false) {
      haptic.error()
      return
    }
    haptic.success()
    // Rede de volta: a faixa sobe e `lib/query-client.ts` relê a tela.
    onlineManager.setOnline(true)
    queryClient.refetchQueries({ type: 'active' })
  }

  // No escuro, tinta e papel trocam (regra do design para o escuro).
  const fg = palette.dark ? INK : PAPER
  const bar = palette.dark ? 'rgba(18,18,15,.3)' : 'rgba(241,238,230,.3)'
  const banner = online ? null : (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      style={[styles.wrap, { top: insets.top + 4 }]}
    >
      <Glass
        tone={palette.dark ? 'light' : 'dark'}
        tint={palette.dark ? 'rgba(241,238,230,.86)' : 'rgba(18,18,15,.82)'}
        style={styles.banner}
      >
        <View
          accessibilityRole="alert"
          accessibilityLabel={LABEL}
          style={styles.message}
        >
          <View style={styles.bars}>
            {[5, 8, 11, 14].map((height, index) => (
              <View
                key={height}
                style={[
                  styles.bar,
                  { height, backgroundColor: index ? bar : LIVE }
                ]}
              />
            ))}
          </View>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[text(14, 'SemiBold', 1.3), styles.label, { color: fg }]}
          >
            {LABEL}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={trying ? 'Tentando' : 'Tentar de novo'}
          accessibilityState={{ busy: trying }}
          disabled={trying}
          hitSlop={6}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={retry}
        >
          <Animated.View style={[styles.try, press.style]}>
            {/* A largura é a do rótulo maior: trocar não empurra o texto. */}
            <Text
              aria-hidden
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
              style={[text(12.5, 'Bold'), styles.sizer]}
            >
              Tentando…
            </Text>
            <Animated.View
              key={trying ? 'trying' : 'idle'}
              entering={FadeIn.duration(150)}
              style={styles.tryLabel}
            >
              <Text
                maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
                style={[text(12.5, 'Bold'), { color: INK }]}
              >
                {trying ? 'Tentando…' : 'Tentar'}
              </Text>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Glass>
    </Animated.View>
  )

  return Platform.OS === 'ios' ? (
    <FullWindowOverlay>{banner}</FullWindowOverlay>
  ) : (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {banner}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 }
  },
  banner: {
    minHeight: 50,
    borderRadius: 25,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 8
  },
  message: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3.5, borderRadius: 1 },
  label: { flex: 1 },
  try: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: ACID
  },
  sizer: { opacity: 0 },
  tryLabel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
