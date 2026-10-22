import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Linking,
  Share,
  StyleSheet,
  Text,
  type TextInput,
  View
} from 'react-native'
import QRCode from 'react-qr-code'
import { CodeBoxes, DIGITS } from '@/components/code-boxes'
import { ErrorText, haptic, useShake } from '@/components/motion'
import {
  authErrorMessage,
  BackButton,
  BlockButton,
  CARD,
  Checkbox,
  DROP,
  FG,
  Field,
  INK,
  LINE,
  LIVE,
  Screen,
  SUB,
  TextLink,
  Title,
  text
} from '@/components/ui'
import { authClient, refreshSession } from '@/lib/auth-client'
import { totpSecret } from '@/lib/settings'
import { queryClient } from '@/lib/trpc'

/*
 * Verificação em duas etapas, pela linha de Segurança das Configurações
 * (11h). O design só desenha a linha ("Ativa") e o login com código (11s);
 * o fluxo segue o estilo das telas de conta e o do web
 * (`two-factor-settings.tsx`): senha, a chave no app autenticador, o código
 * de 6 dígitos e os códigos de recuperação. Ligada, a tela desliga com a
 * senha. No celular o autenticador costuma estar no mesmo aparelho, então
 * "Abrir no app autenticador" vem antes do QR (que serve a outro aparelho).
 */

type Step = 'password' | 'key' | 'codes'

export default function TwoFactorSetup() {
  const router = useRouter()
  const session = authClient.useSession()
  // Lida uma vez: ao concluir, a sessão já diz "ligada" e a tela ainda
  // mostra os códigos de recuperação.
  const [enabled] = useState(session.data?.user.twoFactorEnabled === true)
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [uri, setUri] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const input = useRef<TextInput>(null)
  const boxes = useShake()
  // "Copiado" no lugar do link por um instante: o háptico sozinho não basta.
  const [copied, setCopied] = useState<'key' | 'codes' | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copy = async (what: 'key' | 'codes', value: string) => {
    await Clipboard.setStringAsync(value)
    haptic.select()
    setCopied(what)
    clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(null), 1500)
  }

  const begin = async () => {
    setError(null)
    if (!password) return setError('Digite sua senha.')
    setPending(true)
    const result = enabled
      ? await authClient.twoFactor.disable({ password })
      : await authClient.twoFactor.enable({ password })
    setPending(false)
    if (result.error || !result.data)
      return setError(
        result.error?.code === 'INVALID_PASSWORD'
          ? 'A senha não confere.'
          : authErrorMessage(result.error, 'Não foi possível. Tente de novo.')
      )
    if (enabled) {
      haptic.success()
      await refreshSession()
      queryClient.invalidateQueries({ queryKey: ['account-sessions'] })
      return router.back()
    }
    const data = result.data as { totpURI: string; backupCodes: string[] }
    setUri(data.totpURI)
    setBackupCodes(data.backupCodes)
    setStep('key')
  }

  const verify = async (value: string) => {
    setError(null)
    setPending(true)
    const result = await authClient.twoFactor.verifyTotp({
      code: value,
      trustDevice: true
    })
    setPending(false)
    if (result.error) {
      boxes.shake()
      setCode('')
      return setError(
        authErrorMessage(result.error, 'Código inválido. Use o código atual.')
      )
    }
    haptic.success()
    await refreshSession()
    // Ligar troca a sessão: a lista de aparelhos da Conta fica velha.
    queryClient.invalidateQueries({ queryKey: ['account-sessions'] })
    setStep('codes')
  }

  const onDigits = (digits: string) => {
    setCode(digits)
    if (digits.length === DIGITS && !pending) verify(digits)
  }

  const secret = totpSecret(uri)
  const codesText = backupCodes.join('\n')

  if (enabled)
    return (
      <Screen key="off" gap={16} top={6}>
        <BackButton />
        <Title lines={[['Desligar a'], ['', 'verificação']]} size={40} />
        <Text style={[text(15, 'Regular', 1.45), { color: SUB }]}>
          A verificação em duas etapas está ligada. Desligada, a conta volta a
          entrar só com a senha.
        </Text>
        <Field
          label="Senha"
          icon="lock"
          action={{
            label: visible ? 'Ocultar' : 'Mostrar',
            onPress: () => setVisible(!visible)
          }}
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry={!visible}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={begin}
        />
        {error ? (
          <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
        ) : null}
        <BlockButton
          label={pending ? 'Desligando…' : 'Desligar a verificação'}
          disabled={pending}
          onPress={begin}
        />
      </Screen>
    )

  if (step === 'password')
    return (
      <Screen key={step} gap={16} top={6}>
        <BackButton />
        <Title lines={[['Verificação em'], ['', 'duas etapas']]} size={40} />
        <Text style={[text(15, 'Regular', 1.45), { color: SUB }]}>
          Além da senha, a Onside vai pedir um código do seu app autenticador ao
          entrar. Confirme a senha para começar.
        </Text>
        <Field
          label="Senha"
          icon="lock"
          action={{
            label: visible ? 'Ocultar' : 'Mostrar',
            onPress: () => setVisible(!visible)
          }}
          autoComplete="current-password"
          textContentType="password"
          secureTextEntry={!visible}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={begin}
        />
        {error ? (
          <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
        ) : null}
        <BlockButton
          label={pending ? 'Conferindo…' : 'Continuar'}
          trailing={!pending}
          disabled={pending}
          onPress={begin}
        />
      </Screen>
    )

  if (step === 'key')
    return (
      <Screen key={step} gap={16} top={6}>
        <BackButton />
        <Title lines={[['Adicione no'], ['', 'autenticador']]} size={40} />
        <Text style={[text(15, 'Regular', 1.45), { color: SUB }]}>
          Use um app como Senhas do iPhone, Google Authenticator ou 1Password.
          Depois digite o código de 6 dígitos que ele mostrar.
        </Text>
        <BlockButton
          label="Abrir no app autenticador"
          onPress={() =>
            Linking.openURL(uri).catch(() =>
              setError(
                'Nenhum app autenticador abriu. Copie a chave ou use o QR em outro aparelho.'
              )
            )
          }
        />
        <View style={styles.card}>
          <View style={styles.qr}>
            <QRCode value={uri} size={112} bgColor="#ffffff" fgColor={INK} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[text(12.5, 'SemiBold'), { color: SUB }]}>Chave</Text>
            <Text selectable style={[styles.secret, { color: FG }]}>
              {secret}
            </Text>
            <Text
              accessibilityRole="button"
              suppressHighlighting
              onPress={() => copy('key', secret.replace(/\s/g, ''))}
              style={[
                text(14, 'Bold'),
                { color: FG, textDecorationLine: 'underline' }
              ]}
            >
              {copied === 'key' ? 'Chave copiada' : 'Copiar a chave'}
            </Text>
          </View>
        </View>
        <Text style={[text(13, 'SemiBold'), { color: FG, marginBottom: -6 }]}>
          Código do app
        </Text>
        <CodeBoxes
          ref={input}
          code={code}
          onChange={onDigits}
          tone="theme"
          shake={boxes}
          autoFocus={false}
        />
        {error ? (
          <ErrorText style={[text(13.5), { color: LIVE }]}>{error}</ErrorText>
        ) : null}
        <BlockButton
          label={pending ? 'Verificando…' : 'Ligar a verificação'}
          disabled={pending}
          onPress={() =>
            code.length === DIGITS ? verify(code) : input.current?.focus()
          }
        />
      </Screen>
    )

  return (
    <Screen key={step} gap={16} top={6}>
      <Title lines={[['Guarde os'], ['', 'códigos']]} size={40} />
      <Text style={[text(15, 'Regular', 1.45), { color: SUB }]}>
        A verificação está ligada. Se perder o celular, cada código abaixo entra
        na conta uma vez no lugar do app autenticador.
      </Text>
      <View style={[styles.card, styles.codes]}>
        {backupCodes.map((item) => (
          <Text key={item} selectable style={[styles.code, { color: FG }]}>
            {item}
          </Text>
        ))}
      </View>
      <View style={styles.actions}>
        {/* A largura de "Copiados" fica reservada: a troca não empurra
            "Compartilhar". */}
        <View>
          <View
            style={{ opacity: 0 }}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <TextLink label="Copiados" underline onPress={() => {}} />
          </View>
          <View style={StyleSheet.absoluteFill}>
            <TextLink
              label={copied === 'codes' ? 'Copiados' : 'Copiar'}
              underline
              onPress={() => copy('codes', codesText)}
            />
          </View>
        </View>
        <TextLink
          label="Compartilhar"
          underline
          onPress={() =>
            Share.share({
              message: `Códigos de recuperação da Onside:\n${codesText}`
            })
          }
        />
      </View>
      <Checkbox checked={saved} onChange={setSaved}>
        <Text style={[text(14, 'Regular', 1.4), { color: FG }]}>
          Guardei os códigos num lugar seguro.
        </Text>
      </Checkbox>
      <BlockButton
        label="Concluir"
        disabled={!saved}
        onPress={() => router.back()}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    borderRadius: 6,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: DROP,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  },
  qr: { padding: 6, borderRadius: 6, backgroundColor: '#ffffff' },
  secret: { fontFamily: 'GeistMono-SemiBold', fontSize: 15, lineHeight: 22 },
  codes: { flexWrap: 'wrap', rowGap: 10, columnGap: 0 },
  code: {
    width: '50%',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 16,
    letterSpacing: 0.5
  },
  actions: { flexDirection: 'row', gap: 22, justifyContent: 'center' }
})
