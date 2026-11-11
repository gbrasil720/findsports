import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthShell } from '@/components/auth-shell'
import { dayLabel, Photo } from '@/components/explore'
import { Glass } from '@/components/glass'
import { useLayout } from '@/components/layout'
import { ErrorText, haptic, } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  authErrorMessage,
  BackButton,
  BG,
  CARD,
  DROP,
  EDGE,
  FG,
  Icon,
  INK,
  LINE,
  LIVE,
  MAIL_APPS,
  maskEmail,
  openMailApp,
  PAPER,
  PillButton,
  Screen,
  SUB,
  Text,
  Title,
  text,
  useBrandFrame,
  useCountdown
} from '@/components/ui'
import { settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { shortTitle } from '@/lib/maintenance-ticker'
import { type Acao, peekPending } from '@/lib/pending-action'
import { trpc } from '@/lib/trpc'

/*
 * "Confirmar e-mail" (4h do design), depois do cadastro e do login de quem
 * ainda não confirmou. O link do e-mail volta para `/verified`.
 */

export default function VerifyEmail() {
  const router = useRouter()
  const { email = '' } = useLocalSearchParams<{ email?: string }>()
  const countdown = useCountdown(60)
  const [notice, setNotice] = useState<string | null>(null)
  const turnstile = useTurnstile()
  const cover = useLayout().kind === 'cover'
  // Tablet e dobrável aberto: a versão do design (a08, `verify`), com os três
  // passos; os apps de e-mail entram no passo de abrir o e-mail.
  const framed = useBrandFrame()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  // O que a pessoa tentava fazer quando a conta foi pedida (rodada 2): a
  // espera ganha rumo ("Guardado pra você").
  const [saved, setSaved] = useState<Acao | null>(null)
  useEffect(() => {
    peekPending().then((acao) =>
      setSaved(
        acao && (acao.kind === 'vou' || acao.kind === 'fav') ? acao : null
      )
    )
  }, [])
  const savedBar = useQuery({
    ...trpc.pubs.getById.queryOptions({
      id: saved && 'barId' in saved ? saved.barId : ''
    }),
    enabled: !!saved && 'barId' in saved
  })
  const savedGame =
    saved?.kind === 'vou'
      ? savedBar.data?.events.find((game) => game.id === saved.eventId)
      : undefined

  const resend = async () => {
    setNotice(null)
    const result = await settleAuth(
      authClient.sendVerificationEmail({
        email,
        callbackURL: '/verified',
        fetchOptions: turnstile.fetchOptions
      })
    )
    turnstile.reset()
    if (result.error) {
      // Sem rede, a frase de conexão; o "Reenviar" já é a nova tentativa.
      setNotice(
        authErrorMessage(
          result.error,
          'Não foi possível reenviar agora. Tente daqui a pouco.'
        )
      )
      return
    }
    haptic.success()
    countdown.restart()
  }

  // Tela de fora do Z Flip 8 (a08): sem teclado, avisa e manda abrir.
  if (cover)
    return (
      <View style={[styles.cover, { paddingTop: insets.top + 18 }]}>
        <Image
          source={require('../assets/images/brand/wordmark-light.png')}
          accessibilityLabel="Onside"
          style={{ height: 18, width: (18 * 845) / 256 }}
        />
        <View style={styles.coverSent}>
          <View style={styles.coverIcon}>
            <Icon name="mail" size={26} color={INK} accent={LIVE} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(15, 'Bold'), { color: PAPER }]}>
              Link enviado
            </Text>
            <Text numberOfLines={1} style={[text(12.5), { color: '#aaa9a4' }]}>
              para {email}
            </Text>
          </View>
        </View>
        <Text style={[text(13.5, 'Regular', 1.45), { color: '#d6d3cb' }]}>
          Abra o celular para confirmar o e-mail. Você entra direto.
        </Text>
        <Glass
          tone="dark"
          style={[styles.coverOpen, { bottom: insets.bottom + 26 }]}
        >
          <Icon name="next" size={13} color={PAPER} />
          <Text style={[text(13.5, 'Bold'), { color: PAPER }]}>
            Abrir o celular
          </Text>
        </Glass>
      </View>
    )

  const resendRow = (
    <View style={styles.resendRow}>
      {countdown.left > 0 ? (
        <Text style={[text(14, 'SemiBold'), { color: SUB }]}>
          Reenviar em <Text style={styles.mono}>{countdown.label}</Text>
        </Text>
      ) : (
        <Text
          accessibilityRole="button"
          suppressHighlighting
          onPress={resend}
          style={[text(14, 'SemiBold'), { color: FG }]}
        >
          Reenviar
        </Text>
      )}
      <Text
        accessibilityRole="button"
        suppressHighlighting
        onPress={() => router.back()}
        style={[text(14, 'SemiBold'), { color: FG }]}
      >
        Usar outro e-mail
      </Text>
    </View>
  )

  if (framed)
    return (
      <Screen brand gap={16}>
        <BackButton />
        <View>
          <View style={styles.squareShadow} />
          <View style={styles.square}>
            <Icon name="mail" size={56} color={INK} accent={LIVE} />
          </View>
        </View>
        <Title lines={[['Confirme seu ', 'e-mail']]} size={42} />
        <Text style={[text(15, 'Regular', 1.5), { color: SUB }]}>
          Mandamos um link para{' '}
          <Text style={[text(15, 'Bold', 1.5), { color: FG }]}>
            {maskEmail(email)}
          </Text>
          . Abra no celular em que começou o cadastro e você entra direto.
        </Text>
        <View style={styles.steps}>
          <Step n="1">
            Abra o e-mail “Confirme seu e-mail para entrar em campo”
          </Step>
          <View style={[styles.apps, { marginLeft: 32, marginTop: 0 }]}>
            {MAIL_APPS.map((app) => (
              <Pressable
                key={app.label}
                accessibilityRole="button"
                onPress={() => openMailApp(app.label, app.url)}
                style={[
                  styles.app,
                  { height: 34, shadowOffset: { width: 2, height: 2 } }
                ]}
              >
                <Text style={[text(13, 'Bold'), { color: FG }]}>
                  {app.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Step n="2">Toque em Confirmar meu e-mail</Step>
          <Step n="3">O link vale por 1 hora</Step>
        </View>
        <PillButton
          label="Abrir app de e-mail"
          height={54}
          onPress={() => openMailApp('app de e-mail', MAIL)}
        />
        {resendRow}
        {notice ? (
          <ErrorText style={[text(13.5), { color: LIVE }]}>{notice}</ErrorText>
        ) : null}
        {turnstile.widget}
      </Screen>
    )

  // Rodada 8, tela 5: o título e a notificação como ela vai chegar, para a
  // pessoa reconhecer; para onde foi, quanto vale, "Abrir o Mail" e reenviar;
  // o que ficou guardado e os três passos até voltar, para a espera ter rumo.
  return (
    <AuthShell
      title={['Confira', 'seu e-mail']}
      art={
        <View style={styles.notif}>
          <View style={styles.notifHead}>
            <View style={styles.notifMark}>
              <View style={styles.notifRing} />
              <View style={styles.notifDot} />
            </View>
            <View>
              <Text style={[text(13, 'Bold', 1.2), { color: INK }]}>
                Onside
              </Text>
              <Text style={styles.notifTime}>agora</Text>
            </View>
          </View>
          <Text style={[text(14.5, 'Bold', 1.3), { color: INK }]}>
            Confirme seu e-mail
          </Text>
          <View style={styles.notifButton}>
            <Text style={[text(12, 'Bold', 1.2), { color: INK }]}>
              Confirmar e-mail
            </Text>
          </View>
        </View>
      }
      footer={
        <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
          Não chegou? Olhe em spam ou promoções.
        </Text>
      }
    >
      <Text style={[text(15, 'Regular', 1.45), { color: palette.ink }]}>
        Mandamos para <Text style={text(15, 'Bold', 1.45)}>{email}</Text>. O
        link vale por 1 hora.
      </Text>
      <PillButton
        label="Abrir o Mail"
        leading="mail"
        onPress={() => openMailApp('Mail', MAIL)}
      />
      <View style={styles.resendLine}>
        {countdown.left > 0 ? (
          <Text style={[styles.monoSmall, { color: palette.muted }]}>
            Reenviar em {countdown.label}
          </Text>
        ) : (
          <Text
            accessibilityRole="button"
            suppressHighlighting
            onPress={resend}
            style={[
              text(13.5, 'Bold'),
              styles.underline,
              { color: palette.ink }
            ]}
          >
            Reenviar
          </Text>
        )}
        <Text
          accessibilityRole="button"
          suppressHighlighting
          onPress={() => router.back()}
          style={[text(13.5, 'Bold'), styles.underline, { color: palette.ink }]}
        >
          Corrigir e-mail
        </Text>
      </View>
      {notice ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{notice}</ErrorText>
      ) : null}
      {saved ? (
        <View
          style={[
            styles.saved,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Photo
            uri={savedBar.data?.photoUrl ?? null}
            name={savedBar.data?.name ?? 'Bar'}
            style={styles.savedPhoto}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.monoTiny, { color: palette.muted }]}>
              GUARDADO PRA VOCÊ
            </Text>
            <Text
              numberOfLines={1}
              style={[text(15, 'Bold', 1.3), { color: palette.ink }]}
            >
              {saved.kind === 'fav'
                ? `Salvar · ${savedBar.data?.name ?? 'o bar'}`
                : `Vou assistir${savedGame ? ` · ${shortTitle(gameTitle(savedGame))}` : ''}`}
            </Text>
            <Text
              numberOfLines={1}
              style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
            >
              {[
                savedBar.data?.name,
                savedGame
                  ? `${dayLabel(savedGame.startsAt, Date.now()).toLowerCase()} ${formatTime(savedGame.startsAt)}`
                  : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
      ) : null}
      <View style={{ gap: 10 }}>
        {[
          'Abra o e-mail da Onside',
          'Toque em “Confirmar e-mail”',
          saved && savedBar.data
            ? `Você volta ao ${savedBar.data.name} com ${saved.kind === 'fav' ? 'o bar salvo' : 'a presença marcada'}`
            : 'Você volta ao app com a conta pronta'
        ].map((line, index) => (
          <View key={line} style={styles.stepRow}>
            <View style={[styles.stepDot, { backgroundColor: palette.mark }]}>
              <Text style={[styles.monoTiny, { color: palette.ink }]}>
                {index + 1}
              </Text>
            </View>
            <Text
              style={[
                text(14, 'Regular', 1.35),
                { color: palette.ink, flex: 1 }
              ]}
            >
              {line}
            </Text>
          </View>
        ))}
      </View>
      {turnstile.widget}
    </AuthShell>
  )
}

const MAIL = Platform.OS === 'ios' ? 'message://' : 'mailto:'

/** Um passo numerado do quadro de confirmação (a08). */
function Step({ n, children }: { n: string; children: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepN}>
        <Text style={styles.stepNText}>{n}</Text>
      </View>
      <Text style={[text(13.5, 'Regular', 1.35), { color: FG, flex: 1 }]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  // A notificação como chega (`.nf8`): papel sobre o topo de tinta.
  notif: {
    backgroundColor: '#e7e3db',
    borderRadius: 18,
    padding: 14,
    gap: 8,
    marginBottom: 6
  },
  notifHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  notifMark: { width: 24, height: 24 },
  notifRing: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 10,
    borderWidth: 3.5,
    borderColor: INK
  },
  notifDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e8320c'
  },
  notifTime: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    color: '#55554f'
  },
  notifButton: {
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: ACID
  },
  resendLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  monoSmall: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  monoTiny: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.8
  },
  underline: { textDecorationLine: 'underline' },
  saved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  savedPhoto: { width: 52, height: 52, borderRadius: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  squareShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 104,
    height: 104,
    borderRadius: 7,
    backgroundColor: EDGE
  },
  square: {
    width: 104,
    height: 104,
    borderRadius: 7,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  steps: {
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepN: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNText: { fontFamily: 'Anton', fontSize: 13, color: INK },
  resendRow: { flexDirection: 'row', justifyContent: 'center', gap: 18 },
  mono: { fontFamily: 'GeistMono-SemiBold' },
  cover: { flex: 1, backgroundColor: INK, paddingHorizontal: 22, gap: 12 },
  coverSent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6
  },
  coverIcon: {
    width: 46,
    height: 46,
    borderRadius: 7,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  coverOpen: {
    position: 'absolute',
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 22,
    overflow: 'hidden'
  },
  art: { height: 220, alignItems: 'center', justifyContent: 'center' },
  orb: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  orbShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: EDGE
  },
  // O "1" vermelho no canto da bola, com o anel de papel do design.
  badge: {
    position: 'absolute',
    top: 6,
    right: -7,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: BG,
    backgroundColor: LIVE,
    alignItems: 'center',
    justifyContent: 'center'
  },
  apps: { flexDirection: 'row', gap: 10, marginTop: 6 },
  app: {
    flex: 1,
    height: 46,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE,
    shadowColor: DROP,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  }
})
