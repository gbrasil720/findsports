import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { AuthField, AuthLink, AuthShell } from '@/components/auth-shell'
import { ErrorText, haptic, SWAP } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  authErrorMessage,
  Icon,
  LIVE,
  openMailApp,
  PillButton,
  phaseBusy,
  phaseLabel,
  Text,
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
  // Cada falha passageira treme a frase de novo, mesmo igual à anterior.
  const [tries, setTries] = useState(0)
  const [sent, setSent] = useState(false)
  const palette = usePalette()
  const turnstile = useTurnstile()

  const submit = async () => {
    if (pending) return
    // Sem rede, a frase fica enquanto tenta de novo: o botão não pula.
    if (!failed) setError(null)
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
    const transient = retryable(result.error)
    setFailed(transient)
    if (transient) setTries((n) => n + 1)
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
    // Rodada 8: o "Link enviado" aparece na mesma tela, abaixo do campo.
    setSent(true)
  }

  const phase = attemptPhase(pending, failed)

  // Rodada 8, tela 6: "1 de 3" no topo, o campo e, enviado, o cartão acid
  // com uma frase só (vale 30 min, nada se perde) e "Abrir o Mail".
  return (
    <AuthShell
      title={['Esqueceu', 'a senha?']}
      tall
      step="1 DE 3"
      footer={
        <AuthLink
          center
          label="Voltar para entrar"
          onPress={() => router.back()}
        />
      }
    >
      <AuthField
        label="E-mail da conta"
        placeholder="voce@email.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={(next) => {
          setEmail(next)
          setSent(false)
        }}
        onSubmitEditing={submit}
      />
      {error ? (
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
      {sent ? (
        <Animated.View
          entering={SWAP}
          style={[
            styles.sent,
            {
              backgroundColor: palette.card,
              borderColor: palette.dark ? ACID : '#c9f135'
            }
          ]}
        >
          <Icon name="mail" size={20} color={palette.ink} accent={LIVE} />
          <View style={{ flex: 1 }}>
            <Text style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}>
              Link enviado
            </Text>
            <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
              Vale por 30 minutos. Seus jogos e medalhas continuam na conta.
            </Text>
          </View>
        </Animated.View>
      ) : null}
      {sent ? (
        <PillButton
          label="Abrir o Mail"
          leading="mail"
          onPress={() => openMailApp('Mail', 'message://')}
        />
      ) : (
        <PillButton
          label={phaseLabel(phase, {
            idle: 'Enviar link',
            sending: 'Enviando…'
          })}
          busy={phaseBusy(phase)}
          onPress={submit}
        />
      )}
      {turnstile.widget}
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  sent: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 2.5
  }
})
