import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Palette } from '@/components/explore'
import { Glass } from '@/components/glass'
import { EASE, haptic } from '@/components/motion'
import { ACID, Icon, INK, text, UpDown } from '@/components/ui'

/*
 * A barra de vidro do torcedor ("02 Navbar glass" da página de componentes):
 * Explorar, Ranking e Você (que abre o menu de vidro, 2c), com a busca com IA
 * no círculo acid à direita. O item ativo mostra o nome; os outros, só o
 * ícone a 78%.
 */

type Tab = 'explore' | 'ranking' | 'you'

export function useTabBarSpace() {
  const insets = useSafeAreaInsets()
  return Math.max(insets.bottom - 8, 14)
}

export function FanTabBar({
  active,
  palette,
  menuOpen,
  onTab,
  onAi
}: {
  active: Tab
  palette: Palette
  menuOpen: boolean
  onTab: (tab: Tab) => void
  onAi: () => void
}) {
  const bottom = useTabBarSpace()
  const tone = palette.dark ? 'dark' : 'light'
  const current: Tab = menuOpen ? 'you' : active
  const item = (tab: Tab, icon: 'map' | 'ranking' | 'you', label: string) => {
    const on = current === tab
    return (
      <Pressable
        key={tab}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={() => {
          haptic.select()
          onTab(tab)
        }}
        style={[
          styles.item,
          on && styles.itemOn,
          on && (palette.dark ? styles.itemOnDark : styles.itemOnLight)
        ]}
      >
        <View
          style={{
            opacity: on ? 1 : 0.78,
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center'
          }}
        >
          <Icon
            name={icon}
            size={24}
            color={palette.ink}
            accent={palette.accent}
          />
          {on ? (
            <Text
              style={[
                text(14, 'Bold', 1.2),
                { color: palette.ink, letterSpacing: -0.14 }
              ]}
            >
              {label}
            </Text>
          ) : null}
          {tab === 'you' ? <UpDown color={palette.ink} /> : null}
        </View>
      </Pressable>
    )
  }
  return (
    <View style={[styles.bar, { bottom }]}>
      <Glass tone={tone} style={styles.pill}>
        {item('explore', 'map', 'Explorar')}
        {item('ranking', 'ranking', 'Ranking')}
        {item('you', 'you', 'Você')}
      </Glass>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Busca com IA"
        onPress={onAi}
        style={({ pressed }) => pressed && { transform: [{ scale: 0.96 }] }}
      >
        <Glass
          tone={tone}
          tint="rgba(201,241,53,.5)"
          interactive
          style={styles.ai}
        >
          <Icon name="sparkle" size={28} color={INK} />
        </Glass>
      </Pressable>
    </View>
  )
}

// --- Menu "Você" (2c) --------------------------------------------------------

export type MenuItem = {
  key: string
  icon: 'you' | 'medal' | 'ticket' | 'fan' | 'star' | 'sliders'
  label: string
  meta?: string
}

// Constantes de módulo: o Reanimated recomeça a entrada se o objeto muda.
const DIM_IN = FadeIn.duration(180)
const DIM_OUT = FadeOut.duration(140)
const MENU_IN = FadeInDown.duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 14 }] })
const MENU_OUT = FadeOut.duration(140)

export function YouMenu({
  palette,
  name,
  initials,
  items,
  onClose,
  onItem,
  onChat,
  onSettings
}: {
  palette: Palette
  name: string
  initials: string
  items: MenuItem[]
  onClose: () => void
  onItem: (item: MenuItem) => void
  onChat: () => void
  onSettings: () => void
}) {
  const bottom = useTabBarSpace() + 64 + 14
  const tone = palette.dark ? 'dark' : 'light'
  return (
    <>
      <Animated.View
        entering={DIM_IN}
        exiting={DIM_OUT}
        style={StyleSheet.absoluteFill}
      >
        <Pressable
          accessibilityLabel="Fechar menu"
          onPress={onClose}
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.dark
                ? 'rgba(10,10,8,.45)'
                : 'rgba(241,238,230,.35)'
            }
          ]}
        />
      </Animated.View>
      <Animated.View
        entering={MENU_IN}
        exiting={MENU_OUT}
        style={[styles.menuWrap, { bottom }]}
      >
        <Glass
          tone={tone}
          tint={palette.dark ? 'rgba(30,30,27,.55)' : 'rgba(255,255,255,.55)'}
          style={styles.menu}
        >
          <View style={[styles.menuHead, { borderBottomColor: palette.line }]}>
            <View style={styles.menuAvatar}>
              <Text style={styles.menuAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[text(16, 'Bold', 1.25), { color: palette.ink }]}
                numberOfLines={1}
              >
                {name}
              </Text>
              <View
                style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}
              >
                <Text
                  style={[text(13, 'Regular', 1.3), { color: palette.muted }]}
                >
                  Torcedor
                </Text>
                <UpDown color={palette.muted} />
              </View>
            </View>
            <RoundButton label="Fale com a gente" tone={tone} onPress={onChat}>
              <Icon name="chat" size={19} color={palette.ink} />
            </RoundButton>
            <RoundButton label="Configurações" tone={tone} onPress={onSettings}>
              <Icon name="gear" size={19} color={palette.ink} />
            </RoundButton>
          </View>
          {items.map((item, index) => {
            const on = index === 0
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => onItem(item)}
                style={({ pressed }) => [
                  styles.menuItem,
                  on &&
                    (palette.dark
                      ? styles.menuItemOnDark
                      : styles.menuItemOnLight),
                  pressed && { opacity: 0.7 }
                ]}
              >
                <Icon
                  name={item.icon}
                  size={23}
                  color={palette.ink}
                  accent={palette.dark ? ACID : palette.accent}
                />
                <Text
                  style={[
                    text(16, on ? 'Bold' : 'Regular', 1.2),
                    { color: palette.ink, flex: 1 }
                  ]}
                >
                  {item.label}
                </Text>
                {item.meta ? (
                  <Text
                    style={[
                      text(12.5, 'Regular', 1.2),
                      { color: palette.muted }
                    ]}
                  >
                    {item.meta}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </Glass>
      </Animated.View>
    </>
  )
}

function RoundButton({
  label,
  tone,
  onPress,
  children
}: {
  label: string
  tone: 'light' | 'dark'
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
    >
      <Glass tone={tone} interactive style={styles.round}>
        {children}
      </Glass>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    zIndex: 40
  },
  pill: {
    flex: 1,
    height: 64,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 2,
    overflow: 'hidden'
  },
  item: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
  itemOn: { flex: 1.75, borderRadius: 26 },
  itemOnLight: {
    backgroundColor: 'rgba(255,255,255,.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.9)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }
  },
  itemOnDark: {
    backgroundColor: 'rgba(255,255,255,.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.22)'
  },
  ai: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  menuWrap: { position: 'absolute', left: 14, right: 14, zIndex: 30 },
  menu: { borderRadius: 32, padding: 8, overflow: 'hidden' },
  menuHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 12,
    marginBottom: 6,
    borderBottomWidth: 1
  },
  menuAvatar: {
    width: 46,
    height: 46,
    borderRadius: 6,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuAvatarText: {
    fontFamily: 'Anton',
    fontSize: 19,
    color: INK,
    marginVertical: -6
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  menuItem: {
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  menuItemOnLight: {
    backgroundColor: 'rgba(255,255,255,.6)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.9)'
  },
  menuItemOnDark: {
    backgroundColor: 'rgba(255,255,255,.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.22)'
  }
})
