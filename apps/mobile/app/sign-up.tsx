import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { ErrorText, haptic } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  authErrorMessage,
  BackButton,
  BlockButton,
  Checkbox,
  FG,
  Field,
  Icon,
  LIVE,
  MIN_PASSWORD,
  passwordScore,
  Screen,
  STONE,
  StrengthBars,
  SUB,
  Text,
  TextLink,
  Title,
  text
} from '@/components/ui'
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
  const turnstile = useTurnstile()

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Diga seu nome.')
    if (!email.includes('@')) return setError('Confira o e-mail.')
    if (password.length < MIN_PASSWORD)
      return setError(`A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`)
    setPending(true)
    const result = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      role,
      callbackURL: '/verified',
      fetchOptions: turnstile.fetchOptions
    })
    // O token do Turnstile vale uma vez: com erro ou não, pede outro.
    turnstile.reset()
    setPending(false)
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

  return (
    <Screen gap={15}>
      <View style={styles.top}>
        <BackButton />
        <TextLink
          lead="Já tem conta?"
          label="Entrar"
          onPress={() => router.dismissTo('/sign-in')}
        />
      </View>
      <View style={styles.tag}>
        <Icon name={role === 'pub' ? 'bar' : 'fan'} size={11} />
        <Text style={[text(10.5, 'Bold', 1.2), { color: FG }]}>
          {role === 'pub' ? 'Conta de bar' : 'Conta de torcedor'}
        </Text>
      </View>
      <Title lines={[['Crie sua conta ', 'grátis.']]} size={40} />
      <Field
        label="Nome"
        icon="person"
        autoComplete="name"
        textContentType="name"
        value={name}
        onChangeText={setName}
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <View style={{ marginTop: -6 }}>
        <StrengthBars score={passwordScore(password)} />
      </View>
      <Checkbox checked={accepted} onChange={setAccepted}>
        <Text style={[text(13.5), { color: SUB }]}>
          Li e aceito os{' '}
          <Text
            style={styles.link}
            onPress={() =>
              router.push({ pathname: '/legal', params: { doc: 'termos' } })
            }
          >
            Termos de Uso
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
            Política de Privacidade
          </Text>
          .
        </Text>
      </Checkbox>
      {error ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
      ) : null}
      <BlockButton
        label={pending ? 'Criando…' : 'Criar conta grátis'}
        disabled={pending || !accepted}
        onPress={submit}
      />
      {turnstile.widget}
    </Screen>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: STONE
  },
  link: { textDecorationLine: 'underline' }
})
