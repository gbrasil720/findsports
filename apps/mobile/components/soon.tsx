import { useCallback, useRef, useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  withTiming
} from 'react-native-reanimated'
import { Glass } from '@/components/glass'
import { EASE } from '@/components/motion'
import { text } from '@/components/ui'

/*
 * Aviso curto para o que o design já mostra mas o app ainda não tem (Ranking,
 * busca com IA, telas do menu "Você"): o toque responde em vez de não fazer
 * nada. Some sozinho em 1,6 s. Quem chama passa a frase inteira, para a
 * concordância ficar certa ("O ranking chega em breve", "Minhas reservas
 * chegam em breve").
 */

// Vidro some com opacidade animada (o GlassView não desenha a meio
// caminho): o aviso entra só subindo e crescendo, e sai de uma vez.
const IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 8 }, { scale: 0.96 }] },
    animations: {
      transform: [
        { translateY: withTiming(0, { duration: 200, easing: EASE }) },
        { scale: withTiming(1, { duration: 200, easing: EASE }) }
      ]
    }
  }
}

export function useSoon() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((sentence: string) => {
    clearTimeout(timer.current)
    setMessage(sentence)
    timer.current = setTimeout(() => setMessage(null), 1600)
  }, [])
  const toast = message ? (
    <Animated.View entering={IN} pointerEvents="none" style={styles.wrap}>
      <Glass tone="dark" style={styles.toast}>
        <Text
          style={[text(13.5, 'SemiBold', 1.2), { color: '#f1eee6' }]}
          maxFontSizeMultiplier={1.3}
        >
          {message}
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
    minHeight: 40,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    overflow: 'hidden'
  }
})
