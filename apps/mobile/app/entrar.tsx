import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ComponentProps, useEffect, useRef, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CodeBoxes } from '@/components/code-boxes'
import { dayLabel, Photo } from '@/components/explore'
import { ErrorText, haptic, SWAP, useShake } from '@/components/motion'
import { AcidButton } from '@/components/ob-frame'
import { usePalette } from '@/components/theme'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  authErrorMessage,
  Icon,
  LIVE,
  MIN_PASSWORD,
  phaseBusy,
  phaseLabel,
  Text,
  TextInput,
  Title,
  text,
  useCountdown
} from '@/components/ui'
import { attemptPhase, retryable, settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { finishPending, takePending } from '@/lib/pending-action'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * A folha de entrar e criar conta (rodada 2 do redesign, telas 1 e 2): por
 * cima de onde a pessoa estava, com o que ela fazia no topo (o bar, o jogo).
 * Entrar, criar conta, confirmar o e-mail e as duas etapas trocam no lugar,
 * na mesma folha. A ação fica guardada (`lib/pending-action.ts`) e sai feita
 * quando a conta existe, mesmo que a confirmação volte pelo link.
 *
 * Parâmetros: `acao` (vou, fav, checkin, conta), `bar`, `jogo` e `item` (o
 * que pede conta, para o título: "ver suas conquistas").
 */

type Mode = 'entrar' | 'criar' | 'confirmar' | 'codigo'

/** O que vem depois de "Entre para…" e de "Crie a conta e…". */
function verbs(acao: string, barName: string | undefined, item?: string) {
  if (acao === 'vou')
    return {
      enter: 'marcar presença',
      create: 'marque presença',
      button: 'e marcar presença'
    }
  if (acao === 'fav')
    return {
      enter: `salvar o ${barName ?? 'bar'}`,
      create: `salve o ${barName ?? 'bar'}`,
      button: 'e salvar'
    }
  if (acao === 'checkin')
    return { enter: 'fazer o check-in', create: 'faça o check-in', button: '' }
  return {
    enter: item ?? 'usar a Onside',
    create: 'comece agora',
    button: ''
  }
}

export default function Entrar() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const params = useLocalSearchParams<{
    acao?: string
    bar?: string
    jogo?: string
    item?: string
    /** `criar`: abre direto em criar conta ("Criar conta grátis" do Você). */
    modo?: string
  }>()
  const acao = params.acao ?? 'conta'
  const bar = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: params.bar ?? '' }),
    enabled: Boolean(params.bar)
  })
  const game = bar.data?.events.find((event) => event.id === params.jogo)
  const say = verbs(acao, bar.data?.name, params.item)

  const [mode, setMode] = useState<Mode>(
    params.modo === 'criar' ? 'criar' : 'entrar'
  )
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [backup, setBackup] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tries, setTries] = useState(0)
  const turnstile = useTurnstile()
  const boxes = useShake()
  const countdown = useCountdown(60)

  // Fechar a folha sem conta desfaz a ação guardada; esperando o link do
  // e-mail, ela fica, para sair feita na volta.
  const keep = useRef(false)
  useEffect(
    () => () => {
      if (!keep.current) takePending()
    },
    []
  )

  const fail = (result: { error: unknown }, fallback: string) => {
    const transient = retryable(result.error as never)
    setFailed(transient)
    if (transient) setTries((n) => n + 1)
    haptic.error()
    setError(authErrorMessage(result.error as never, fallback))
    return transient
  }

  /** Entrou: fecha a folha e conclui a ação com a sessão nova. */
  const done = async () => {
    haptic.success()
    keep.current = true
    await queryClient.invalidateQueries()
    const session = await authClient.getSession()
    router.back()
    if (session.data?.user) await finishPending(session.data.user)
  }

  const signIn = async () => {
    if (pending) return
    if (!failed) setError(null)
    setPending(true)
    const result = await settleAuth(
      authClient.signIn.email({
        email: email.trim(),
        password,
        // Sem `callbackURL`: com ele o plugin do Expo abre a janela de login
        // social do iOS (ver `app/sign-in.tsx`).
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    setPending(false)
    if (result.error) {
      if (result.error.code === 'EMAIL_NOT_VERIFIED') {
        keep.current = true
        setMode('confirmar')
        return
      }
      fail(result, 'Não foi possível entrar. Tente de novo.')
      return
    }
    if (result.data && 'twoFactorRedirect' in result.data) {
      setMode('codigo')
      return
    }
    await done()
  }

  const signUp = async () => {
    if (pending) return
    if (!failed) setError(null)
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
        // Quem chegou por um jogo é torcedor.
        role: 'fan',
        callbackURL: '/verified',
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    setPending(false)
    if (result.error) {
      fail(result, 'Não foi possível criar sua conta. Tente de novo.')
      return
    }
    keep.current = true
    countdown.restart()
    setMode('confirmar')
  }

  const verify = async (value = code) => {
    if (pending) return
    if (!failed) setError(null)
    setPending(true)
    const result = await settleAuth(
      backup
        ? authClient.twoFactor.verifyBackupCode({
            code: value.trim(),
            trustDevice: true
          })
        : authClient.twoFactor.verifyTotp({ code: value, trustDevice: true })
    )
    setPending(false)
    if (result.error) {
      // Código recusado: as caixas tremem juntas e esvaziam.
      if (!fail(result, 'Código não confere. Tente de novo.')) {
        boxes.shake()
        if (!backup) setCode('')
      }
      return
    }
    await done()
  }

  const resend = async () => {
    setError(null)
    const result = await settleAuth(
      authClient.sendVerificationEmail({
        email: email.trim(),
        callbackURL: '/verified',
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    if (result.error) {
      fail(result, 'Não foi possível reenviar agora. Tente daqui a pouco.')
      return
    }
    haptic.success()
    countdown.restart()
  }

  const phase = attemptPhase(pending, failed)
  const passwordOk = password.length >= MIN_PASSWORD
  const ink = palette.ink
  const muted = palette.muted

  return (
    // A folha tem a altura do conteúdo (`fitToContents`): cada passo do
    // desenho ocupa o que precisa, do "Confira seu e-mail" ao criar conta.
    <ScrollView
      style={{ flexGrow: 0, backgroundColor: palette.sheet }}
      contentContainerStyle={[
        styles.page,
        { paddingBottom: Math.max(insets.bottom, 34) }
      ]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {mode === 'criar' ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar para entrar"
            hitSlop={8}
            onPress={() => setMode('entrar')}
            style={[styles.back, { backgroundColor: palette.card }]}
          >
            <Icon name="back" size={16} color={ink} />
          </Pressable>
          <Text style={[styles.mono, { color: muted }]}>
            GRÁTIS · 30 SEGUNDOS
          </Text>
        </View>
      ) : null}

      {/* O que a pessoa estava fazendo: o bar e o jogo. */}
      {bar.data && mode !== 'confirmar' ? (
        <View
          style={[
            styles.context,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Photo
            uri={bar.data.photoUrl}
            name={bar.data.name}
            style={styles.contextPhoto}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[text(14.5, 'Bold', 1.25), { color: ink }]}
            >
              {bar.data.name}
              {game ? ` · ${gameTitle(game)}` : ''}
            </Text>
            <Text numberOfLines={1} style={[styles.mono, { color: muted }]}>
              {game
                ? `${dayLabel(game.startsAt, Date.now()).toLowerCase()} ${formatTime(game.startsAt)} · `
                : ''}
              {bar.data.neighborhood}
            </Text>
          </View>
        </View>
      ) : null}

      <Animated.View key={mode} entering={SWAP} style={{ gap: 14 }}>
        {mode === 'entrar' ? (
          <>
            <Title
              lines={[['Entre para'], ['', say.enter]]}
              size={36}
              color={ink}
              accentColor={palette.dark ? palette.accent : LIVE}
            />
            <SheetField
              label="E-mail"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
            />
            <SheetField
              label="Senha"
              autoComplete="current-password"
              textContentType="password"
              secureTextEntry
              placeholder="Sua senha"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={signIn}
            />
            {error ? (
              <ErrorText
                key={`e${tries}`}
                style={[text(13.5), { color: LIVE }]}
              >
                {error}
              </ErrorText>
            ) : null}
            <AcidButton
              label={phaseLabel(phase, {
                idle: `Entrar ${say.button}`.trim(),
                sending: 'Entrando…'
              })}
              busy={phaseBusy(phase)}
              onPress={signIn}
            />
            <Pressable
              accessibilityRole="link"
              hitSlop={8}
              style={{ alignSelf: 'center' }}
              onPress={() =>
                router.push({
                  pathname: '/forgot-password',
                  params: { email: email.trim() }
                })
              }
            >
              <Text
                style={[text(13.5, 'SemiBold'), styles.link, { color: ink }]}
              >
                Esqueci a senha
              </Text>
            </Pressable>
            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: palette.line }]} />
              <Text style={[styles.mono, { color: muted }]}>PRIMEIRA VEZ?</Text>
              <View style={[styles.line, { backgroundColor: palette.line }]} />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(null)
                setMode('criar')
              }}
              // `.b-ghost`: a borda é a cor do texto a 22%.
              style={[
                styles.outline,
                {
                  borderColor: palette.dark
                    ? 'rgba(241,238,230,.22)'
                    : 'rgba(18,18,15,.22)'
                }
              ]}
            >
              <Text style={[text(15, 'Bold', 1.2), { color: ink }]}>
                Criar conta grátis
              </Text>
            </Pressable>
            <Text style={[text(12.5), { color: muted, textAlign: 'center' }]}>
              Ver bares e jogos continua aberto, sem conta.
            </Text>
          </>
        ) : mode === 'criar' ? (
          <>
            <Title
              lines={[['Crie a conta e'], ['', say.create]]}
              size={36}
              color={ink}
              accentColor={palette.dark ? palette.accent : LIVE}
            />
            <SheetField
              label="Nome"
              autoComplete="name"
              textContentType="name"
              value={name}
              onChangeText={setName}
            />
            <SheetField
              label="E-mail"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
            />
            <View style={{ gap: 7 }}>
              <SheetField
                label="Senha"
                autoComplete="new-password"
                textContentType="newPassword"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={signUp}
              />
              {/* Dezenas de toques: só a cor troca, sem movimento. */}
              <View style={styles.rule}>
                <Icon
                  name="check"
                  size={13}
                  color={passwordOk ? (palette.dark ? ACID : ink) : muted}
                />
                <Text
                  style={[
                    styles.mono,
                    { color: passwordOk ? (palette.dark ? ACID : ink) : muted }
                  ]}
                >
                  {MIN_PASSWORD} caracteres ou mais
                </Text>
              </View>
            </View>
            {error ? (
              <ErrorText
                key={`e${tries}`}
                style={[text(13.5), { color: LIVE }]}
              >
                {error}
              </ErrorText>
            ) : null}
            <AcidButton
              label={phaseLabel(phase, {
                idle: `Criar conta ${say.button}`.trim(),
                sending: 'Criando a conta…'
              })}
              busy={phaseBusy(phase)}
              onPress={signUp}
            />
            <Text
              style={[
                text(12.5, 'Regular', 1.45),
                { color: muted, textAlign: 'center' }
              ]}
            >
              Ao criar a conta você aceita os{' '}
              <Text
                accessibilityRole="link"
                onPress={() => router.push('/legal')}
                style={[text(12.5, 'Bold'), styles.link, { color: ink }]}
              >
                Termos e a Privacidade
              </Text>
              . Já tem conta?{' '}
              <Text
                accessibilityRole="link"
                onPress={() => setMode('entrar')}
                style={[text(12.5, 'Bold'), styles.link, { color: ink }]}
              >
                Entrar
              </Text>
            </Text>
          </>
        ) : mode === 'confirmar' ? (
          <>
            <View style={[styles.mailIcon, { backgroundColor: palette.mark }]}>
              <Icon name="mail" size={32} color={ink} />
            </View>
            <Title
              lines={[['Confira'], ['', 'seu e-mail']]}
              size={36}
              color={ink}
              accentColor={palette.dark ? palette.accent : LIVE}
            />
            <Text style={[text(15.5, 'Regular', 1.5), { color: ink }]}>
              Mandamos um link para{' '}
              <Text style={text(15.5, 'Bold', 1.5)}>{email.trim()}</Text>.
              {acao === 'vou' ? (
                <>
                  {' '}
                  Toque nele e você volta aqui com a presença
                  {bar.data ? (
                    <>
                      {' no '}
                      <Text style={text(15.5, 'Bold', 1.5)}>
                        {bar.data.name}
                      </Text>
                    </>
                  ) : null}{' '}
                  marcada. Ela fica guardada até lá.
                </>
              ) : acao === 'fav' ? (
                <>
                  {' '}
                  Toque nele e você volta aqui com o{' '}
                  <Text style={text(15.5, 'Bold', 1.5)}>
                    {bar.data?.name ?? 'bar'}
                  </Text>{' '}
                  salvo. Ele fica guardado até lá.
                </>
              ) : (
                ' Toque nele e você volta aqui com a conta pronta.'
              )}
            </Text>
            {error ? (
              <ErrorText
                key={`e${tries}`}
                style={[text(13.5), { color: LIVE }]}
              >
                {error}
              </ErrorText>
            ) : null}
            <AcidButton
              label="Abrir o Mail"
              leading="mail"
              onPress={() => Linking.openURL('message://').catch(() => {})}
            />
            <View style={styles.between}>
              {countdown.left > 0 ? (
                <Text style={[styles.mono, styles.mono13, { color: muted }]}>
                  Reenviar em {countdown.label}
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={resend}
                >
                  <Text
                    style={[text(13.5, 'Bold'), styles.link, { color: ink }]}
                  >
                    Reenviar
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setMode('criar')}
              >
                <Text
                  style={[text(15, 'SemiBold'), styles.link, { color: ink }]}
                >
                  Corrigir e-mail
                </Text>
              </Pressable>
            </View>
            <Text style={[text(12.5), { color: muted, textAlign: 'center' }]}>
              Não chegou? Olhe a pasta de spam ou promoções.
            </Text>
          </>
        ) : (
          <>
            <Title
              lines={[['Confirme que'], ['', 'é você']]}
              size={36}
              color={ink}
              accentColor={palette.dark ? palette.accent : LIVE}
            />
            <Text style={[text(14.5, 'Regular', 1.45), { color: muted }]}>
              {backup
                ? 'Digite um dos seus códigos de recuperação.'
                : 'Digite o código de 6 dígitos do seu app autenticador.'}
            </Text>
            {backup ? (
              <SheetField
                label="Código de recuperação"
                autoCapitalize="none"
                value={code}
                onChangeText={setCode}
                onSubmitEditing={() => verify()}
              />
            ) : (
              <CodeBoxes
                code={code}
                shake={boxes}
                tone="sheet"
                onChange={(digits) => {
                  setCode(digits)
                  if (digits.length === 6) verify(digits)
                }}
              />
            )}
            {error ? (
              <ErrorText
                key={`e${tries}`}
                style={[text(13.5), { color: LIVE }]}
              >
                {error}
              </ErrorText>
            ) : null}
            <AcidButton
              label={phaseLabel(phase, {
                idle: `Confirmar ${say.button}`.trim(),
                sending: 'Confirmando…'
              })}
              busy={phaseBusy(phase)}
              disabled={!backup && code.length < 6}
              onPress={() => verify()}
            />
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              style={{ alignSelf: 'center' }}
              onPress={() => {
                setBackup(!backup)
                setCode('')
                setError(null)
              }}
            >
              <Text
                style={[text(13.5, 'SemiBold'), styles.link, { color: ink }]}
              >
                {backup
                  ? 'Usar o app autenticador'
                  : 'Usar código de recuperação'}
              </Text>
            </Pressable>
          </>
        )}
      </Animated.View>
      {turnstile.widget}
    </ScrollView>
  )
}

/**
 * O campo da folha (`.fld` e `.inp` do redesign): rótulo em mono, caixa em
 * pílula de 54 com a borda que escurece no foco e, na senha, o olho.
 */
function SheetField({
  label,
  secureTextEntry,
  ...input
}: ComponentProps<typeof TextInput> & { label: string }) {
  const palette = usePalette()
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)
  return (
    <View style={{ gap: 7 }}>
      <Text style={[styles.fieldLabel, { color: palette.muted }]}>
        {label.toLocaleUpperCase('pt-BR')}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: palette.card,
            borderColor: focused ? palette.ink : palette.line,
            borderWidth: focused ? 2.5 : 1.5,
            paddingHorizontal: focused ? 17 : 18
          }
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={palette.muted}
          selectionColor={palette.ink}
          cursorColor={palette.ink}
          secureTextEntry={secureTextEntry && !shown}
          style={[styles.fieldText, { color: palette.ink }]}
          {...input}
          onFocus={(event) => {
            setFocused(true)
            input.onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            input.onBlur?.(event)
          }}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Esconder a senha' : 'Mostrar a senha'}
            hitSlop={10}
            onPress={() => setShown((value) => !value)}
          >
            <Icon name="eye" size={20} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88
  },
  field: {
    height: 54,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  fieldText: {
    flex: 1,
    height: '100%',
    fontFamily: 'Archivo-SemiBold',
    fontSize: 17
  },
  // `.fs`: 20 dos lados, 14 entre as peças.
  page: { paddingHorizontal: 20, paddingTop: 22, gap: 14 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, letterSpacing: 0.88 },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  contextPhoto: { width: 52, height: 52, borderRadius: 12 },
  link: { textDecorationLine: 'underline' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  line: { flex: 1, height: 1 },
  outline: {
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mono13: { fontSize: 13, letterSpacing: 0 },
  mailIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  }
})
