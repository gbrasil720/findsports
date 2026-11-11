import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { AuthField, AuthRule, AuthShell } from '@/components/auth-shell'
import { FanCard } from '@/components/fan-card'
import { ErrorText, haptic } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  authErrorMessage,
  Checkbox,
  LIVE,
  MIN_PASSWORD,
  PillButton,
  phaseBusy,
  phaseLabel,
  SUB,
  Text,
  text
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'

/*
 * "Criar conta" (4g do design). O papel vem do perfil de uso. Depois do
 * cadastro o servidor manda o e-mail de confirmação; o link volta para o app
 * em `/verified`, que adota a sessão (ver `lib/auth-client.ts`).
 */

export default function SignUp() {
  const router = useRouter()
  const params = useLocalSearchParams<{ role?: string }>()
  const role = params.role === 'pub' ? 'pub' : 'fan'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  // Cada falha passageira treme a frase de novo, mesmo igual à anterior.
  const [tries, setTries] = useState(0)
  const turnstile = useTurnstile()

  const submit = async () => {
    // Sem rede, a frase fica enquanto tenta de novo: o botão não pula.
    if (!failed) setError(null)
    if (!accepted)
      return setError('Aceite os Termos e a Privacidade para continuar.')
    if (!name.trim()) return setError('Diga seu nome.')
    if (!email.includes('@')) return setError('Confira o e-mail.')
    if (password.length < MIN_PASSWORD)
      return setError(`A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`)
    setPending(true)
    const result = await settleAuth(
      authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        callbackURL: '/verified',
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
      setError(
        authErrorMessage(
          result.error,
          'Não foi possível criar sua conta. Tente de novo.'
        )
      )
      return
    }
    haptic.success()
    router.push({ pathname: '/verify-email', params: { email: email.trim() } })
  }

  const phase = attemptPhase(pending, failed)

  // Rodada 8, tela 4: "Crie sua carteirinha", com a carteirinha da pessoa
  // por trás do formulário (a única peça de apoio): o nome se preenche
  // enquanto ela digita. Não pergunta torcedor ou bar aqui; o dono chega pelo
  // caminho do bar (`role=pub`).
  return (
    <AuthShell
      title={['Crie sua', 'carteirinha']}
      art={
        <View style={styles.peek} pointerEvents="none">
          <FanCard
            name={name.trim() || 'Seu nome'}
            teams={[]}
            sports={[]}
            radius={null}
            base={null}
          />
        </View>
      }
    >
      <AuthField
        label="Nome"
        placeholder="Como você aparece na Onside"
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
      />
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
        placeholder={`${MIN_PASSWORD} caracteres ou mais`}
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <AuthRule ok={password.length >= MIN_PASSWORD}>
        {`${MIN_PASSWORD} caracteres ou mais`}
      </AuthRule>
      {/* O aceite continua explícito (o toque marca), na linha do desenho. */}
      <Checkbox checked={accepted} onChange={setAccepted}>
        <Text style={[text(12.5, 'Regular', 1.4), { color: SUB }]}>
          Aceito os{' '}
          <Text
            style={styles.link}
            onPress={() =>
              router.push({ pathname: '/legal', params: { doc: 'termos' } })
            }
          >
            Termos
          </Text>{' '}
          e a{' '}
          <Text
            style={styles.link}
            onPress={() =>
              router.push({
                pathname: '/legal',
                params: { doc: 'privacidade' }
              })
            }
          >
            Privacidade
          </Text>{' '}
          · Já tem conta?{' '}
          <Text
            style={styles.link}
            onPress={() => router.dismissTo('/sign-in')}
          >
            Entrar
          </Text>
        </Text>
      </Checkbox>
      {error ? (
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
      <PillButton
        label={phaseLabel(phase, {
          idle: 'Criar conta grátis',
          sending: 'Criando…'
        })}
        busy={phaseBusy(phase)}
        onPress={submit}
      />
      {turnstile.widget}
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  // A carteirinha aparece atrás do papel: só o topo dela fica à vista.
  peek: {
    height: 96,
    marginBottom: -50,
    transform: [{ rotate: '-2deg' }]
  },
  link: { textDecorationLine: 'underline', fontFamily: 'Archivo-Bold' }
})
