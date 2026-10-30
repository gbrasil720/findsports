import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'
import { ErrorText, haptic, POP } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  authErrorMessage,
  BackButton,
  BlockButton,
  CARD,
  DROP,
  FG,
  Field,
  Icon,
  INK,
  LINE,
  LIVE,
  MIN_PASSWORD,
  PASSWORD_RULES,
  passwordScore,
  phaseBusy,
  phaseLabel,
  Screen,
  STONE,
  STRENGTH,
  StrengthBars,
  SUB,
  Text,
  Title,
  text,
  themed
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
import { authClient, RESET_EMAIL_KEY } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

/*
 * "Nova senha" do design. Abre pelo link do e-mail (`?token=…`; com
 * `?error=INVALID_TOKEN` se expirou ou já foi usado). "Salvar e entrar":
 * troca a senha e entra com o e-mail guardado ao pedir o link; sem ele
 * (pedido em outro aparelho), vai para o login.
 */

export default function ResetPassword() {
  const router = useRouter()
  const { token, error: linkError } = useLocalSearchParams<{
    token?: string
    error?: string
  }>()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(
    linkError || !token
      ? 'Este link expirou ou já foi usado. Peça outro em "Esqueci minha senha".'
      : null
  )
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  // Cada falha passageira treme a frase de novo, mesmo igual à anterior.
  const [tries, setTries] = useState(0)
  const turnstile = useTurnstile()
  const score = passwordScore(password)

  const submit = async () => {
    if (pending) return
    // Sem rede, a frase fica enquanto tenta de novo: o botão não pula.
    if (!failed) setError(null)
    if (!token) return
    if (password.length < MIN_PASSWORD)
      return setError(`A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`)
    if (password !== confirm) return setError('As senhas não são iguais.')
    setPending(true)
    const reset = await settleAuth(
      authClient.resetPassword({ newPassword: password, token })
    )
    const transient = retryable(reset.error)
    setFailed(transient)
    if (transient) setTries((n) => n + 1)
    if (reset.error) {
      setPending(false)
      setError(
        authErrorMessage(reset.error, 'Não foi possível salvar. Tente de novo.')
      )
      return
    }
    haptic.success()
    const email = await SecureStore.getItemAsync(RESET_EMAIL_KEY)
    await SecureStore.deleteItemAsync(RESET_EMAIL_KEY)
    if (!email) {
      router.replace({ pathname: '/sign-in', params: { notice: 'reset' } })
      return
    }
    // A senha já mudou: se a entrada falhar (até sem rede), o login pede de
    // novo com o aviso.
    const signIn = await settleAuth(
      authClient.signIn.email({
        email,
        password,
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    setPending(false)
    if (signIn.error) {
      router.replace({
        pathname: '/sign-in',
        params: { notice: 'reset', email }
      })
      return
    }
    if (signIn.data && 'twoFactorRedirect' in signIn.data) {
      router.replace('/two-factor')
      return
    }
    await queryClient.invalidateQueries()
    router.replace('/')
  }

  const phase = attemptPhase(pending, failed)

  return (
    <Screen brand gap={16} top={6}>
      <BackButton icon="close" onPress={() => router.dismissTo('/sign-in')} />
      <Title lines={[['Crie uma ', 'senha nova']]} size={44} />
      <Field
        label="Nova senha"
        icon="lock"
        action={{
          label: visible ? 'Ocultar' : 'Mostrar',
          onPress: () => setVisible(!visible)
        }}
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry={!visible}
        value={password}
        onChangeText={setPassword}
      />
      <View style={{ gap: 8, marginTop: -6 }}>
        <StrengthBars score={score} empty={STONE} />
        <Text style={[text(12.5, 'Bold'), { color: FG }]}>
          {STRENGTH[score] || ' '}
        </Text>
      </View>
      <View style={styles.rules}>
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password)
          return (
            <View key={rule.label} style={styles.rule}>
              <View style={[styles.dot, styles.dotOff]}>
                {met ? (
                  <Animated.View
                    entering={POP}
                    exiting={FadeOut.duration(120)}
                    style={[styles.dot, styles.dotOn]}
                  >
                    <Icon name="check" size={11} color={INK} accent={LIVE} />
                  </Animated.View>
                ) : null}
              </View>
              <Text style={[text(13.5), { color: met ? FG : SUB }]}>
                {rule.label}
              </Text>
            </View>
          )
        })}
      </View>
      <Field
        label="Confirmar senha"
        icon="lock"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry={!visible}
        value={confirm}
        onChangeText={setConfirm}
        onSubmitEditing={submit}
      />
      {error ? (
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
      <BlockButton
        label={phaseLabel(phase, {
          idle: 'Salvar e entrar',
          sending: 'Salvando…'
        })}
        busy={phaseBusy(phase)}
        disabled={!token}
        onPress={submit}
      />
      {turnstile.widget}
    </Screen>
  )
}

const styles = StyleSheet.create({
  rules: {
    padding: 14,
    borderRadius: 6,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    shadowColor: DROP,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  },
  rule: { width: '50%', flexDirection: 'row', gap: 8, alignItems: 'center' },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // A bolinha cheia cobre o anel por inteiro.
  dotOn: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    backgroundColor: ACID
  },
  dotOff: {
    borderWidth: 1.5,
    borderColor: themed('rgba(18,18,15,.25)', 'rgba(241,238,230,.3)')
  }
})
