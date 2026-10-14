import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  authErrorMessage,
  BackButton,
  BlockButton,
  Field,
  Icon,
  INK,
  LIVE,
  MIN_PASSWORD,
  MUTED,
  PASSWORD_RULES,
  passwordScore,
  Screen,
  STRENGTH,
  StrengthBars,
  Title,
  text
} from '@/components/ui'
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
  const turnstile = useTurnstile()
  const score = passwordScore(password)

  const submit = async () => {
    setError(null)
    if (!token) return
    if (password.length < MIN_PASSWORD)
      return setError(`A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`)
    if (password !== confirm) return setError('As senhas não são iguais.')
    setPending(true)
    const reset = await authClient.resetPassword({
      newPassword: password,
      token
    })
    if (reset.error) {
      setPending(false)
      setError(
        authErrorMessage(reset.error, 'Não foi possível salvar. Tente de novo.')
      )
      return
    }
    const email = await SecureStore.getItemAsync(RESET_EMAIL_KEY)
    await SecureStore.deleteItemAsync(RESET_EMAIL_KEY)
    if (!email) {
      router.replace({ pathname: '/sign-in', params: { notice: 'reset' } })
      return
    }
    const signIn = await authClient.signIn.email({
      email,
      password,
      fetchOptions: turnstile.fetchOptions
    })
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

  return (
    <Screen gap={16} top={6}>
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
        <StrengthBars score={score} empty="#e7e3db" />
        <Text style={text(12.5, 'Bold')}>{STRENGTH[score] || ' '}</Text>
      </View>
      <View style={styles.rules}>
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password)
          return (
            <View key={rule.label} style={styles.rule}>
              <View style={[styles.dot, met ? styles.dotOn : styles.dotOff]}>
                {met ? <Icon name="check" size={11} /> : null}
              </View>
              <Text style={[text(13.5), { color: met ? INK : MUTED }]}>
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
        <Text accessibilityRole="alert" style={[text(13.5), { color: LIVE }]}>
          {error}
        </Text>
      ) : null}
      <BlockButton
        label={pending ? 'Salvando…' : 'Salvar e entrar'}
        disabled={pending || !token}
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
    backgroundColor: '#faf8f3',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    shadowColor: INK,
    shadowOpacity: 0.09,
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
  dotOn: { backgroundColor: ACID },
  dotOff: { borderWidth: 1.5, borderColor: 'rgba(18,18,15,.25)' }
})
