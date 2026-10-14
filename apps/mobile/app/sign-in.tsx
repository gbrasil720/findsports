import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from '@/components/glass'
import { EASE, ErrorText, haptic } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  authErrorMessage,
  BlockButton,
  Field,
  INK,
  LIVE,
  MUTED,
  PAPER,
  Screen,
  Title,
  text
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

/*
 * "Login · v2" do design. Quem tem verificação em duas etapas segue para
 * `/two-factor`; quem não confirmou o e-mail recebe outro link (o servidor
 * reenvia no login) e vai para `/verify-email`.
 */

const NOTICES: Record<string, string> = {
  expired: 'O link de confirmação expirou. Entre para receber outro.',
  reset: 'Senha nova salva. Entre com ela.'
}

export default function SignIn() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ email?: string; notice?: string }>()
  const [email, setEmail] = useState(params.email ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const turnstile = useTurnstile()
  const notice = params.notice ? NOTICES[params.notice] : undefined
  // A foto assenta de um zoom leve quando a tela abre.
  const zoom = useSharedValue(1.08)
  useEffect(() => {
    zoom.value = withTiming(1, { duration: 1400, easing: EASE })
  }, [zoom])
  const settle = useAnimatedStyle(() => ({
    transform: [{ scale: zoom.value }]
  }))

  const submit = async () => {
    setError(null)
    setPending(true)
    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
      callbackURL: '/verified',
      fetchOptions: turnstile.fetchOptions
    })
    // O token do Turnstile vale uma vez: com erro ou não, pede outro.
    turnstile.reset()
    setPending(false)
    if (result.error) {
      if (result.error.code === 'EMAIL_NOT_VERIFIED') {
        router.push({
          pathname: '/verify-email',
          params: { email: email.trim() }
        })
        return
      }
      setError(
        authErrorMessage(
          result.error,
          'Não foi possível entrar. Tente de novo.'
        )
      )
      return
    }
    if (result.data && 'twoFactorRedirect' in result.data) {
      router.push('/two-factor')
      return
    }
    haptic.success()
    // A sessão mudou: o que estava em cache era de visitante.
    await queryClient.invalidateQueries()
    router.replace('/')
  }

  return (
    <Screen
      gap={0}
      lightStatus
      header={
        <View style={styles.hero}>
          <Animated.Image
            source={require('../assets/images/intro/bar.jpg')}
            style={[{ width: '100%', height: '100%' }, settle]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(18,18,15,.2)', 'rgba(18,18,15,0)', PAPER]}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.top, { top: insets.top + 8 }]}>
            <Glass tone="dark" style={styles.chip}>
              <Image
                source={require('../assets/images/brand/wordmark-light.png')}
                accessibilityLabel="Onside"
                style={{ height: 19, width: (19 * 845) / 256 }}
              />
            </Glass>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/profile')}
            >
              <Glass tone="dark" interactive style={styles.chip}>
                <Text style={[text(13.5, 'SemiBold'), { color: PAPER }]}>
                  Criar conta
                </Text>
              </Glass>
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={styles.content}>
        <View>
          <Title lines={[['De volta ', 'ao jogo.']]} size={48} />
          <View style={{ marginTop: 8 }}>
            <Text style={[text(15), { color: MUTED }]}>
              Não tem conta?{' '}
              <Text
                accessibilityRole="link"
                onPress={() => router.push('/profile')}
                style={[text(15, 'Bold'), { color: INK }, styles.underline]}
              >
                Cadastre-se grátis
              </Text>
            </Text>
          </View>
        </View>
        {notice ? (
          <Text accessibilityRole="alert" style={text(14, 'SemiBold')}>
            {notice}
          </Text>
        ) : null}
        <Field
          label="E-mail"
          icon="mail"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Senha"
          icon="lock"
          action={{
            label: 'Esqueci minha senha',
            onPress: () =>
              router.push({
                pathname: '/forgot-password',
                params: { email: email.trim() }
              })
          }}
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
        {error ? (
          <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
        ) : null}
        <BlockButton
          label={pending ? 'Entrando…' : 'Acessar minha conta'}
          trailing={!pending}
          disabled={pending}
          onPress={submit}
          style={{ marginTop: 6 }}
        />
        <Text style={[text(12.5), { color: MUTED, textAlign: 'center' }]}>
          Ao entrar, você acessa o app Onside com sua conta.
        </Text>
        {turnstile.widget}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { height: 310, backgroundColor: '#2a2a25' },
  top: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  chip: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center'
  },
  // O conteúdo começa a 226 do topo, sobre o fim da foto.
  content: { marginTop: 226 - 310, paddingHorizontal: 20, gap: 16 },
  underline: { textDecorationLine: 'underline' }
})
