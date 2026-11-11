import type { ReactNode, RefObject } from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  FadeIn,
  FadeOut,
  withTiming
} from 'react-native-reanimated'
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
    | 'calendar'
    | 'camera'
    | 'beer'
    | 'gear'
  label: string
  meta?: string
  /** A variação em acid ("▲ 32%", Desempenho do dono). */
  metaHot?: boolean
  /** A linha que o passeio do bar cerca (`useTourTarget`). */
  ref?: RefObject<View | null>
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
  onSettings,
  visitor,
  level,
  head,
  wide
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
  onSettings: () => void
  /** Sem conta (rodada 2, tela 5): o cartão "Sua conta guarda tudo" no topo. */
  visitor?: { onCreate: () => void; onEnter: () => void }
  /** O nível da pessoa ("3 · Boleiro"), de `achievements.mine`. */
  level?: { level: number; name: string }
  /** O topo do menu no lugar do da pessoa (o do bar, rodada 10). */
  head?: ReactNode
  /** Mais largo (o menu do Bar, 340). */
  wide?: boolean
}) {
  const palette = usePalette()
  const nav = useNavInsets()
  const bar = nav.bottom
  const bottom = bar + 10
  // No celular, de borda a borda (14 de cada lado); no tablet em pé e na
  // mesa, 420 de largura sobre a barra, fora das faixas laterais (WEB-491).
  const { width } = useLayout()
  const free = width - nav.left - nav.right
  // Com conta, o menu da rodada 6: 272 de largura, encostado à direita,
  // saindo da aba Você. Sem conta, largo, por causa do cartão da conta.
  const menuWidth = visitor
    ? Math.min(free - 28, 420)
    : Math.min(wide ? 340 : 272, free - 24)
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
            left: visitor
              ? nav.left + (free - menuWidth) / 2
              : nav.left + free - menuWidth - 12
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
              <Text style={[text(14.5, 'Regular', 1.45), { color: '#c9c7c0' }]}>
                Bares salvos, os jogos que você vai ver, o código do balcão e as
                conquistas de cada visita.
              </Text>
              <View style={styles.guardActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={visitor.onCreate}
                  style={[
                    styles.guardButton,
                    styles.guardAcid,
                    { backgroundColor: ACID }
                  ]}
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
          ) : head ? (
            <View
              style={[styles.menuHead, { borderBottomColor: palette.line }]}
            >
              {head}
            </View>
          ) : (
            <View
              style={[styles.menuHead, { borderBottomColor: palette.line }]}
            >
              <View style={styles.menuAvatar}>
                {/* A foto cobre as iniciais quando carrega. */}
                <Text style={[text(16.5, 'Bold', 1.1), { color: INK }]}>
                  {initials}
                </Text>
                {image ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    source={{ uri: image }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text
                  style={[text(15, 'Bold', 1.2), { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                {level ? (
                  <LevelChip level={level.level} name={level.name} />
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Configurações"
                hitSlop={6}
                onPress={onSettings}
                style={[styles.gear, { backgroundColor: palette.line }]}
              >
                <Icon name="gear" size={20} color={palette.ink} />
              </Pressable>
            </View>
          )}
          {items.map((item) => {
            const on = item.key === current
            return (
              <Pressable
                key={item.key}
                ref={item.ref}
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
                  size={22}
                  color={palette.ink}
                  accent={palette.dark ? ACID : palette.accent}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    text(14.5, on ? 'Bold' : 'SemiBold', 1.2),
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
                    <Text style={[styles.mono, { color: INK }]}>
                      {item.badge}
                    </Text>
                  </View>
                ) : item.meta ? (
                  <Text
                    style={[
                      styles.mono,
                      {
                        color: item.metaHot
                          ? palette.dark
                            ? ACID
                            : '#5b6d0c'
                          : palette.muted
                      }
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

/** O nível ("3 · Boleiro", `.lvc`): tinta e acid no claro, invertido no escuro. */
export function LevelChip({ level, name }: { level: number; name: string }) {
  const palette = usePalette()
  const bg = palette.dark ? ACID : INK
  const fg = palette.dark ? INK : ACID
  return (
    <View style={[styles.level, { backgroundColor: bg }]}>
      <View style={[styles.levelNumber, { backgroundColor: fg }]}>
        <Text style={[styles.levelText, { color: bg }]}>{level}</Text>
      </View>
      <Text style={[styles.levelText, { color: fg }]}>{name}</Text>
    </View>
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
    borderRadius: 28,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12
  },
  // `.acc` do redesign: 26 de raio, 20 de respiro, 12 entre as linhas.
  guard: {
    backgroundColor: INK,
    borderRadius: 26,
    padding: 20,
    gap: 12,
    marginBottom: 6
  },
  guardTitle: {
    fontFamily: 'Anton',
    fontSize: 28,
    color: '#f1eee6',
    marginVertical: -6.8
  },
  guardActions: { flexDirection: 'row', gap: 8 },
  guardButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // `.b-acid`: a sombra oliva de 4.
  guardAcid: {
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  guardOutline: { borderWidth: 1.5, borderColor: 'rgba(241,238,230,.3)' },
  accountTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  accountText: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  menuHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    paddingHorizontal: 6,
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: 1
  },
  menuAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  gear: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  level: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingLeft: 3,
    paddingRight: 9,
    borderRadius: 12
  },
  levelNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  levelText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  menuItem: {
    height: 42,
    paddingHorizontal: 8,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
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
