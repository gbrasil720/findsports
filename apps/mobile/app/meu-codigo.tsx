import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Clipboard from 'expo-clipboard'
import { type Href, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Alert,
  Linking,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-qr-code'
import { usePalette } from '@/components/explore'
import { Avatar } from '@/components/friends'
import { Glass } from '@/components/glass'
import { haptic, SWAP } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  MUTED,
  PAPER,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { inviteMessage, inviteUrl } from '@/lib/invite'
import { trpc } from '@/lib/trpc'

/** O código num QR lido: o link de convite ou o código puro. */
const codeFromScan = (data: string) =>
  data.match(/\/convite\/([A-Za-z0-9-]+)/)?.[1] ??
  (/^[A-Za-z]{2}-\d{4}$/.test(data.trim()) ? data.trim() : null)

/**
 * Meu código (11c do design): o cartão com o QR do seu link de convite e a
 * aba de escanear o de outra pessoa. Ler um código abre o perfil dela, com o
 * "Adicionar".
 */
export default function MyCode() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  const queryClient = useQueryClient()
  useStatusBar('auto')
  const session = authClient.useSession()
  const me = useQuery(trpc.friends.me.queryOptions())
  const [tab, setTab] = useState<'mine' | 'scan'>('mine')
  const [permission, ask] = useCameraPermissions()
  // Um QR lido dispara várias leituras seguidas: só a primeira vale.
  const reading = useRef(false)

  const openCode = async (code: string, via: 'code') => {
    try {
      const person = await queryClient.fetchQuery(
        trpc.friends.byCode.queryOptions({ code })
      )
      if (!person) {
        haptic.error()
        Alert.alert('Código não encontrado', 'Confira e tente de novo.')
        return
      }
      haptic.success()
      if (person.relation === 'self') return soon.show('Esse é o seu código')
      router.push(`/amigo/${person.id}?via=${via}` as Href)
    } finally {
      reading.current = false
    }
  }
  const typeCode = () =>
    Alert.prompt(
      'Código de amigo',
      'O que aparece embaixo do QR, como GB-4821.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Buscar',
          onPress: (code?: string) => code && openCode(code, 'code')
        }
      ]
    )

  const code = me.data?.friendCode
  const place = [me.data ? `@${me.data.username}` : null, me.data?.city]
    .filter(Boolean)
    .join(' · ')

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg, paddingTop: insets.top + 8 }
      ]}
    >
      <View style={styles.head}>
        <BackButton />
        <Title lines={[['Meu código']]} size={32} color={palette.ink} />
      </View>

      <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.tabs}>
        {(
          [
            ['mine', 'Meu código'],
            ['scan', 'Escanear']
          ] as const
        ).map(([key, label]) => {
          const on = key === tab
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return
                haptic.select()
                setTab(key)
                if (key === 'scan' && !permission?.granted) ask()
              }}
              style={[
                styles.tab,
                on && [
                  styles.tabOn,
                  {
                    backgroundColor: palette.dark
                      ? 'rgba(255,255,255,.14)'
                      : '#fff'
                  }
                ]
              ]}
            >
              <Text
                style={[
                  text(14, on ? 'Bold' : 'Regular', 1.2),
                  { color: on ? palette.ink : palette.muted }
                ]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </Glass>

      {tab === 'mine' ? (
        <Animated.View key="mine" entering={SWAP} style={styles.mine}>
          <View style={[styles.card, { shadowColor: ACID }]}>
            <View style={styles.who}>
              <Avatar
                id={session.data?.user.id ?? ''}
                name={session.data?.user.name ?? ''}
                size={48}
                palette={{ ...palette, dark: false }}
                me
              />
              <View style={{ flex: 1 }}>
                <Text style={[text(17, 'Bold', 1.25), { color: INK }]}>
                  {session.data?.user.name}
                </Text>
                <Text style={[text(13), { color: MUTED }]}>{place}</Text>
              </View>
            </View>
            <View style={styles.qr}>
              {code ? (
                <QRCode
                  value={inviteUrl(code)}
                  size={176}
                  bgColor="#ffffff"
                  fgColor={INK}
                />
              ) : (
                <View style={{ width: 176, height: 176 }} />
              )}
            </View>
            <Text style={styles.code}>{code ?? ' '}</Text>
          </View>
          <Text
            style={[
              text(14, 'Regular', 1.45),
              styles.note,
              { color: palette.dark ? '#d6d3cb' : palette.muted }
            ]}
          >
            Quem escanear manda um pedido de amizade. Você aprova antes de virar
            amigo.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View key="scan" entering={SWAP} style={styles.scan}>
          {permission?.granted ? (
            <View style={styles.camera}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (reading.current) return
                  const found = codeFromScan(data)
                  if (!found) return
                  reading.current = true
                  openCode(found, 'code')
                }}
              />
              <View style={styles.frame} pointerEvents="none" />
            </View>
          ) : (
            <View style={styles.denied}>
              <Icon name="camera" size={30} color={palette.ink} />
              <Text
                style={[
                  text(15, 'Regular', 1.45),
                  { color: palette.ink, textAlign: 'center' }
                ]}
              >
                {permission?.canAskAgain === false
                  ? 'A câmera está bloqueada para a Onside. Libere nos Ajustes do celular para ler o código.'
                  : 'Para ler o código de um amigo, a Onside precisa da câmera.'}
              </Text>
              <PillButton
                label={
                  permission?.canAskAgain === false
                    ? 'Abrir Ajustes'
                    : 'Permitir câmera'
                }
                onPress={() =>
                  permission?.canAskAgain === false
                    ? Linking.openSettings()
                    : ask()
                }
              />
            </View>
          )}
          <Pressable accessibilityRole="button" hitSlop={10} onPress={typeCode}>
            <Text
              style={[
                text(14, 'Bold'),
                styles.typeLink,
                { color: palette.ink }
              ]}
            >
              Digitar o código
            </Text>
          </Pressable>
        </Animated.View>
      )}

      {tab === 'mine' && code ? (
        <View style={[styles.dock, { bottom: insets.bottom + 14 }]}>
          <Pressable
            accessibilityRole="button"
            style={{ flex: 1 }}
            onPress={async () => {
              await Clipboard.setStringAsync(inviteUrl(code))
              haptic.success()
              soon.show('Link copiado')
            }}
          >
            <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.copy}>
              <Icon
                name="link"
                size={18}
                color={palette.ink}
                accent={palette.accent}
              />
              <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                Copiar link
              </Text>
            </Glass>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PillButton
              label="Compartilhar"
              leading="share"
              height={52}
              onPress={() => {
                haptic.select()
                Share.share({ message: inviteMessage(code) })
              }}
            />
          </View>
        </View>
      ) : null}
      {soon.toast}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 24 },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabOn: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }
  },
  mine: { alignItems: 'center', gap: 16, paddingTop: 8 },
  card: {
    width: 300,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderRadius: 10,
    backgroundColor: PAPER,
    alignItems: 'center',
    gap: 14,
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 0
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'stretch'
  },
  qr: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)'
  },
  code: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 22,
    letterSpacing: 1.8,
    color: INK
  },
  note: { textAlign: 'center', maxWidth: 320 },
  scan: { flex: 1, gap: 16, alignItems: 'center' },
  camera: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center'
  },
  frame: {
    width: '62%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: ACID
  },
  denied: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 40,
    paddingHorizontal: 12
  },
  typeLink: { textDecorationLine: 'underline' },
  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 10
  },
  copy: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  }
})
