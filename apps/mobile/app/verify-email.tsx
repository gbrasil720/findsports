import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from '@/components/glass'
import { useLayout } from '@/components/layout'
import { ErrorText, Float, haptic, POP_LATE } from '@/components/motion'
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
  TextLink,
  Title,
  text,
  useBrandFrame,
  useCountdown
} from '@/components/ui'
import { settleAuth } from '@/lib/auth-attempt'
import { authClient } from '@/lib/auth-client'

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
      <Screen brand gap={16} footer={resendRow}>
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
        {notice ? (
          <ErrorText style={[text(13.5), { color: LIVE }]}>{notice}</ErrorText>
        ) : null}
        {turnstile.widget}
      </Screen>
    )

  return (
    <Screen
      brand
      gap={16}
      footer={
        <View style={{ gap: 12, alignItems: 'center' }}>
          {countdown.left > 0 ? (
            <Text style={[text(14), { color: SUB }]}>
              Não chegou?{' '}
              <Text style={[text(14, 'Bold'), { color: FG }]}>
                Reenviar em {countdown.label}
              </Text>
            </Text>
          ) : (
            <TextLink lead="Não chegou?" label="Reenviar" onPress={resend} />
          )}
          <TextLink
            lead="E-mail errado?"
            label="Corrigir"
            onPress={() => router.back()}
          />
        </View>
      }
    >
      <BackButton />
      <View style={styles.art}>
        <View>
          <View style={styles.orbShadow} />
          {/* Só a bola flutua: a sombra fica, e a distância entre as duas
              respira. */}
          <Float>
            <View style={styles.orb}>
              <Icon name="mail" size={76} color={INK} accent={LIVE} />
            </View>
            <Animated.View entering={POP_LATE} style={styles.badge}>
              <Text style={[text(15, 'Bold', 1), { color: PAPER }]}>1</Text>
            </Animated.View>
          </Float>
        </View>
      </View>
      <Title lines={[['Confirme seu e-mail']]} size={38} />
      <Text style={[text(16, 'Regular', 1.48), { color: SUB, marginTop: -4 }]}>
        Enviamos um link para{' '}
        <Text style={[text(16, 'Bold', 1.48), { color: FG }]}>{email}</Text>.
        Toque nele para continuar o cadastro.
      </Text>
      <View style={styles.apps}>
        {MAIL_APPS.map((app) => (
          <Pressable
            key={app.label}
            accessibilityRole="button"
            onPress={() => openMailApp(app.label, app.url)}
            style={styles.app}
          >
            <Text style={[text(13.5, 'Bold'), { color: FG }]}>{app.label}</Text>
          </Pressable>
        ))}
      </View>
      {notice ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{notice}</ErrorText>
      ) : null}
      {turnstile.widget}
    </Screen>
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
