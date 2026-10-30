import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SettingsSection, type SettingsTab } from '@/app/configuracoes'
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
  // A lista tem a largura da coluna do aparelho; no dobrável, a metade.
  const listWidth = layout.split
  const right = layout.width - nav.left - nav.right - listWidth - layout.gap
  const column = Math.min(780, right - 56)
  // Dobrável: títulos e respiros menores, como no design (split7).
  const fold = right < 600
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
            {items.map((item, index) => (
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
        <Card soft>
          <View style={styles.rows}>
            {SECTIONS.map((section, index) => {
              const on = section.tab === tab
              return (
                <Pressable
                  key={section.tab}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    if (on) return
                    haptic.select()
                    setTab(section.tab)
                  }}
                  style={({ pressed }) => [
                    styles.section,
                    index > 0 &&
                      !on &&
                      SECTIONS[index - 1]?.tab !== tab && {
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
