import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { CodeBoxes, DIGITS } from '@/components/code-boxes'
import { EASE, ErrorText, haptic, useShake } from '@/components/motion'
import {
  ACID,
  authErrorMessage,
  BackButton,
  BlockButton,
  Icon,
  LIVE,
  PAPER,
  phaseBusy,
  phaseLabel,
  Screen,
  Text,
  TextInput,
  Title,
  text
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

/*
 * "Duas etapas" do design, depois do login de quem ligou o autenticador
 * (`twoFactorRedirect`). Código do app autenticador ou de recuperação, com
 * "Confiar neste aparelho" (30 dias, `trustDevice` do better-auth).
 */

const BOX = '#1c1c18'

/** "Confiar neste aparelho": a bolinha desliza e o fundo acende. */
function Toggle({ on }: { on: boolean }) {
  const value = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    value.value = withTiming(on ? 1 : 0, { duration: 180, easing: EASE })
  }, [on, value])
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      value.value,
      [0, 1],
      ['rgba(241,238,230,.2)', ACID]
    )
  }))
  const knob = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(value.value, [0, 1], [PAPER, '#12120f']),
    transform: [{ translateX: value.value * 20 }]
  }))
  return (
    <Animated.View style={[styles.toggle, track]}>
      <Animated.View style={[styles.knob, knob]} />
    </Animated.View>
  )
}

export default function TwoFactor() {
  const router = useRouter()
  const input = useRef<TextInput>(null)
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState('')
  const [trust, setTrust] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const boxes = useShake()

  const verify = async (value = code) => {
    if (pending) return
    setError(null)
    setPending(true)
    const result = await settleAuth(
      backup
        ? authClient.twoFactor.verifyBackupCode({
            code: value.trim(),
            trustDevice: trust
          })
        : authClient.twoFactor.verifyTotp({
            code: value,
            trustDevice: trust
          })
    )
    setPending(false)
    const transient = retryable(result.error)
    setFailed(transient)
    if (result.error) {
      // Código recusado: as caixas tremem e esvaziam para o próximo. Sem
      // rede o código fica, para "Tentar de novo" mandar o mesmo.
      if (!transient) {
        boxes.shake()
        if (!backup) setCode('')
      }
      setError(
        authErrorMessage(
          result.error,
          'Não foi possível verificar. Tente de novo.'
        )
      )
      return
    }
    haptic.success()
    await queryClient.invalidateQueries()
    router.replace('/')
  }

  const onDigits = (digits: string) => {
    setCode(digits)
    if (digits.length === DIGITS && !pending) verify(digits)
  }

  const phase = attemptPhase(pending, failed)

  return (
    <Screen dark gap={18} top={2}>
      <BackButton tone="dark" />
      <Icon name="shield" size={52} color={PAPER} />
      <Title
        lines={[['Verificação em'], ['', 'duas etapas']]}
        size={38}
        color={PAPER}
        accentColor={ACID}
      />
      <Text
        style={[
          text(15.5, 'Regular', 1.45),
          { color: '#d6d3cb', marginTop: -6 }
        ]}
      >
        {backup
          ? 'Digite um dos códigos de recuperação que você guardou ao ligar a verificação.'
          : 'Digite o código de 6 dígitos que aparece no seu app autenticador.'}
      </Text>

      {backup ? (
        <TextInput
          accessibilityLabel="Código de recuperação"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          cursorColor={ACID}
          selectionColor={ACID}
          style={[
            styles.box,
            styles.backup,
            { borderColor: ACID, borderWidth: 2 }
          ]}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={() => verify()}
        />
      ) : (
        <CodeBoxes
          ref={input}
          code={code}
          onChange={onDigits}
          tone="dark"
          shake={boxes}
        />
      )}

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: trust }}
        onPress={() => {
          haptic.select()
          setTrust(!trust)
        }}
        style={styles.trust}
      >
        <View style={{ flex: 1 }}>
          <Text style={[text(14.5, 'Bold'), { color: PAPER }]}>
            Confiar neste aparelho
          </Text>
          <Text style={[text(12.5), { color: '#aaa9a4' }]}>
            Não pede o código por 30 dias
          </Text>
        </View>
        <Toggle on={trust} />
      </Pressable>

      {error ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
      ) : null}
      <BlockButton
        label={phaseLabel(phase, {
          idle: 'Verificar',
          sending: 'Verificando…'
        })}
        shadow="#000"
        busy={phaseBusy(phase)}
        onPress={() => (code ? verify() : input.current?.focus())}
      />
      <Text
        accessibilityRole="button"
        onPress={() => {
          setBackup(!backup)
          setCode('')
          setError(null)
          setFailed(false)
        }}
        suppressHighlighting
        style={[text(14, 'Bold'), styles.switch]}
      >
        {backup ? 'Usar o app autenticador' : 'Usar um código de recuperação'}
      </Text>
    </Screen>
  )
}

const styles = StyleSheet.create({
  box: {
    height: 60,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BOX,
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.14)'
  },
  backup: {
    paddingHorizontal: 16,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 20,
    color: PAPER
  },
  trust: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: BOX,
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.09)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  },
  toggle: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12 },
  switch: {
    color: PAPER,
    textAlign: 'center',
    textDecorationLine: 'underline'
  }
})
