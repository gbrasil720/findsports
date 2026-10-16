import { useCallback, useRef, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { Glass } from '@/components/glass'
import { EASE } from '@/components/motion'
import { text } from '@/components/ui'

/*
 * Aviso curto para o que o design já mostra mas o app ainda não tem (Ranking,
 * busca com IA, telas do menu "Você"): o toque responde em vez de não fazer
 * nada. Some sozinho em 1,6 s.
 */

const IN = FadeIn.duration(160).easing(EASE)
const OUT = FadeOut.duration(140)

export function useSoon() {
  const [label, setLabel] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((what: string) => {
    clearTimeout(timer.current)
    setLabel(what)
    timer.current = setTimeout(() => setLabel(null), 1600)
  }, [])
  const toast = label ? (
    <Animated.View
      key={label}
      entering={IN}
      exiting={OUT}
      pointerEvents="none"
      style={styles.wrap}
    >
      <Glass tone="dark" style={styles.toast}>
        <Text style={[text(13.5, 'SemiBold', 1.2), { color: '#f1eee6' }]}>
          {label} chega em breve
        </Text>
      </Glass>
    </Animated.View>
  ) : null
  return { show, toast }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: '46%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100
  },
  toast: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    justifyContent: 'center',
    overflow: 'hidden'
  }
})
