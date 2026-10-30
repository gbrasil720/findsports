import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  LeaveAccount,
  SettingsSection,
  type SettingsTab
} from '@/app/configuracoes'
import { Card } from '@/components/card'
import { useLayout, useNavInsets } from '@/components/layout'
import { haptic } from '@/components/motion'
import type { MenuItem } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import {
  ACCENT,
  ACID,
  Icon,
  INK,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { APP_VERSION, HELP_URL } from '@/lib/env'
import { markedToday, yourBarCount } from '@/lib/profile'
import { trpc } from '@/lib/trpc'

/*
 * O "Você" do tablet deitado e do dobrável aberto (regra 02 da T5, WEB-491):
 * o menu e as quatro seções das Configurações à esquerda, a seção escolhida
 * à direita, sem a barra de vidro do topo, como os ajustes do sistema. No
 * celular e no tablet em pé o "Você" segue sendo o menu de vidro (2c).
 */

const SECTIONS: {
  tab: SettingsTab
  icon: 'sliders' | 'bell' | 'person' | 'eye'
  title: string
  sub: string
}[] = [
  {
    tab: 'preferencias',
    icon: 'sliders',
    title: 'Preferências',
    sub: 'Esportes, times e raio'
  },
  {
    tab: 'avisos',
    icon: 'bell',
    title: 'Avisos',
    sub: 'Jogos, amigos e silenciar no jogo'
  },
  {
    tab: 'conta',
    icon: 'person',
    title: 'Conta',
    sub: 'E-mail, senha e sessões'
  },
  {
    tab: 'privacidade',
    icon: 'eye',
    title: 'Privacidade',
    sub: 'Quem vê onde você foi'
  }
]

export function YouPanel({
  name,
  initials,
  image,
  items,
  tab: asked,
  onProfile,
  onItem
}: {
  name: string
  initials: string
  image?: string | null
  /** Os itens do menu "Você", sem Perfil (o cartão) e Preferências (a seção). */
  items: MenuItem[]
  /** A seção pedida pela rota (`/voce?aba=conta`, a engrenagem do Perfil). */
  tab?: SettingsTab
  onProfile: () => void
  onItem: (item: MenuItem) => void
}) {
  const palette = usePalette()
  useStatusBar('auto')
  const insets = useSafeAreaInsets()
  const nav = useNavInsets()
  const layout = useLayout()
  const level = useQuery(trpc.achievements.mine.queryOptions()).data?.level
  const [tab, setTab] = useState<SettingsTab>(asked ?? 'preferencias')
  // Pedida de novo com outra seção.
  const [seen, setSeen] = useState(asked)
  if (asked !== seen) {
    setSeen(asked)
    if (asked) setTab(asked)
  }
  const router = useRouter()
  // Dobrável aberto: cada lado numa metade, títulos e respiros menores
  // (split7); tablet: a lista com 380 (tabLand7).
  const fold = layout.width - nav.left - nav.right < 1000
  const listWidth = fold ? layout.split : 380
  const right = layout.width - nav.left - nav.right - listWidth - layout.gap
  const column = Math.min(780, right - (fold ? 32 : 56))
  // Os números do design ao lado de cada item: Seus bares, jogos de hoje,
  // amigos. Comunidades não existem: "em breve".
  const visits = useQuery(trpc.attendance.visits.queryOptions())
  const saved = useQuery(trpc.pubs.getFavorites.queryOptions())
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const friends = useQuery(trpc.friends.overview.queryOptions())
  const today = markedToday(
    (mine.data ?? []).filter((game) => !game.ended),
    Date.now()
  )
  const pick = (key: string) => items.find((item) => item.key === key)
  const games = pick('jogos')
  const amigos = pick('amigos')
  const list: MenuItem[] = [
    {
      key: 'seus-bares',
      icon: 'fan',
      label: 'Seus bares',
      soon: '',
      meta: visits.data
        ? String(yourBarCount(visits.data, saved.data ?? []))
        : undefined,
      open: () => router.navigate('/favoritos')
    },
    ...(games ? [{ ...games, meta: today ? `${today} hoje` : undefined }] : []),
    ...(amigos
      ? [
          {
            ...amigos,
            meta: friends.data ? String(friends.data.friends.length) : undefined
          }
        ]
      : []),
    {
      key: 'comunidades',
      icon: 'crew',
      label: 'Comunidades',
      soon: 'As comunidades chegam em breve',
      meta: 'em breve'
    },
    ...items.filter((item) => item.key !== 'jogos' && item.key !== 'amigos')
  ]
  // Tablet alto: Ajuda, Termos, Privacidade e a versão no fim da lista.
  const tall = !fold && layout.height > 900
  const accent = palette.dark ? ACID : ACCENT
  const current = SECTIONS.find((s) => s.tab === tab) ?? SECTIONS[0]

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.screen,
        { backgroundColor: palette.bg, left: nav.left, right: nav.right }
      ]}
    >
      <ScrollView
        style={{ width: listWidth, flexGrow: 0 }}
        contentContainerStyle={[
          styles.list,
          {
            paddingTop: insets.top + 10,
            paddingBottom: nav.bottom + 24,
            paddingHorizontal: fold ? 16 : 20
          }
        ]}
      >
        <Text
          style={[
            styles.display,
            { fontSize: fold ? 32 : 40, color: palette.ink }
          ]}
        >
          Você
        </Text>
        <Card soft>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, abrir o perfil`}
            onPress={onProfile}
            style={({ pressed }) => [styles.me, pressed && { opacity: 0.6 }]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
              {image ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: image }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={[text(16, 'Bold'), { color: palette.ink }]}
              >
                {name}
              </Text>
              <Text
                numberOfLines={1}
                style={[text(12.5), { color: palette.muted }]}
              >
                {level ? `Nível ${level.level} · ${level.name}` : 'Torcedor'}
              </Text>
            </View>
            <Icon name="next" size={12} color={palette.muted} />
          </Pressable>
        </Card>
        <Text style={[styles.heading, { color: accent }]}>Você</Text>
        <Card soft>
          <View style={styles.rows}>
            {list.map((item, index) => (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => onItem(item)}
                style={({ pressed }) => [
                  styles.item,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: palette.line
                  },
                  pressed && { opacity: 0.6 }
                ]}
              >
                <Icon
                  name={item.icon}
                  size={22}
                  color={palette.ink}
                  accent={accent}
                />
                <Text
                  numberOfLines={1}
                  style={[text(15, 'Bold'), { color: palette.ink, flex: 1 }]}
                >
                  {item.label}
                </Text>
                {item.badge ? (
                  <View style={styles.badge}>
                    <Text style={[text(12, 'Bold', 1.2), { color: INK }]}>
                      {item.badge}
                    </Text>
                  </View>
                ) : item.meta ? (
                  <Text style={[styles.meta, { color: palette.muted }]}>
                    {item.meta}
                  </Text>
                ) : null}
                <Icon name="next" size={12} color={palette.muted} />
              </Pressable>
            ))}
          </View>
        </Card>
        <Text style={[styles.heading, { color: accent }]}>Configurações</Text>
        <SettingsList current={tab} onPick={setTab} />
        <LeaveAccount />
        {tall ? (
          <>
            <Card soft>
              <View style={styles.rows}>
                {(
                  [
                    [
                      'chat',
                      'Ajuda e contato',
                      () => Linking.openURL(HELP_URL)
                    ],
                    [
                      'doc',
                      'Termos de uso',
                      () =>
                        router.push({
                          pathname: '/legal',
                          params: { doc: 'termos' }
                        })
                    ],
                    [
                      'shield',
                      'Privacidade da Onside',
                      () =>
                        router.push({
                          pathname: '/legal',
                          params: { doc: 'privacidade' }
                        })
                    ]
                  ] as const
                ).map(([icon, label, onPress], index) => (
                  <Pressable
                    key={label}
                    accessibilityRole="link"
                    onPress={() => {
                      Promise.resolve(onPress()).catch(() => {})
                    }}
                    style={({ pressed }) => [
                      styles.link,
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: palette.line
                      },
                      pressed && { opacity: 0.6 }
                    ]}
                  >
                    <Icon
                      name={icon}
                      size={20}
                      color={palette.ink}
                      accent={accent}
                    />
                    <Text
                      style={[
                        text(14.5, 'SemiBold'),
                        { color: palette.ink, flex: 1 }
                      ]}
                    >
                      {label}
                    </Text>
                    <Icon name="next" size={12} color={palette.muted} />
                  </Pressable>
                ))}
              </View>
            </Card>
            <Text style={[styles.version, { color: palette.muted }]}>
              Onside {APP_VERSION}
            </Text>
          </>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.detail,
          {
            marginLeft: layout.gap,
            backgroundColor: palette.dark ? '#161613' : '#ebe8df'
          }
        ]}
      >
        <ScrollView
          // Trocar de seção volta ao topo dela.
          key={tab}
          contentContainerStyle={{
            alignItems: 'center',
            paddingTop: insets.top + 10,
            paddingBottom: nav.bottom + 32
          }}
        >
          <View style={[styles.body, { width: column }]}>
            <Text
              accessibilityRole="header"
              style={[
                styles.display,
                { fontSize: fold ? 30 : 40, color: palette.ink }
              ]}
            >
              {current.title}
            </Text>
            <SettingsSection
              tab={tab}
              width={column}
              panel={fold ? 'fold' : 'tablet'}
              mapHeight={
                column > 620 ? (layout.height > 900 ? 300 : 200) : undefined
              }
            />
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

/**
 * As quatro seções das Configurações: à esquerda do "Você" deitado, com a
 * aberta marcada, e no Perfil do tablet em pé, como atalho (WEB-491).
 */
export function SettingsList({
  current,
  onPick
}: {
  current?: SettingsTab
  onPick: (tab: SettingsTab) => void
}) {
  const palette = usePalette()
  const accent = palette.dark ? ACID : ACCENT
  return (
    <Card soft>
      <View style={styles.rows}>
        {SECTIONS.map((section, index) => {
          const on = section.tab === current
          return (
            <Pressable
              key={section.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return
                haptic.select()
                onPick(section.tab)
              }}
              style={({ pressed }) => [
                styles.section,
                index > 0 &&
                  !on &&
                  SECTIONS[index - 1]?.tab !== current && {
                    borderTopWidth: 1,
                    borderTopColor: palette.line
                  },
                on && [
                  styles.sectionOn,
                  {
                    backgroundColor: palette.dark ? '#262621' : '#fff',
                    borderColor: palette.dark ? 'rgba(241,238,230,.6)' : INK
                  }
                ],
                pressed && !on && { opacity: 0.6 }
              ]}
            >
              <Icon
                name={section.icon}
                size={22}
                color={palette.ink}
                accent={accent}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                  {section.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[text(12.5), { color: palette.muted }]}
                >
                  {section.sub}
                </Text>
              </View>
              <Icon name="next" size={12} color={palette.muted} />
            </Pressable>
          )
        })}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  screen: { flexDirection: 'row' },
  list: { gap: 12 },
  display: {
    fontFamily: 'Anton',
    textTransform: 'uppercase',
    letterSpacing: -0.6
  },
  heading: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: -2
  },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 5,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  avatarText: {
    fontFamily: 'Anton',
    fontSize: 22,
    color: ACID,
    marginVertical: -6
  },
  rows: { paddingHorizontal: 14 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 50,
    paddingVertical: 11
  },
  meta: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 },
  version: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    textAlign: 'center'
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: ACID
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingVertical: 11
  },
  // A seção aberta: o cartão branco de borda de tinta e sombra acid (sel7).
  sectionOn: {
    marginHorizontal: -8,
    marginVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  detail: { flex: 1 },
  body: { gap: 14 }
})
