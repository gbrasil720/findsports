import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { ErrorText, Float, haptic, POP_LATE } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  MAIL_APPS,
  MUTED,
  openMailApp,
  PAPER,
  Screen,
  TextLink,
  Title,
  text,
  useCountdown
} from '@/components/ui'
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

  const resend = async () => {
    setNotice(null)
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/verified',
      fetchOptions: turnstile.fetchOptions
    })
    turnstile.reset()
    if (result.error) {
      setNotice('Não foi possível reenviar agora. Tente daqui a pouco.')
      return
    }
    haptic.success()
    countdown.restart()
  }

  return (
    <Screen
      gap={16}
      footer={
        <View style={{ gap: 12, alignItems: 'center' }}>
          {countdown.left > 0 ? (
            <Text style={[text(14), { color: MUTED }]}>
              Não chegou?{' '}
              <Text style={text(14, 'Bold')}>
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
              <Icon name="mail" size={76} />
            </View>
            <Animated.View entering={POP_LATE} style={styles.badge}>
              <Text style={[text(15, 'Bold', 1), { color: PAPER }]}>1</Text>
            </Animated.View>
          </Float>
        </View>
      </View>
      <Title lines={[['Confirme seu e-mail']]} size={38} />
      <Text
        style={[text(16, 'Regular', 1.48), { color: MUTED, marginTop: -4 }]}
      >
        Enviamos um link para{' '}
        <Text style={[text(16, 'Bold', 1.48), { color: INK }]}>{email}</Text>.
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
            <Text style={text(13.5, 'Bold')}>{app.label}</Text>
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

const styles = StyleSheet.create({
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
    backgroundColor: INK
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
    borderColor: PAPER,
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
    backgroundColor: '#faf8f3',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)',
    shadowColor: INK,
    shadowOpacity: 0.09,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  }
})
