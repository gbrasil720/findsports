import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { EASE, haptic } from '@/components/motion'
import { ACID, Icon, INK, PAPER, Text, text } from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { DONE_TEXT, setDone, useDone } from '@/lib/pending-action'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * "Conta criada e presença marcada" (rodada 2 do redesign, tela 3): o cartão de
 * tinta que diz o que a folha de entrar fez. Entra pela borda de baixo, por
 * onde a folha saiu (mola sem passo além), com um háptico de sucesso. Conta
 * nova sem preferências ganha o convite de 30 segundos ("Escolher agora" abre
 * "Do que você gosta?", "Depois" conclui sem nada); conta de antes vê só a
 * ação, e o cartão sai sozinho.
 */

const INVITE =
  'Quer que a Onside mostre primeiro o que você curte? Esportes, times e até onde você vai: leva 30 segundos.'

export function ActionDone() {
  const done = useDone()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const shown = useSharedValue(0)
  const later = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        await refreshSession()
        await queryClient.invalidateQueries()
      }
    })
  )

  const close = () => {
    shown.set(
      withTiming(0, { duration: 200, easing: EASE }, (finished) => {
        if (finished) scheduleOnRN(setDone, null)
      })
    )
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: um cartão por ação
  useEffect(() => {
    if (!done) return
    haptic.success()
    shown.set(
      reduced
        ? withTiming(1, { duration: 200 })
        : withSpring(1, { duration: 300, dampingRatio: 1 })
    )
    // Sem convite, o cartão só conta o que foi feito e sai sozinho.
    if (done.invite) return
    const timer = setTimeout(close, 3500)
    return () => clearTimeout(timer)
  }, [done])

  const style = useAnimatedStyle(() =>
    reduced
      ? { opacity: shown.get() }
      : { transform: [{ translateY: (1 - shown.get()) * 260 }] }
  )

  if (!done) return null
  const [freshTitle, title, line] = DONE_TEXT[done.kind]
  const heading = done.fresh ? freshTitle : title
  return (
    <Animated.View
      accessibilityRole="alert"
      style={[styles.spot, { bottom: insets.bottom + 78 }, style]}
    >
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.check}>
            <Icon name="check" size={20} color={INK} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(17, 'Bold', 1.25), { color: PAPER }]}>
              {heading}
            </Text>
            <Text
              style={[
                text(14, 'Regular', 1.45),
                { color: '#c9c7c0', marginTop: 3 }
              ]}
            >
              {line}
              {done.invite ? ` ${INVITE}` : ''}
            </Text>
          </View>
        </View>
        {done.invite ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                close()
                router.push({ pathname: '/gostos', params: { tag: heading } })
              }}
              style={[styles.button, styles.acid]}
            >
              <Text style={[text(14, 'Bold', 1.2), { color: INK }]}>
                Escolher agora
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                close()
                later.mutate({})
              }}
              style={[styles.button, styles.outline]}
            >
              <Text style={[text(14, 'Bold', 1.2), { color: PAPER }]}>
                Depois
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  // 112 do pé, como `.fresh` (a barra de início dentro).
  spot: { position: 'absolute', left: 12, right: 12 },
  // `.fresh`: raio 26, 18 de respiro e a sombra dura de 4 (a funda some no
  // RN sem duas camadas; fica a dura, que é a que se lê).
  card: {
    backgroundColor: INK,
    borderRadius: 26,
    padding: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10
  },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  check: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  actions: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  acid: {
    backgroundColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  outline: { borderWidth: 1.5, borderColor: 'rgba(241,238,230,.3)' }
})
