import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useState } from 'react'
import { AuthField, AuthRule, AuthShell } from '@/components/auth-shell'
import { ErrorText, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { useTurnstile } from '@/components/turnstile'
import {
  authErrorMessage,
  LIVE,
  MIN_PASSWORD,
  PillButton,
  phaseBusy,
  phaseLabel,
  Text,
  text
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
  const palette = usePalette()
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

  // Rodada 8, tela 6: "3 de 3", dois campos com a regra marcando o ok e
  // "Salvar e entrar".
  return (
    <AuthShell
      title={['Nova', 'senha']}
      tall
      step="3 DE 3"
      footer={
        <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
          Os outros aparelhos saem da conta ao salvar.
        </Text>
      }
    >
      <AuthField
        label="Senha nova"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <AuthRule ok={password.length >= MIN_PASSWORD}>
        {`${MIN_PASSWORD} caracteres ou mais`}
      </AuthRule>
      <AuthField
        label="Repita a senha"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
        onSubmitEditing={submit}
      />
      <AuthRule ok={!!confirm && confirm === password}>
        As duas são iguais
      </AuthRule>
      {error ? (
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
      <PillButton
        label={phaseLabel(phase, {
          idle: 'Salvar e entrar',
          sending: 'Salvando…'
        })}
        busy={phaseBusy(phase)}
        disabled={!token}
        onPress={submit}
      />
      {turnstile.widget}
    </AuthShell>
  )
}
