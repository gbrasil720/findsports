import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { AuthField, AuthLink, AuthShell } from '@/components/auth-shell'
import { ErrorText, haptic } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  authErrorMessage,
  FG,
  LIVE,
  PillButton,
  phaseBusy,
  phaseLabel,
  Text,
  text
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

/*
 * "Login · v2" do design. Quem tem verificação em duas etapas segue para
 * `/two-factor`; quem não confirmou o e-mail vai para `/verify-email`.
 */

const NOTICES: Record<string, string> = {
  expired: 'O link de confirmação expirou. Entre para receber outro.',
  reset: 'Senha nova salva. Entre com ela.'
}

export default function SignIn() {
  const router = useRouter()
  const params = useLocalSearchParams<{ email?: string; notice?: string }>()
  const [email, setEmail] = useState(params.email ?? '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // A última tentativa falhou de forma passageira: o botão vira "Tentar de
  // novo" (WEB-460).
  const [failed, setFailed] = useState(false)
  // Cada falha passageira treme a frase de novo, mesmo igual à anterior.
  const [tries, setTries] = useState(0)
  const turnstile = useTurnstile()
  const notice = params.notice ? NOTICES[params.notice] : undefined
  const submit = async () => {
    if (pending) return
    // Sem rede, a frase fica enquanto tenta de novo: o botão não pula.
    if (!failed) setError(null)
    setPending(true)
    const result = await settleAuth(
      authClient.signIn.email({
        email: email.trim(),
        password,
        // Sem `callbackURL`: com ele o servidor responde "redirecionar" e o
        // plugin do Expo abre a janela de login social do iOS ("deseja usar
        // ... para iniciar sessão"). O e-mail de confirmação que o login
        // reenvia a quem não confirmou leva ao site; o "Reenviar" da tela de
        // confirmação manda o que volta para o app.
        fetchOptions: turnstile.fetchOptions
      })
    )
    // O token do Turnstile vale uma vez: com erro ou não, pede outro.
    turnstile.reset()
    setPending(false)
    const transient = retryable(result.error)
    setFailed(transient)
    if (transient) setTries((n) => n + 1)
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

  const phase = attemptPhase(pending, failed)

  // Rodada 8, tela 4: "De volta ao jogo" no topo de tinta e o formulário no
  // papel. "Continuar com a Apple" do desenho espera a conta de
  // desenvolvedor (pendência anotada).
  return (
    <AuthShell
      title={['De volta', 'ao jogo']}
      footer={
        <AuthLink
          center
          lead="Não tem conta?"
          label="Criar conta grátis"
          onPress={() => router.push('/sign-up')}
        />
      }
    >
      {notice ? (
        <Text
          accessibilityRole="alert"
          style={[text(14, 'SemiBold', 1.4), { color: FG }]}
        >
          {notice}
        </Text>
      ) : null}
      <AuthField
        label="E-mail"
        placeholder="voce@email.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <AuthField
        label="Senha"
        placeholder="Sua senha"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <AuthLink
        label="Esqueci minha senha"
        onPress={() =>
          router.push({
            pathname: '/forgot-password',
            params: { email: email.trim() }
          })
        }
      />
      {error ? (
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
      <PillButton
        label={phaseLabel(phase, { idle: 'Entrar', sending: 'Entrando…' })}
        busy={phaseBusy(phase)}
        onPress={submit}
      />
      {turnstile.widget}
    </AuthShell>
  )
}
