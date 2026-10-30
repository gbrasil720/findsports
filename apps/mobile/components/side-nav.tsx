import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from '@/components/glass'
import { NAV, useLayout } from '@/components/layout'
import { usePalette } from '@/components/theme'
import { ACCENT, ACID, Icon, INK, PAPER, Text, text } from '@/components/ui'
import type { NavKind } from '@/lib/layout'

/*
 * A navegação fora do celular (regras 01, 03, 04 e 04b da T1): a barra
 * flutuante embaixo (iPad, dobrável aberto), a faixa da direita (iPhone Duo) e
 * o rail à esquerda (Galaxy Tab). As abas continuam as da `NativeTabs`, com a
 * barra nativa escondida: trocar de aparelho não remonta nada.
 */

export type NavTab = 'explore' | 'favoritos' | 'voce'

const TABS: { key: NavTab; icon: 'map' | 'fan' | 'you'; label: string }[] = [
  { key: 'explore', icon: 'map', label: 'Explorar' },
  { key: 'favoritos', icon: 'fan', label: 'Bares' },
  { key: 'voce', icon: 'you', label: 'Você' }
]

type Props = {
  kind: Exclude<NavKind, 'tabs' | 'none'>
  current: NavTab
  onTab: (tab: NavTab) => void
  onAi: () => void
  /** Atalhos do rail (Galaxy Tab): Meus jogos, Conquistas, Avisos, Perfil. */
  onShortcut: (to: 'jogos' | 'conquistas' | 'avisos' | 'perfil') => void
  initials: string
  /** No dobrável aberto, a barra fica na metade do mapa. */
  left?: number
}

export function SideNav(props: Props) {
  if (props.kind === 'duoRail') return <DuoRail {...props} />
  if (props.kind === 'rail') return <TabRail {...props} />
  return <FloatNav {...props} />
}

/**
 * O centro do botão da IA na tela, para o primeiro acesso (4o) cercá-lo. Na
 * barra nativa do iOS 26, medido no iPhone 16e (52 pt dos cantos).
 */
export function useAiButtonCenter() {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const layout = useLayout()
  if (layout.nav === 'duoRail')
    return { x: width - 10 - 31, y: height - insets.bottom - 24 - 29 }
  if (layout.nav === 'rail') return { x: 10 + 42, y: insets.top + 8 + 14 + 29 }
  if (layout.nav === 'float') {
    // Barra (3 abas de 96, 2 vãos de 2, 5 de cada lado) + 10 + o círculo.
    const group = 3 * 96 + 2 * 2 + 10 + 10 + NAV.float.height
    // Só o Explorar põe a barra sobre o mapa; o primeiro acesso só aparece nele.
    const left = layout.kind === 'split' ? layout.split + layout.gap : 0
    const mid = (left + width) / 2
    return {
      x: mid + group / 2 - NAV.float.height / 2,
      y: height - insets.bottom - NAV.float.gap - NAV.float.height / 2
    }
  }
  return { x: width - 52, y: height - 52 }
}

function useTone() {
  const palette = usePalette()
  return {
    palette,
    tone: palette.dark ? ('dark' as const) : ('light' as const),
    on: palette.dark ? ACID : ACCENT,
    onBg: palette.dark ? 'rgba(255,255,255,.12)' : 'rgba(18,18,15,.07)'
  }
}

function TabButton({
  tab,
  selected,
  onPress,
  style,
  label = 11
}: {
  tab: (typeof TABS)[number]
  selected: boolean
  onPress: () => void
  style: object
  label?: number
}) {
  const { palette, on, onBg } = useTone()
  const color = selected ? on : palette.ink
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      style={[style, selected ? { backgroundColor: onBg } : null]}
    >
      <Icon name={tab.icon} size={22} color={color} />
      <Text
        style={[text(label, selected ? 'Bold' : 'SemiBold', 1.2), { color }]}
      >
        {tab.label}
      </Text>
    </Pressable>
  )
}

function AiButton({
  size,
  radius,
  onPress
}: {
  size: number
  radius?: number
  onPress: () => void
}) {
  const { tone } = useTone()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Busca com IA"
      onPress={onPress}
    >
      <Glass
        tone={tone}
        interactive
        tint="rgba(201,241,53,.6)"
        style={[
          styles.center,
          { width: size, height: size, borderRadius: radius ?? size / 2 }
        ]}
      >
        <Icon name="sparkle" size={Math.round(size * 0.42)} color={INK} />
      </Glass>
    </Pressable>
  )
}

/** iPad e dobrável aberto: a barra no rodapé, centralizada (03, 04b). */
function FloatNav({ current, onTab, onAi, left = 0 }: Props) {
  const insets = useSafeAreaInsets()
  const { tone } = useTone()
  const { height, gap } = NAV.float
  return (
    <View
      pointerEvents="box-none"
      style={[styles.floatWrap, { left, bottom: insets.bottom + gap }]}
    >
      <Glass
        tone={tone}
        style={[styles.floatBar, { height, borderRadius: height / 2 }]}
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            selected={current === tab.key}
            onPress={() => onTab(tab.key)}
            style={[styles.floatTab, { height: height - 10 }]}
          />
        ))}
      </Glass>
      <AiButton size={height} onPress={onAi} />
    </View>
  )
}

/** iPhone Duo: abas, IA e status na faixa da direita (01). */
function DuoRail({ current, onTab, onAi }: Props) {
  const insets = useSafeAreaInsets()
  const { tone } = useTone()
  return (
    <View
      pointerEvents="box-none"
      style={[styles.duoWrap, { bottom: insets.bottom + 24 }]}
    >
      <Glass tone={tone} style={styles.duoBar}>
        {TABS.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            selected={current === tab.key}
            onPress={() => onTab(tab.key)}
            style={styles.duoTab}
            label={9.5}
          />
        ))}
      </Glass>
      <AiButton size={58} onPress={onAi} />
    </View>
  )
}

/** Galaxy Tab: o rail do Material 3, com a IA no lugar do FAB (04). */
function TabRail({ current, onTab, onAi, onShortcut, initials }: Props) {
  const insets = useSafeAreaInsets()
  const { palette, tone, on, onBg } = useTone()
  const small = (
    to: 'jogos' | 'conquistas' | 'avisos',
    icon: 'ticket' | 'medal' | 'bell',
    label: string
  ) => (
    <Pressable
      key={to}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onShortcut(to)}
      style={styles.railSmall}
    >
      <Icon name={icon} size={20} color={palette.ink} />
      <Text style={[text(10.5, 'SemiBold', 1.15), { color: palette.muted }]}>
        {label}
      </Text>
    </Pressable>
  )
  return (
    <Glass
      tone={tone}
      style={[
        styles.rail,
        { top: insets.top + 8, bottom: Math.max(insets.bottom, 16) }
      ]}
    >
      <View style={{ marginBottom: 6 }}>
        <AiButton size={58} radius={20} onPress={onAi} />
      </View>
      {TABS.map((tab) => {
        const selected = current === tab.key
        const color = selected ? on : palette.ink
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onPress={() => onTab(tab.key)}
            style={styles.railItem}
          >
            <View
              style={[
                styles.railPill,
                selected ? { backgroundColor: onBg } : null
              ]}
            >
              <Icon name={tab.icon} size={22} color={color} />
            </View>
            <Text
              style={[
                text(11.5, selected ? 'Bold' : 'SemiBold', 1.15),
                { color }
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
      <View style={[styles.railLine, { backgroundColor: palette.line }]} />
      {small('jogos', 'ticket', 'Meus jogos')}
      {small('conquistas', 'medal', 'Conquistas')}
      <View style={{ flex: 1 }} />
      {small('avisos', 'bell', 'Avisos')}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Perfil"
        onPress={() => onShortcut('perfil')}
        style={[
          styles.avatar,
          { borderColor: palette.dark ? 'rgba(241,238,230,.2)' : PAPER }
        ]}
      >
        <Text style={[text(15, 'Bold', 1), { color: INK }]}>{initials}</Text>
      </Pressable>
    </Glass>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  floatWrap: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10
  },
  floatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    gap: 2
  },
  floatTab: {
    width: 96,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  duoWrap: {
    position: 'absolute',
    right: 10,
    width: 62,
    alignItems: 'center',
    gap: 12
  },
  duoBar: {
    width: 62,
    borderRadius: 31,
    paddingVertical: 5,
    alignItems: 'center',
    gap: 2
  },
  duoTab: {
    width: 52,
    height: 56,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2
  },
  rail: {
    position: 'absolute',
    left: 10,
    width: 84,
    borderRadius: 42,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12
  },
  railItem: { alignItems: 'center', gap: 4 },
  railPill: {
    width: 56,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  railLine: { width: 40, height: 1, marginVertical: 4 },
  railSmall: { alignItems: 'center', gap: 3 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACID,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
