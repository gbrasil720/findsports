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
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg'
import QRCode from 'react-qr-code'
import { CardBrand } from '@/components/fan-card'
import { haptic, SWAP } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
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
  const _place = [me.data ? `@${me.data.username}` : null, me.data?.city]
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          onPress={() => (tab === 'scan' ? setTab('mine') : router.back())}
          style={[
            styles.round,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Icon name="back" size={20} color={palette.ink} />
        </Pressable>
        {tab === 'mine' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic.select()
              setTab('scan')
              if (!permission?.granted) ask()
            }}
            style={[styles.read, { borderColor: palette.line }]}
          >
            <Icon name="camera" size={16} color={palette.ink} />
            <Text style={[text(14, 'Bold', 1.2), { color: palette.ink }]}>
              Ler um código
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.title, { color: palette.ink }]}>
        {tab === 'mine' ? 'Meu código' : 'Ler um código'}
      </Text>

      {tab === 'mine' ? (
        <Animated.View key="mine" entering={SWAP} style={styles.mine}>
          {/* O cartão no desenho da carteirinha, em tinta nos dois temas. */}
          <View style={styles.card}>
            <View style={styles.dots} pointerEvents="none">
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <Pattern
                    id="convite"
                    width={7}
                    height={7}
                    patternUnits="userSpaceOnUse"
                  >
                    <Circle
                      cx={3.5}
                      cy={3.5}
                      r={1.2}
                      fill="rgba(241,238,230,.09)"
                    />
                  </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#convite)" />
              </Svg>
            </View>
            <View style={styles.cardTop}>
              <CardBrand />
              <Text style={styles.cardKicker}>{'CONVITE\nDE AMIZADE'}</Text>
            </View>
            <Text
              style={styles.cardName}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {(session.data?.user.name ?? '').toLocaleUpperCase('pt-BR')}
            </Text>
            <View style={styles.qr}>
              {code ? (
                <QRCode
                  value={inviteUrl(code)}
                  size={156}
                  bgColor="#ffffff"
                  fgColor={INK}
                />
              ) : (
                <View style={{ width: 156, height: 156 }} />
              )}
            </View>
            <Text style={styles.code}>{code ?? ' '}</Text>
            {code ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copiar o link"
                hitSlop={8}
                onPress={async () => {
                  await Clipboard.setStringAsync(inviteUrl(code))
                  haptic.success()
                  soon.show('Link copiado')
                }}
                style={styles.linkRow}
              >
                <Text style={styles.link} numberOfLines={1}>
                  {inviteUrl(code).replace(/^https?:\/\/(www\.)?/, '')} ·{' '}
                </Text>
                <Icon name="link" size={14} color="#aaa9a4" accent={LIVE} />
                <Text style={styles.link}> copiar</Text>
              </Pressable>
            ) : null}
          </View>
          <Text
            style={[
              text(14, 'Regular', 1.45),
              styles.note,
              { color: palette.muted }
            ]}
          >
            Quem abrir o link sem conta entra já como seu amigo ao criar a
            conta.
          </Text>
          {code ? (
            <View style={{ alignSelf: 'stretch' }}>
              <PillButton
                label="Compartilhar convite"
                leading="share"
                height={56}
                onPress={() => {
                  haptic.select()
                  Share.share({ message: inviteMessage(code) })
                }}
              />
            </View>
          ) : null}
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

      {soon.toast}
    </View>
  )
}

const styles = StyleSheet.create({
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  read: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5
  },
  // Anton 44: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 44,
    textTransform: 'uppercase',
    marginVertical: -10.7
  },
  dots: { ...StyleSheet.absoluteFill, borderRadius: 24, overflow: 'hidden' },
  cardTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  cardKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    letterSpacing: 0.9,
    color: '#c9c7c0',
    textAlign: 'right'
  },
  cardName: {
    alignSelf: 'stretch',
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    marginVertical: -7.3
  },
  linkRow: { flexDirection: 'row', alignItems: 'center' },
  link: { fontFamily: 'GeistMono-SemiBold', fontSize: 12, color: '#aaa9a4' },
  screen: { flex: 1, paddingHorizontal: 16, gap: 16 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
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
    alignSelf: 'stretch',
    padding: 16,
    borderRadius: 24,
    backgroundColor: INK,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0
  },
  qr: { padding: 16, borderRadius: 20, backgroundColor: '#fff' },
  code: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 24,
    letterSpacing: 2.4,
    color: ACID
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
