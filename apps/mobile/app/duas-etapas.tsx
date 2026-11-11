import * as Clipboard from 'expo-clipboard'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Linking,
  Pressable,
  Share,
  StyleSheet,
  type TextInput,
  View
} from 'react-native'
import QRCode from 'react-qr-code'
import {
  AccountField,
  AccountNote,
  AccountPage
} from '@/components/account-page'
import { CodeBoxes, DIGITS } from '@/components/code-boxes'
import { DotField } from '@/components/fan-card'
import { ErrorText, haptic, useShake } from '@/components/motion'
import { INK_ON_DARK, usePalette } from '@/components/theme'
import {
  authErrorMessage,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  phaseBusy,
  phaseLabel,
  Text,
  text
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
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
  const palette = usePalette()
  const [uri, setUri] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // Falha passageira: o botão vira "Tentar de novo" (WEB-460) e a frase treme
  // de novo a cada falha, mesmo igual à anterior.
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const phase = attemptPhase(pending, failed)
  const errorText = error ? (
    <ErrorText key={`erro-${tries}`} style={[text(13.5), { color: LIVE }]}>
      {error}
    </ErrorText>
  ) : null
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
  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  /** O fim de cada envio: a falha passageira deixa "Tentar de novo". */
  const afterAttempt = (result: { error: unknown }) => {
    setPending(false)
    const transient = retryable(result.error)
    setFailed(transient)
    if (transient) setTries((n) => n + 1)
    return transient
  }

  const begin = async () => {
    if (pending) return
    // Sem rede, a frase fica enquanto tenta de novo: o botão não pula.
    if (!failed) setError(null)
    if (!password) return setError('Digite sua senha.')
    setPending(true)
    const result = enabled
      ? await settleAuth(authClient.twoFactor.disable({ password }))
      : await settleAuth(authClient.twoFactor.enable({ password }))
    afterAttempt(result)
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
    if (pending) return
    if (!failed) setError(null)
    setPending(true)
    const result = await settleAuth(
      authClient.twoFactor.verifyTotp({ code: value, trustDevice: true })
    )
    const transient = afterAttempt(result)
    if (result.error) {
      // Código recusado: as caixas tremem e esvaziam. Sem rede o código
      // fica, para "Tentar de novo" mandar o mesmo.
      if (!transient) {
        boxes.shake()
        setCode('')
      }
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

  const passwordField = (
    <AccountField
      label="Senha"
      autoComplete="current-password"
      textContentType="password"
      secureTextEntry
      value={password}
      onChangeText={setPassword}
      onSubmitEditing={begin}
    />
  )

  // Rodada 8, tela 6b: três passos (senha, autenticador, códigos) no topo;
  // número vira check ao concluir.
  if (enabled)
    return (
      <AccountPage
        key="off"
        title="Desligar as "
        accent="duas etapas"
        cta={
          <PillButton
            label={phaseLabel(phase, {
              idle: 'Desligar',
              sending: 'Desligando…'
            })}
            busy={phaseBusy(phase)}
            onPress={begin}
          />
        }
      >
        <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
          Desligadas, a conta volta a entrar só com a senha. Confirme a senha
          para desligar.
        </Text>
        {passwordField}
        {errorText}
      </AccountPage>
    )

  if (step === 'password')
    return (
      <AccountPage
        key={step}
        title="Ligue as "
        accent="duas etapas"
        steps={{ current: 1, total: 3 }}
        cta={
          <PillButton
            label={phaseLabel(phase, {
              idle: 'Continuar',
              sending: 'Conferindo…'
            })}
            busy={phaseBusy(phase)}
            onPress={begin}
          />
        }
      >
        <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
          Além da senha, a Onside vai pedir um código do seu app autenticador ao
          entrar. Confirme a senha para começar.
        </Text>
        {passwordField}
        {errorText}
      </AccountPage>
    )

  if (step === 'key')
    return (
      <AccountPage
        key={step}
        title="Ligue no "
        accent="autenticador"
        steps={{ current: 2, total: 3 }}
        cta={
          <PillButton
            label={phaseLabel(phase, {
              idle: 'Confirmar',
              sending: 'Verificando…'
            })}
            busy={phaseBusy(phase)}
            disabled={code.length < DIGITS}
            onPress={() => verify(code)}
          />
        }
      >
        <PillButton
          label="Abrir no app autenticador"
          leading="link"
          onPress={() =>
            Linking.openURL(uri).catch(() =>
              setError(
                'Nenhum app autenticador abriu. Copie a chave ou use o QR em outro aparelho.'
              )
            )
          }
        />
        <View
          style={[
            styles.qrCard,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <View style={styles.qr}>
            <QRCode value={uri} size={112} bgColor="#ffffff" fgColor={INK} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text
              style={[text(12.5, 'Regular', 1.35), { color: palette.muted }]}
            >
              Em outro aparelho? Leia o QR ou digite a chave:
            </Text>
            <Text selectable style={[styles.secret, { color: palette.ink }]}>
              {secret}
            </Text>
            <Text
              accessibilityRole="button"
              suppressHighlighting
              onPress={() => copy('key', secret.replace(/\s/g, ''))}
              style={[
                text(13, 'SemiBold'),
                { color: palette.ink, textDecorationLine: 'underline' }
              ]}
            >
              {copied === 'key' ? 'Chave copiada' : 'Copiar chave'}
            </Text>
          </View>
        </View>
        <Text
          style={[
            text(13, 'SemiBold'),
            { color: palette.ink, marginBottom: -6 }
          ]}
        >
          Código de 6 dígitos do app
        </Text>
        <CodeBoxes
          ref={input}
          code={code}
          onChange={onDigits}
          tone="theme"
          shake={boxes}
          autoFocus={false}
        />
        {errorText}
      </AccountPage>
    )

  return (
    <AccountPage
      key={step}
      title="Guarde estes "
      accent="códigos"
      steps={{ current: 3, total: 3 }}
      back={false}
      cta={
        <PillButton label="Guardei os códigos" onPress={() => router.back()} />
      }
    >
      <Text
        style={[
          text(14, 'Regular', 1.45),
          { color: palette.muted, marginTop: -4 }
        ]}
      >
        Sem o celular, cada um entra uma vez no lugar do código do app. A Onside
        não mostra de novo.
      </Text>
      <View style={[styles.codes, palette.dark && INK_ON_DARK]}>
        <DotField id="codigos" radius={20} />
        {backupCodes.map((item, index) => (
          <View
            key={item}
            style={[styles.codeCell, index % 2 === 0 && styles.codeCellLeft]}
          >
            <Text style={styles.codeN}>{index + 1}</Text>
            <Text selectable style={styles.code}>
              {item}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => copy('codes', codesText)}
          style={[styles.ghost, { borderColor: palette.line }]}
        >
          <Icon name="doc" size={16} color={palette.ink} />
          <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
            {copied === 'codes' ? 'Copiados' : 'Copiar'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Share.share({
              message: `Códigos de recuperação da Onside:\n${codesText}`
            })
          }
          style={[styles.ghost, { borderColor: palette.line }]}
        >
          <Icon name="share" size={16} color={palette.ink} />
          <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
            Salvar em Notas
          </Text>
        </Pressable>
      </View>
      <AccountNote icon="lock">
        Guarde <Text style={text(13, 'Bold', 1.45)}>fora do celular</Text>: no
        gerenciador de senhas, ou impresso. Se perder o celular, é com eles que
        você entra.
      </AccountNote>
    </AccountPage>
  )
}

const styles = StyleSheet.create({
  qrCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    borderRadius: 20,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  qr: { padding: 10, borderRadius: 14, backgroundColor: '#ffffff' },
  secret: { fontFamily: 'GeistMono-SemiBold', fontSize: 14, lineHeight: 20 },
  codes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    borderRadius: 20,
    backgroundColor: INK,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  codeCell: {
    width: '50%',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 12
  },
  codeCellLeft: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(241,238,230,.1)'
  },
  codeN: {
    width: 16,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    color: '#6a6a63'
  },
  code: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 16,
    letterSpacing: 1,
    color: PAPER
  },
  actions: { flexDirection: 'row', gap: 8 },
  ghost: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  }
})
