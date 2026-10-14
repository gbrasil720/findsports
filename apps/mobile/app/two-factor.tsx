import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  ACID,
  authErrorMessage,
  BackButton,
  BlockButton,
  Icon,
  LIVE,
  PAPER,
  Screen,
  Title,
  text
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { queryClient } from '@/lib/trpc'

/*
 * "Duas etapas" do design, depois do login de quem ligou o autenticador
 * (`twoFactorRedirect`). Código do app autenticador ou de recuperação, com
 * "Confiar neste aparelho" (30 dias, `trustDevice` do better-auth).
 */

const DIGITS = 6
const BOX = '#1c1c18'

export default function TwoFactor() {
  const router = useRouter()
  const input = useRef<TextInput>(null)
  const [backup, setBackup] = useState(false)
  const [code, setCode] = useState('')
  const [trust, setTrust] = useState(true)
  const [focused, setFocused] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const verify = async (value = code) => {
    setError(null)
    setPending(true)
    const result = backup
      ? await authClient.twoFactor.verifyBackupCode({
          code: value.trim(),
          trustDevice: trust
        })
      : await authClient.twoFactor.verifyTotp({
          code: value,
          trustDevice: trust
        })
    setPending(false)
    if (result.error) {
      setError(
        authErrorMessage(
          result.error,
          'Não foi possível verificar. Tente de novo.'
        )
      )
      return
    }
    await queryClient.invalidateQueries()
    router.replace('/')
  }

  const onDigits = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, DIGITS)
    setCode(digits)
    if (digits.length === DIGITS && !pending) verify(digits)
  }

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
        <Pressable
          accessibilityLabel="Código de 6 dígitos"
          onPress={() => input.current?.focus()}
          style={styles.boxes}
        >
          {Array.from({ length: DIGITS }, (_, index) => {
            const active =
              focused && index === Math.min(code.length, DIGITS - 1)
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa
              <View key={index} style={{ flex: 1 }}>
                <View
                  style={[
                    styles.shadow,
                    active && { backgroundColor: 'rgba(201,241,53,.3)' }
                  ]}
                />
                <View style={[styles.box, active && styles.boxActive]}>
                  {code[index] ? (
                    <Text style={styles.digit}>{code[index]}</Text>
                  ) : active ? (
                    <View style={styles.caret} />
                  ) : null}
                </View>
              </View>
            )
          })}
          <TextInput
            ref={input}
            autoFocus
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={DIGITS}
            value={code}
            onChangeText={onDigits}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            caretHidden
            style={styles.hidden}
          />
        </Pressable>
      )}

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: trust }}
        onPress={() => setTrust(!trust)}
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
        <View
          style={[styles.toggle, trust ? styles.toggleOn : styles.toggleOff]}
        >
          <View
            style={[
              styles.knob,
              { backgroundColor: trust ? '#12120f' : PAPER }
            ]}
          />
        </View>
      </Pressable>

      {error ? (
        <Text accessibilityRole="alert" style={[text(13.5), { color: LIVE }]}>
          {error}
        </Text>
      ) : null}
      <BlockButton
        label={pending ? 'Verificando…' : 'Verificar'}
        shadow="#000"
        disabled={pending}
        onPress={() => (code ? verify() : input.current?.focus())}
      />
      <Text
        accessibilityRole="button"
        onPress={() => {
          setBackup(!backup)
          setCode('')
          setError(null)
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
  boxes: { flexDirection: 'row', gap: 8 },
  box: {
    height: 60,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BOX,
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.14)'
  },
  boxActive: { borderWidth: 2, borderColor: ACID },
  shadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    borderRadius: 6,
    backgroundColor: '#000'
  },
  digit: { fontFamily: 'GeistMono-SemiBold', fontSize: 26, color: PAPER },
  caret: { width: 2, height: 26, backgroundColor: ACID },
  // O teclado digita aqui; as caixas só mostram.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
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
  toggleOn: { backgroundColor: ACID, alignItems: 'flex-end' },
  toggleOff: {
    backgroundColor: 'rgba(241,238,230,.2)',
    alignItems: 'flex-start'
  },
  knob: { width: 24, height: 24, borderRadius: 12 },
  switch: {
    color: PAPER,
    textAlign: 'center',
    textDecorationLine: 'underline'
  }
})
