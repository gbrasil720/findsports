import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  FadeIn,
  FadeOut,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Palette } from '@/components/explore'
import { Glass } from '@/components/glass'
import { EASE } from '@/components/motion'
import { ACID, Icon, INK, text, UpDown } from '@/components/ui'

/*
 * O menu "Você" (2c do design): vidro acima da barra de abas, com o
 * torcedor no topo e os atalhos da conta. A barra em si é a nativa do iOS
 * (`NativeTabs`, em `app/(fan)/_layout.tsx`).
 */

/** Espaço que a barra de abas nativa (iOS 26) ocupa no rodapé. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets()
  return insets.bottom + 62
}

// --- Menu "Você" (2c) --------------------------------------------------------

export type MenuItem = {
  key: string
  icon: 'you' | 'medal' | 'ticket' | 'ranking' | 'star' | 'sliders'
  label: string
  meta?: string
  /** O aviso enquanto a tela não existe. */
  soon: string
}

// Constantes de módulo: o Reanimated recomeça a entrada se o objeto muda.
const DIM_IN = FadeIn.duration(180).easing(EASE)
const DIM_OUT = FadeOut.duration(140)
// O menu é vidro, e vidro some com opacidade animada (o GlassView não
// desenha a meio caminho): ele entra só subindo e crescendo, nunca
// aparecendo; e sai de uma vez, com o fundo escurecido saindo por ele.
const MENU_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 18 }, { scale: 0.97 }] },
    animations: {
      transform: [
        { translateY: withTiming(0, { duration: 220, easing: EASE }) },
        { scale: withTiming(1, { duration: 220, easing: EASE }) }
      ]
    }
  }
}

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
  const bottom = useTabBarSpace() + 10
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
      <Animated.View entering={MENU_IN} style={[styles.menuWrap, { bottom }]}>
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
                  // O toque acende o mesmo fundo do item em destaque.
                  (on || pressed) &&
                    (palette.dark
                      ? styles.menuItemOnDark
                      : styles.menuItemOnLight)
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
  // Cresce da aba "Você" (terceira da barra), não do próprio centro.
  menuWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 30,
    transformOrigin: '62% 100%'
  },
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
    minHeight: 52,
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
