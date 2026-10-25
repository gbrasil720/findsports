import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { View } from 'react-native'
import { ErrorText, haptic } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  authErrorMessage,
  BackButton,
  BlockButton,
  Field,
  LIVE,
  phaseBusy,
  phaseLabel,
  Screen,
  SUB,
  Text,
  TextLink,
  Title,
  text
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
import { authClient, RESET_EMAIL_KEY } from '@/lib/auth-client'

/*
 * "Esqueci a senha" (11p do design). O link do e-mail abre o app em
 * `/reset-password?token=…`: o servidor redireciona para o `redirectTo`, que
 * aqui é o endereço do app (o cliente só converte `callbackURL`).
 */

export default function ForgotPassword() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string }>()
  const [email, setEmail] = useState(params.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const turnstile = useTurnstile()

  const submit = async () => {
    if (pending) return
    setError(null)
    if (!email.includes('@')) return setError('Confira o e-mail.')
    setPending(true)
    const result = await settleAuth(
      authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: Linking.createURL('/reset-password'),
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    setPending(false)
    setFailed(retryable(result.error))
    if (result.error) {
      setError(
        authErrorMessage(
          result.error,
          'Não foi possível enviar. Tente de novo.'
        )
      )
      return
    }
    haptic.success()
    await SecureStore.setItemAsync(RESET_EMAIL_KEY, email.trim())
    router.push({ pathname: '/reset-sent', params: { email: email.trim() } })
  }

  const phase = attemptPhase(pending, failed)

  return (
    <Screen gap={18} top={6}>
      <BackButton />
      <View style={{ gap: 10, marginTop: 10 }}>
        <Title lines={[['Esqueceu ', 'a senha?']]} size={46} />
        <Text style={[text(16, 'Regular', 1.45), { color: SUB }]}>
          Digite o e-mail da sua conta. Mandamos um link para você criar uma
          senha nova.
        </Text>
      </View>
      <Field
        label="E-mail"
        icon="mail"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        onSubmitEditing={submit}
      />
      {error ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
      ) : null}
      <BlockButton
        label={phaseLabel(phase, { idle: 'Enviar link', sending: 'Enviando…' })}
        busy={phaseBusy(phase)}
        onPress={submit}
      />
      <TextLink
        lead="Lembrou?"
        label="Entrar"
        underline
        onPress={() => router.back()}
      />
      {turnstile.widget}
    </Screen>
  )
}
