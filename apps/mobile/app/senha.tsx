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
  phaseBusy,
  phaseLabel,
  Screen,
  STONE,
  STRENGTH,
  StrengthBars,
  SUB,
  Text,
  Title,
  text
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
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
  // Falha passageira: o botão vira "Tentar de novo" (WEB-460) e a frase treme
  // de novo a cada falha, mesmo igual à anterior.
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const score = passwordScore(password)

  const submit = async () => {
    if (pending) return
    // Sem rede, a frase fica enquanto tenta de novo: o botão não pula.
    if (!failed) setError(null)
    if (!current) return setError('Digite a senha atual.')
    if (password.length < MIN_PASSWORD)
      return setError(`A senha precisa de ${MIN_PASSWORD} caracteres ou mais.`)
    setPending(true)
    const result = await settleAuth(
      authClient.changePassword({
        currentPassword: current,
        newPassword: password,
        revokeOtherSessions: true
      })
    )
    setPending(false)
    const transient = retryable(result.error)
    setFailed(transient)
    if (transient) setTries((n) => n + 1)
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

  const phase = attemptPhase(pending, failed)

  return (
    <Screen gap={16} top={6} sheet={{ onDone: submit, busy: pending }}>
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
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
      <BlockButton
        label={phaseLabel(phase, {
          idle: 'Salvar senha',
          sending: 'Salvando…'
        })}
        busy={phaseBusy(phase)}
        onPress={submit}
      />
    </Screen>
  )
}
