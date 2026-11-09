import { Image, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  FadeIn,
  FadeOut,
  withTiming
} from 'react-native-reanimated'
import { Glass } from '@/components/glass'
import { useLayout, useNavInsets } from '@/components/layout'
import { EASE } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text } from '@/components/ui'

/*
 * O menu "Você" (2c do design): vidro acima da barra de abas, com o
 * torcedor no topo e os atalhos da conta. A barra em si é a nativa do iOS
 * (`NativeTabs`, em `app/(fan)/_layout.tsx`).
 */

/**
 * Espaço que a barra de abas ocupa no rodapé: a nativa (iOS 26) ou a
 * flutuante do iPad; nas faixas laterais (Duo, Galaxy Tab), só a área segura.
 */
export const useTabBarSpace = () => useNavInsets().bottom

// --- Menu "Você" (2c) --------------------------------------------------------

export type MenuItem = {
  key: string
  icon:
    | 'fan'
    | 'crew'
    | 'you'
    | 'medal'
    | 'ticket'
    | 'sparkle'
    | 'people'
    | 'ranking'
    | 'star'
    | 'sliders'
    | 'pin'
    | 'map'
    | 'doc'
  label: string
  meta?: string
  /** Sem conta (rodada 2, tela 5): o item fica à vista com "com conta". */
  account?: boolean
  /** O selo acid do design ("5 novos"). */
  badge?: string
  /** O aviso enquanto a tela não existe. */
  soon: string
  /** A tela, quando ela existe. */
  open?: () => void
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
  name,
  initials,
  image,
  items,
  current,
  onClose,
  onItem,
  onChat,
  onSettings,
  visitor
}: {
  name: string
  initials: string
  /** A foto do perfil (WEB-419), no lugar das iniciais. */
  image?: string | null
  items: MenuItem[]
  /** O item da tela aberta sob o menu (Perfil, Conquistas...); nenhum no Explorar. */
  current?: string
  onClose: () => void
  onItem: (item: MenuItem) => void
  onChat: () => void
  onSettings: () => void
  /** Sem conta (rodada 2, tela 5): o cartão "Sua conta guarda tudo" no topo. */
  visitor?: { onCreate: () => void; onEnter: () => void }
}) {
  const palette = usePalette()
  const nav = useNavInsets()
  const bar = nav.bottom
  const bottom = bar + 10
  // No celular, de borda a borda (14 de cada lado); no tablet em pé e na
  // mesa, 420 de largura sobre a barra, fora das faixas laterais (WEB-491).
  const { width } = useLayout()
  const free = width - nav.left - nav.right
  const menuWidth = Math.min(free - 28, 420)
  const tone = palette.dark ? 'dark' : 'light'
  return (
    <>
      {/* O escurecido para acima da barra: tocar numa aba com o menu aberto
          vai para a aba, não só fecha o menu. */}
      <Animated.View
        entering={DIM_IN}
        exiting={DIM_OUT}
        style={[StyleSheet.absoluteFill, { bottom: bar }]}
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
        style={[
          styles.menuWrap,
          {
            bottom,
            width: menuWidth,
            left: nav.left + (free - menuWidth) / 2
          }
        ]}
      >
        {/* Peça sólida, não vidro (decisão do vidro, rodada 2): o vidro é
            só do sistema, a barra de abas. */}
        <View
          style={[
            styles.menu,
            {
              backgroundColor: palette.card,
              borderColor: palette.line,
              shadowColor: '#000'
            }
          ]}
        >
          {visitor ? (
            <View style={styles.guard}>
              <Text style={styles.guardTitle}>SUA CONTA GUARDA TUDO</Text>
              <Text style={[text(13.5, 'Regular', 1.4), { color: '#cfccc4' }]}>
                Bares salvos, os jogos que você vai ver, o código do balcão e as
                conquistas de cada visita.
              </Text>
              <View style={styles.guardActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={visitor.onCreate}
                  style={[styles.guardButton, { backgroundColor: ACID }]}
                >
                  <Text style={[text(14, 'Bold', 1.2), { color: INK }]}>
                    Criar conta grátis
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={visitor.onEnter}
                  style={[styles.guardButton, styles.guardOutline]}
                >
                  <Text style={[text(14, 'Bold', 1.2), { color: '#f1eee6' }]}>
                    Já tenho conta
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View
              style={[styles.menuHead, { borderBottomColor: palette.line }]}
            >
              <View style={styles.menuAvatar}>
                {/* A foto cobre as iniciais quando carrega. */}
                <Text style={styles.menuAvatarText}>{initials}</Text>
                {image ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    source={{ uri: image }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[text(16, 'Bold', 1.25), { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                {/* Sem as setas do design (⇅): trocar para o perfil de bar não
                  existe no app, o lado do bar é só no site. */}
                <Text
                  style={[text(13, 'Regular', 1.3), { color: palette.muted }]}
                >
                  Torcedor
                </Text>
              </View>
              <RoundButton
                label="Fale com a gente"
                tone={tone}
                onPress={onChat}
              >
                <Icon name="chat" size={19} color={palette.ink} />
              </RoundButton>
              <RoundButton
                label="Configurações"
                tone={tone}
                onPress={onSettings}
              >
                <Icon name="gear" size={19} color={palette.ink} />
              </RoundButton>
            </View>
          )}
          {items.map((item) => {
            const on = item.key === current
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
                {item.account ? (
                  <View
                    style={[
                      styles.accountTag,
                      { backgroundColor: palette.mark }
                    ]}
                  >
                    <Text
                      style={[styles.accountText, { color: palette.muted }]}
                    >
                      COM CONTA
                    </Text>
                  </View>
                ) : item.badge ? (
                  <View style={styles.badge}>
                    <Text style={[text(12.5, 'Bold', 1.2), { color: INK }]}>
                      {item.badge}
                    </Text>
                  </View>
                ) : item.meta ? (
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
        </View>
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
    zIndex: 30,
    transformOrigin: '62% 100%'
  },
  menu: {
    borderRadius: 32,
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12
  },
  guard: {
    backgroundColor: INK,
    borderRadius: 24,
    padding: 16,
    gap: 10,
    marginBottom: 6
  },
  guardTitle: {
    fontFamily: 'Anton',
    fontSize: 24,
    color: '#f1eee6',
    marginVertical: -6
  },
  guardActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  guardButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center'
  },
  guardOutline: { borderWidth: 1.5, borderColor: 'rgba(241,238,230,.35)' },
  accountTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  accountText: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
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
    justifyContent: 'center',
    overflow: 'hidden'
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
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: ACID
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
