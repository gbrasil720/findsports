import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { ErrorText, haptic } from '@/components/motion'
import {
  authErrorMessage,
  BackButton,
  BlockButton,
  FG,
  Field,
  LIVE,
  MIN_PASSWORD,
  passwordScore,
  Screen,
  STONE,
  STRENGTH,
  StrengthBars,
  SUB,
  Text,
  Title,
  text
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'

/*
 * "Senha · Alterar" das Configurações (11h): a atual e a nova, como no web.
 * Os outros aparelhos saem da conta junto.
 */

export default function ChangePassword() {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const score = passwordScore(password)

  const submit = async () => {
    setError(null)
    if (!current) return setError('Digite a senha atual.')
    if (password.length < MIN_PASSWORD)
      return setError(`A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`)
    setPending(true)
    const result = await authClient.changePassword({
      currentPassword: current,
      newPassword: password,
      revokeOtherSessions: true
    })
    setPending(false)
    if (result.error)
      return setError(
        result.error.code === 'INVALID_PASSWORD'
          ? 'A senha atual não confere.'
          : authErrorMessage(
              result.error,
              'Não foi possível salvar. Tente de novo.'
            )
      )
    haptic.success()
    router.back()
  }

  return (
    <Screen gap={16} top={6}>
      <BackButton />
      <Title lines={[['Alterar ', 'senha']]} size={44} />
      <Field
        label="Senha atual"
        icon="lock"
        action={{
          label: visible ? 'Ocultar' : 'Mostrar',
          onPress: () => setVisible(!visible)
        }}
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry={!visible}
        value={current}
        onChangeText={setCurrent}
      />
      <Field
        label="Nova senha"
        icon="lock"
        autoComplete="new-password"
        textContentType="newPassword"
        secureTextEntry={!visible}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />
      <View style={{ gap: 8, marginTop: -6 }}>
        <StrengthBars score={score} empty={STONE} />
        <Text style={[text(12.5, 'Bold'), { color: FG }]}>
          {STRENGTH[score] || ' '}
        </Text>
      </View>
      <Text style={[text(13.5, 'Regular', 1.4), { color: SUB }]}>
        Os outros aparelhos saem da conta e entram de novo com a senha nova.
      </Text>
      {error ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
      ) : null}
      <BlockButton
        label={pending ? 'Salvando…' : 'Salvar senha'}
        disabled={pending}
        onPress={submit}
      />
    </Screen>
  )
}
