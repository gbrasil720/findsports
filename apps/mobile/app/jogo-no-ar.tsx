import { barPath } from '@findsports_oficial/db/bar-slug'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import * as Clipboard from 'expo-clipboard'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-qr-code'
import { HardShadow, Photo } from '@/components/explore'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text, useStatusBar } from '@/components/ui'
import { shortDate } from '@/lib/bar-owner'
import { env } from '@/lib/env'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'

/*
 * O primeiro jogo no ar (rodada 10, tela 6): como o torcedor vê o bar, com o
 * selo do plano, e o QR e o link da página pública para chamar os clientes
 * (WhatsApp, copiar). Depois, completar o perfil em três passos.
 */

export default function JogoNoAr() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const { title, startsAt } = useLocalSearchParams<{
    title?: string
    startsAt?: string
  }>()
  const owner = useOwnerBar()
  const bar = owner.bar
  const [copied, setCopied] = useState(false)
  const link = bar
    ? `${env.EXPO_PUBLIC_SERVER_URL.replace(/\/$/, '')}${barPath(bar)}`
    : ''
  const shown = link.replace(/^https?:\/\//, '')
  const today = startsAt
    ? brasiliaDay(startsAt) === brasiliaDay(Date.now())
    : false
  const when =
    startsAt && today
      ? `hoje ${formatTime(startsAt)}`
      : startsAt
        ? `${shortDate(startsAt).split(' ')[0]?.toLowerCase()} ${formatTime(startsAt)}`
        : ''

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 150,
          paddingHorizontal: 18,
          gap: 16
        }}
      >
        <View style={styles.head}>
          <View style={styles.check}>
            <Icon name="check" size={30} color={INK} />
          </View>
          <View style={{ flex: 1 }} accessible accessibilityRole="header">
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.title, { color: palette.ink }]}
            >
              {title}
            </Text>
            <Text
              style={[
                styles.title,
                { color: palette.dark ? ACID : palette.live }
              ]}
            >
              ESTÁ NO AR
            </Text>
            <Text
              style={[
                text(15, 'Regular', 1.4),
                { color: palette.muted, marginTop: 8 }
              ]}
            >
              {`${when} · já aparece para quem procura o jogo`}
            </Text>
          </View>
        </View>

        <View style={[styles.preview, { backgroundColor: palette.mark }]}>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            ASSIM O TORCEDOR VÊ
          </Text>
          <View>
            <HardShadow color={palette.drop} offset={4} radius={20} />
            <View style={[styles.card, { backgroundColor: palette.card }]}>
              <Photo
                uri={bar?.photoUrl ?? null}
                name={bar?.name ?? ''}
                style={styles.photo}
              />
              <View style={{ flex: 1, gap: 4 }}>
                {owner.planName ? (
                  <View style={styles.plan}>
                    <Text style={styles.planText}>
                      {owner.planName.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
                <Text
                  numberOfLines={1}
                  style={[text(18, 'Bold', 1.2), { color: palette.ink }]}
                >
                  {bar?.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[text(14, 'Regular', 1.3), { color: palette.muted }]}
                >
                  {[title, when].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View>
          <HardShadow color={palette.drop} offset={4} radius={22} />
          <View style={[styles.share, { backgroundColor: palette.card }]}>
            <View style={styles.qr}>
              {link ? (
                <QRCode
                  value={link}
                  size={104}
                  bgColor="#ffffff"
                  fgColor={INK}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={[text(17, 'Bold', 1.25), { color: palette.ink }]}>
                Chame seus clientes
              </Text>
              <Text
                style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
              >
                Quem escanear marca que vai
                {owner.elite ? ' e já recebe o código do balcão' : ''}.
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.link, { color: palette.ink }]}
              >
                {shown}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            style={{ flex: 1 }}
            onPress={() =>
              Share.share({
                message: `${bar?.name} vai passar ${title}${when ? ` (${when})` : ''}. Marca que vai: ${link}`
              })
            }
          >
            <HardShadow color="#7f9a12" offset={4} radius={999} />
            <View style={[styles.button, { backgroundColor: ACID }]}>
              <Icon name="share" size={18} color={INK} />
              <Text style={[text(16, 'Bold', 1.2), { color: INK }]}>
                WhatsApp
              </Text>
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[
              styles.button,
              styles.outline,
              { borderColor: palette.line, flex: 1 }
            ]}
            onPress={async () => {
              await Clipboard.setStringAsync(link)
              haptic.success()
              setCopied(true)
            }}
          >
            <Icon name="link" size={18} color={palette.ink} />
            <Text style={[text(16, 'Bold', 1.2), { color: palette.ink }]}>
              {copied ? 'Copiado' : 'Copiar link'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      <View
        style={[
          styles.foot,
          { paddingBottom: insets.bottom + 10, backgroundColor: palette.bg }
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/completar-perfil')}
        >
          <View style={[styles.cta, { backgroundColor: palette.ink }]}>
            <Text style={[text(18, 'Bold', 1.2), { color: palette.bg }]}>
              Completar o perfil · 3 passos
            </Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace('/casa')}
        >
          <Text
            style={[
              text(15, 'SemiBold', 1.3),
              { color: palette.ink, textDecorationLine: 'underline' }
            ]}
          >
            Ir para Hoje na casa
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  check: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 40,
    textTransform: 'uppercase',
    marginVertical: -9.7
  },
  preview: { borderRadius: 24, padding: 14, gap: 12 },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    alignItems: 'center'
  },
  photo: { width: 80, height: 80, borderRadius: 14 },
  plan: {
    alignSelf: 'flex-start',
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: INK,
    justifyContent: 'center'
  },
  planText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.8,
    color: ACID
  },
  share: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    alignItems: 'center'
  },
  qr: { backgroundColor: '#ffffff', padding: 6, borderRadius: 10 },
  link: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  actions: { flexDirection: 'row', gap: 10 },
  button: {
    height: 52,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  outline: { borderWidth: 1.5 },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 12,
    alignItems: 'stretch'
  },
  cta: {
    height: 58,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
