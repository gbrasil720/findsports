import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { ErrorText, Float, haptic } from '@/components/motion'
import { useTurnstile } from '@/components/turnstile'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  maskEmail,
  openMailApp,
  PAPER,
  PillButton,
  Screen,
  Text,
  Title,
  text,
  useCountdown
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'

/*
 * "Link enviado" (do design, em tinta). O link vale 30 minutos
 * (`resetPasswordTokenExpiresIn` no servidor).
 */

// No iOS, `message://` abre o Mail; no Android não há endereço comum para
// "o app de e-mail", e `mailto:` abre o que o aparelho usa.
const MAIL = Platform.OS === 'ios' ? 'message://' : 'mailto:'

export default function ResetSent() {
  const router = useRouter()
  const { email = '' } = useLocalSearchParams<{ email?: string }>()
  const countdown = useCountdown(60)
  const [notice, setNotice] = useState<string | null>(null)
  const turnstile = useTurnstile()

  const resend = async () => {
    setNotice(null)
    const result = await authClient.requestPasswordReset({
      email,
      redirectTo: Linking.createURL('/reset-password'),
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
      dark
      gap={18}
      top={6}
      footer={
        <View style={{ gap: 14, paddingHorizontal: 4, paddingBottom: 10 }}>
          <PillButton
            label="Abrir app de e-mail"
            edge="#000"
            onPress={() => openMailApp('app de e-mail', MAIL)}
          />
          <View style={styles.links}>
            {countdown.left > 0 ? (
              <Text style={[text(14, 'SemiBold'), { color: '#aaa9a4' }]}>
                Reenviar em{' '}
                <Text style={{ fontFamily: 'GeistMono-SemiBold' }}>
                  {countdown.label}
                </Text>
              </Text>
            ) : (
              <Pressable accessibilityRole="button" onPress={resend}>
                <Text style={[text(14, 'SemiBold'), { color: PAPER }]}>
                  Reenviar
                </Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={() => router.back()}>
              <Text style={[text(14, 'SemiBold'), { color: PAPER }]}>
                Usar outro e-mail
              </Text>
            </Pressable>
          </View>
        </View>
      }
    >
      <BackButton tone="dark" />
      <View style={{ marginTop: 40 }}>
        <View style={styles.tileShadow} />
        <Float distance={5}>
          <View style={styles.tile}>
            <Icon name="mail" size={52} color={INK} accent={LIVE} />
          </View>
        </Float>
      </View>
      <Title
        lines={[['Confira seu ', 'e-mail']]}
        size={46}
        color={PAPER}
        accentColor={ACID}
      />
      <Text style={[text(16, 'Regular', 1.5), { color: '#d6d3cb' }]}>
        Mandamos o link para{' '}
        <Text style={[text(16, 'Bold', 1.5), { color: PAPER }]}>
          {maskEmail(email)}
        </Text>
        . Ele vale por 30 minutos. Se não aparecer, olhe o spam.
      </Text>
      {notice ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>{notice}</ErrorText>
      ) : null}
      {turnstile.widget}
    </Screen>
  )
}

const styles = StyleSheet.create({
  tile: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tileShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: '#000'
  },
  links: { flexDirection: 'row', gap: 18, justifyContent: 'center' }
})
