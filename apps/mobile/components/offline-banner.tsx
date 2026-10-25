import { onlineManager } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FullWindowOverlay } from 'react-native-screens'
import { EASE } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { DISPLAY_FONT_SCALE, LIVE, Text, text } from '@/components/ui'

/*
 * "Sem conexão" (WEB-460): a pílula única no topo, por cima de qualquer tela,
 * folhas e modais inclusive (no iOS, numa janela própria, que só pega o toque
 * na pílula). Quem sabe da rede é o `onlineManager`, ligado ao
 * `expo-network` em `lib/query-client.ts`; ao voltar, ele relê a tela.
 */

const subscribe = (notify: () => void) => onlineManager.subscribe(notify)
const LABEL = 'Sem conexão'

export function useOnline() {
  return useSyncExternalStore(subscribe, () => onlineManager.isOnline())
}

// Desce 8 pt e aparece; sai só sumindo, mais rápido do que entrou.
const ENTER = FadeInDown.duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: -8 }] })
const EXIT = FadeOut.duration(150)

export function OfflineBanner() {
  const online = useOnline()
  const insets = useSafeAreaInsets()
  const palette = usePalette()

  useEffect(() => {
    if (!online) AccessibilityInfo.announceForAccessibility(LABEL)
  }, [online])

  const pill = online ? null : (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.pill,
        { top: insets.top + 6, backgroundColor: palette.ink }
      ]}
    >
      <View style={styles.dot} />
      <Text
        style={[text(13, 'Bold'), { color: palette.bg }]}
        maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
        numberOfLines={1}
      >
        {LABEL}
      </Text>
    </Animated.View>
  )

  return Platform.OS === 'ios' ? (
    <FullWindowOverlay>{pill}</FullWindowOverlay>
  ) : (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {pill}
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE }
})
