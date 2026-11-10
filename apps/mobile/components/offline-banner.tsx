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
import { haptic, usePressScale } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  LIVE,
  MAX_FONT_SCALE,
  PAPER,
  Text,
  text
} from '@/components/ui'

/*
 * "Sem internet" (14j do design, rodada 7; WEB-460): a faixa de tinta no
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

// Desce de trás da barra de status e sobe pela mesma borda (240 ms; sair é
// mais rápido, 200 ms).
const OUT = Easing.bezier(0.23, 1, 0.32, 1)
const ENTER = (values: EntryAnimationsValues): LayoutAnimation => {
  'worklet'
  return {
    initialValues: {
      transform: [{ translateY: -(values.targetOriginY + values.targetHeight) }]
    },
    animations: {
      transform: [{ translateY: withTiming(0, { duration: 240, easing: OUT }) }]
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

  // Tinta sólida nos dois temas (rodada 7: vidro some sobre foto e mapa);
  // no escuro sobe um tom para se separar do fundo.
  const banner = online ? null : (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      style={[
        styles.banner,
        { top: insets.top + 2, backgroundColor: palette.dark ? '#26261f' : INK }
      ]}
    >
      <View
        accessibilityRole="alert"
        accessibilityLabel={LABEL}
        style={styles.message}
      >
        <Icon name="wifi" size={18} color={ACID} accent={LIVE} />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[text(13, 'Bold', 1.3), { color: PAPER }]}
          >
            Sem internet
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[text(12, 'Regular', 1.3), { color: '#aaa9a4' }]}
          >
            mostrando o que estava salvo
          </Text>
        </View>
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
            style={[text(14.5, 'Bold'), styles.sizer]}
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
              style={[text(14.5, 'Bold'), { color: INK }]}
            >
              {trying ? 'Tentando…' : 'Tentar'}
            </Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
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
  // `.off7`: 12 das bordas, canto 18, sombra dura de 4.
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  message: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  try: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
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
