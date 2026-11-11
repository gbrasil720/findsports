import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import {
  AccountField,
  AccountNote,
  AccountPage,
  StrengthRule
} from '@/components/account-page'
import { ErrorText, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  authErrorMessage,
  Icon,
  LIVE,
  MIN_PASSWORD,
  PillButton,
  passwordScore,
  phaseBusy,
  phaseLabel,
  Text,
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
  const palette = usePalette()
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return result.data ?? []
    },
    retry: false
  })
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

  // Rodada 8, tela 6b: a régua de força e as regras viram check enquanto
  // digita; antes do botão, quantos aparelhos saem (o changePassword derruba
  // as outras sessões).
  const others = (sessions.data?.length ?? 1) - 1
  return (
    <AccountPage
      title="Trocar a "
      accent="senha"
      cta={
        <>
          <PillButton
            label={phaseLabel(phase, {
              idle: 'Trocar a senha',
              sending: 'Trocando…'
            })}
            busy={phaseBusy(phase)}
            onPress={submit}
          />
          <Text
            accessibilityRole="link"
            onPress={() => router.push('/forgot-password')}
            suppressHighlighting
            style={[
              text(14, 'SemiBold', 1.3),
              styles.forgot,
              { color: palette.ink }
            ]}
          >
            Esqueci a senha atual
          </Text>
        </>
      }
    >
      <AccountField
        label="Senha atual"
        autoComplete="current-password"
        textContentType="password"
        secureTextEntry
        value={current}
        onChangeText={setCurrent}
      />
      <View style={{ gap: 8 }}>
        <AccountField
          label="Nova senha"
          autoComplete="new-password"
          textContentType="newPassword"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />
        <StrengthRule score={score} />
        <View style={{ gap: 5 }}>
          <Rule ok={password.length >= MIN_PASSWORD}>
            {`${MIN_PASSWORD} caracteres ou mais`}
          </Rule>
          <Rule ok={!!password && password !== current}>
            diferente da atual
          </Rule>
          <Rule ok={/\d/.test(password)} hint>
            um número deixa mais forte
          </Rule>
        </View>
      </View>
      <AccountNote icon="you">
        {others > 0 ? (
          <>
            Os outros{' '}
            <Text style={text(13, 'Bold', 1.45)}>
              {others} {others === 1 ? 'aparelho' : 'aparelhos'}
            </Text>{' '}
            saem da conta. Este continua conectado.
          </>
        ) : (
          'Se a conta estiver aberta em outro aparelho, ele sai. Este continua conectado.'
        )}
      </AccountNote>
      {error ? (
        <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
          {error}
        </ErrorText>
      ) : null}
    </AccountPage>
  )
}

/** Uma regra da senha: vira check quando vale; a dica fica com o "+". */
function Rule({
  ok,
  hint,
  children
}: {
  ok: boolean
  hint?: boolean
  children: string
}) {
  const palette = usePalette()
  return (
    <View style={styles.rule}>
      <Icon
        name={ok ? 'check' : hint ? 'plus' : 'check'}
        size={14}
        color={ok ? palette.ink : palette.muted}
      />
      <Text
        style={[
          text(12.5, 'Regular', 1.3),
          { color: ok ? palette.ink : palette.muted }
        ]}
      >
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  forgot: {
    alignSelf: 'center',
    textDecorationLine: 'underline'
  }
})
