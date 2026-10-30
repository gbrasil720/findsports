import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Image, Platform, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import {
  useSafeAreaFrame,
  useSafeAreaInsets
} from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { initials } from '@/components/explore'
import { Glass } from '@/components/glass'
import { NAV, useLayout } from '@/components/layout'
import { haptic, ScalePress } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, Text, text } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import type { NavKind } from '@/lib/layout'

/*
 * A navegação fora do celular (regras 01, 03, 04 e 04b da T1). É a mesma barra
 * do celular (a `NativeTabs` do iOS 26: cápsula de vidro, lente que desliza
 * com mola entre as abas e acompanha o dedo, os mesmos ícones e o círculo da
 * IA ao lado), posta onde cada aparelho pede: deitada e flutuando embaixo
 * (iPad, dobrável aberto), em pé na faixa da direita (iPhone Duo) e no rail
 * à esquerda (Galaxy Tab). O design desenhou a barra antiga; vale a do
 * celular. As abas continuam as da `NativeTabs`, com a barra nativa
 * escondida: trocar de aparelho não remonta nada.
 */

// Fora da aba, só o ícone; selecionada, o ícone com o nome ao lado (e as
// setinhas no Você), como no design. A barra do sistema só põe o nome
// embaixo, então o nome vai dentro da imagem e o rótulo nativo fica oculto.
// O nome sai em 12,5 (o design usa 14): a lente de vidro da seleção desenha
// por dentro a versão selecionada de todas as abas, e uma imagem mais larga
// que a aba aparece na lente da vizinha: cada imagem cabe em ~72 pt ("Seus
// bares" não coube; a aba de Seus bares se chama "Bares").
export const TAB_ICONS = {
  light: {
    map: {
      default: require('../assets/images/tabs/map-light.png'),
      selected: require('../assets/images/tabs/map-light-on.png')
    },
    fan: {
      default: require('../assets/images/tabs/fan-light.png'),
      selected: require('../assets/images/tabs/fan-light-on.png')
    },
    you: {
      default: require('../assets/images/tabs/you-light.png'),
      selected: require('../assets/images/tabs/you-light-on.png')
    },
    sparkle: require('../assets/images/tabs/sparkle-light.png')
  },
  dark: {
    map: {
      default: require('../assets/images/tabs/map-dark.png'),
      selected: require('../assets/images/tabs/map-dark-on.png')
    },
    fan: {
      default: require('../assets/images/tabs/fan-dark.png'),
      selected: require('../assets/images/tabs/fan-dark-on.png')
    },
    you: {
      default: require('../assets/images/tabs/you-dark.png'),
      selected: require('../assets/images/tabs/you-dark-on.png')
    },
    sparkle: require('../assets/images/tabs/sparkle-dark.png')
  }
}

export type NavTab = 'explore' | 'favoritos' | 'voce'

const TABS: { key: NavTab; icon: 'map' | 'fan' | 'you'; label: string }[] = [
  { key: 'explore', icon: 'map', label: 'Explorar' },
  { key: 'favoritos', icon: 'fan', label: 'Bares' },
  { key: 'voce', icon: 'you', label: 'Você' }
]

/**
 * Medidas da barra do celular (iPhone 17 Pro, a 3x): cápsula de 290 x 62, a
 * lente de 100 x 54 a 4 da borda, as abas a cada 91,5 a partir de 54, e o
 * círculo da IA de 62 a 9 da cápsula. Em pé (Duo, rail), a mesma cápsula de
 * 62 de largura com as abas a cada 62.
 */
const BAR = { long: 290, thick: 62, lens: 54, lensLong: 100, inset: 4 }
const H_FIRST = 54
const H_STEP = 91.5
const V_STEP = 62
const AI_GAP = 9
const SPRING = { damping: 20, stiffness: 260, mass: 0.9 }

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
  /** Com um bar aberto ao lado da lista (a02), a barra fica sob a lista. */
  right?: number
}

/**
 * O rail do Galaxy Tab por cima de uma tela da pilha (a página do bar, a
 * busca com IA), como o design desenha (02q–02u, 03q–03u): as abas levam de
 * volta a elas.
 */
export function StackRail({ current }: { current: NavTab }) {
  const router = useRouter()
  const session = authClient.useSession()
  return (
    <TabRail
      kind="rail"
      current={current}
      onTab={(tab) =>
        router.navigate(tab === 'voce' ? '/voce/perfil' : `/${tab}`)
      }
      onAi={() => router.push('/busca-ia')}
      onShortcut={(to) =>
        router.navigate(
          to === 'avisos'
            ? '/avisos'
            : to === 'jogos'
              ? '/voce/meus-jogos'
              : `/voce/${to}`
        )
      }
      initials={initials(session.data?.user.name ?? '')}
    />
  )
}

export function SideNav(props: Props) {
  if (props.kind === 'duoRail') return <DuoRail {...props} />
  if (props.kind === 'rail') return <TabRail {...props} />
  return <FloatNav {...props} />
}

/** A cápsula deitada inteira (abas e IA), para centralizar e achar a IA. */
const FLOAT_WIDTH = BAR.long + AI_GAP + BAR.thick

/**
 * O centro do botão da IA na tela, para o primeiro acesso (4o) cercá-lo. Na
 * barra nativa do iOS 26, medido no iPhone 16e (52 pt dos cantos).
 */
export function useAiButtonCenter() {
  const { width, height } = useSafeAreaFrame()
  const insets = useSafeAreaInsets()
  const layout = useLayout()
  if (layout.nav === 'duoRail')
    return {
      x: width - 10 - BAR.thick / 2,
      y: height - insets.bottom - 24 - BAR.thick / 2
    }
  if (layout.nav === 'rail')
    return { x: 10 + 42, y: insets.top + 8 + 14 + BAR.thick / 2 }
  if (layout.nav === 'float') {
    // Só o Explorar põe a barra sobre o mapa; o primeiro acesso só aparece nele.
    const left = layout.kind === 'split' ? layout.split + layout.gap : 0
    const mid = (left + width) / 2
    return {
      x: mid + FLOAT_WIDTH / 2 - BAR.thick / 2,
      y: height - insets.bottom - NAV.float.gap - BAR.thick / 2
    }
  }
  return { x: width - 52, y: height - 52 }
}

const centerOf = (index: number, vertical: boolean) =>
  vertical
    ? BAR.inset + V_STEP / 2 - 4 + index * V_STEP
    : H_FIRST + index * H_STEP

/**
 * As três abas numa cápsula de vidro, com a lente da aba escolhida. Como na
 * barra do sistema: tocar leva a lente até a aba numa mola; segurar e
 * arrastar faz a lente seguir o dedo, crescer um pouco e cair na aba mais
 * perto ao soltar.
 */
function GlassTabs({
  current,
  onTab,
  vertical
}: {
  current: NavTab
  onTab: (tab: NavTab) => void
  vertical: boolean
}) {
  const palette = usePalette()
  const tone = palette.dark ? 'dark' : 'light'
  const icons = TAB_ICONS[tone]
  const index = TABS.findIndex((tab) => tab.key === current)
  const lensLong = vertical ? BAR.lens : BAR.lensLong
  const long = vertical ? BAR.inset * 2 + V_STEP * TABS.length - 8 : BAR.long
  const first = centerOf(0, vertical)
  const last = centerOf(TABS.length - 1, vertical)
  const step = vertical ? V_STEP : H_STEP

  const at = useSharedValue(centerOf(index, vertical))
  const pressed = useSharedValue(0)
  // A aba mudou por fora (rota, outro toque): a lente vai até ela.
  useEffect(() => {
    at.set(withSpring(centerOf(index, vertical), SPRING))
  }, [at, index, vertical])

  const choose = (next: number) => {
    const tab = TABS[next]
    if (tab) onTab(tab.key)
  }
  const tick = () => haptic.select()

  const nearest = (pos: number) => {
    'worklet'
    return Math.max(
      0,
      Math.min(TABS.length - 1, Math.round((pos - first) / step))
    )
  }
  const drag = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      const pos = vertical ? e.y : e.x
      pressed.set(withSpring(1, SPRING))
      at.set(withSpring(Math.max(first, Math.min(last, pos)), SPRING))
    })
    .onUpdate((e) => {
      const pos = Math.max(first, Math.min(last, vertical ? e.y : e.x))
      const before = nearest(at.get())
      at.set(pos)
      if (nearest(pos) !== before) scheduleOnRN(tick)
    })
    .onFinalize((e) => {
      const next = nearest(vertical ? e.y : e.x)
      pressed.set(withSpring(0, SPRING))
      at.set(withSpring(first + next * step, SPRING))
      scheduleOnRN(choose, next)
    })

  const lens = useAnimatedStyle(() => {
    const grow = 1 + 0.12 * pressed.get()
    return {
      transform: [
        vertical
          ? { translateY: at.get() - lensLong / 2 }
          : { translateX: at.get() - lensLong / 2 },
        { scaleX: grow },
        { scaleY: grow }
      ]
    }
  })

  return (
    // O gesto fica numa View comum por fora: o vidro interativo engolia os
    // toques antes do Gesture Handler.
    <GestureDetector gesture={drag}>
      <View>
        <Glass
          tone={tone}
          // "tabbar" só existe no iOS: no Android derruba o app.
          accessibilityRole={Platform.OS === 'ios' ? 'tabbar' : undefined}
          style={[
            styles.capsule,
            vertical
              ? { width: BAR.thick, height: long }
              : { width: long, height: BAR.thick }
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lens,
              {
                backgroundColor: palette.dark
                  ? 'rgba(255,255,255,.12)'
                  : 'rgba(18,18,15,.07)'
              },
              vertical
                ? { left: BAR.inset, top: 0, width: BAR.lens, height: BAR.lens }
                : {
                    top: BAR.inset,
                    left: 0,
                    width: BAR.lensLong,
                    height: BAR.lens
                  },
              lens
            ]}
          />
          {TABS.map((tab, k) => {
            const selected = k === index
            const source = icons[tab.icon]
            const center = centerOf(k, vertical)
            return (
              <View
                key={tab.key}
                accessible
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected }}
                onAccessibilityTap={() => onTab(tab.key)}
                pointerEvents="none"
                style={[
                  styles.slot,
                  vertical
                    ? {
                        left: 0,
                        width: BAR.thick,
                        top: center - BAR.lens / 2,
                        height: BAR.lens
                      }
                    : {
                        top: 0,
                        height: BAR.thick,
                        left: center - BAR.lensLong / 2,
                        width: BAR.lensLong
                      }
                ]}
              >
                {/* Em pé não cabe o nome: só o ícone, como na lente fechada. */}
                <Image
                  source={
                    selected && !vertical ? source.selected : source.default
                  }
                  style={{
                    height: 24,
                    width: undefined,
                    aspectRatio: imageRatio(tab.icon, selected && !vertical)
                  }}
                />
              </View>
            )
          })}
        </Glass>
      </View>
    </GestureDetector>
  )
}

/** Proporção dos PNG das abas (a 3x): o selecionado traz o nome ao lado. */
function imageRatio(icon: 'map' | 'fan' | 'you', selected: boolean) {
  if (selected) return { map: 207, fan: 168, you: 195 }[icon] / 72
  return { map: 72, fan: 72, you: 111 }[icon] / 72
}

/** O círculo de vidro da IA, o mesmo da barra do celular. */
function AiButton({ onPress }: { onPress: () => void }) {
  const palette = usePalette()
  const tone = palette.dark ? 'dark' : 'light'
  return (
    <ScalePress
      accessibilityRole="button"
      accessibilityLabel="Busca com IA"
      onPress={onPress}
      to={0.94}
    >
      <Glass
        tone={tone}
        interactive
        style={[
          styles.capsule,
          styles.center,
          { width: BAR.thick, height: BAR.thick }
        ]}
      >
        <Image source={TAB_ICONS[tone].sparkle} style={styles.sparkle} />
      </Glass>
    </ScalePress>
  )
}

/** iPad e dobrável aberto: a barra do celular no rodapé, centralizada (03, 04b). */
function FloatNav({ current, onTab, onAi, left = 0, right = 0 }: Props) {
  const insets = useSafeAreaInsets()
  // Na metade do mapa do Fold 8 aberto (352 dp) a barra não cabe: encolhe,
  // como no design (86%), com 12 de folga de cada lado.
  const room = useLayout().width - left - right - 24
  const scale = Math.min(1, room / FLOAT_WIDTH)
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.floatWrap,
        { left, right, bottom: insets.bottom + NAV.float.gap },
        scale < 1 && { transform: [{ scale }], transformOrigin: 'bottom' }
      ]}
    >
      <GlassTabs current={current} onTab={onTab} vertical={false} />
      <AiButton onPress={onAi} />
    </View>
  )
}

/** iPhone Duo: a mesma barra em pé, na faixa da direita, e a IA embaixo (01). */
function DuoRail({ current, onTab, onAi }: Props) {
  const insets = useSafeAreaInsets()
  return (
    <View
      pointerEvents="box-none"
      style={[styles.duoWrap, { bottom: insets.bottom + 24 }]}
    >
      <GlassTabs current={current} onTab={onTab} vertical />
      <AiButton onPress={onAi} />
    </View>
  )
}

/**
 * Galaxy Tab: o rail à esquerda (04), com a IA no topo, a barra do celular em
 * pé no meio e os atalhos, avisos e perfil embaixo.
 */
function TabRail({ current, onTab, onAi, onShortcut, initials }: Props) {
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const small = (
    to: 'jogos' | 'conquistas' | 'avisos',
    icon: 'ticket' | 'medal' | 'bell',
    label: string
  ) => (
    <ScalePress
      key={to}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onShortcut(to)}
      to={0.94}
      style={styles.railSmall}
    >
      <Icon name={icon} size={20} color={palette.ink} />
      <Text style={[text(10.5, 'SemiBold', 1.15), { color: palette.muted }]}>
        {label}
      </Text>
    </ScalePress>
  )
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.rail,
        { top: insets.top + 8, bottom: Math.max(insets.bottom, 16) }
      ]}
    >
      <AiButton onPress={onAi} />
      <GlassTabs current={current} onTab={onTab} vertical />
      <View style={[styles.railLine, { backgroundColor: palette.line }]} />
      {small('jogos', 'ticket', 'Meus jogos')}
      {small('conquistas', 'medal', 'Conquistas')}
      <View style={{ flex: 1 }} />
      {small('avisos', 'bell', 'Avisos')}
      <ScalePress
        accessibilityRole="button"
        accessibilityLabel="Perfil"
        onPress={() => onShortcut('perfil')}
        to={0.94}
        style={[
          styles.avatar,
          { borderColor: palette.dark ? 'rgba(241,238,230,.2)' : PAPER }
        ]}
      >
        <Text style={[text(15, 'Bold', 1), { color: INK }]}>{initials}</Text>
      </ScalePress>
    </View>
  )
}

const styles = StyleSheet.create({
  capsule: { borderRadius: BAR.thick / 2, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  lens: { position: 'absolute', borderRadius: BAR.lens / 2 },
  slot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sparkle: { width: 24, height: 24 },
  floatWrap: {
    position: 'absolute',
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: AI_GAP
  },
  duoWrap: {
    position: 'absolute',
    right: 10,
    width: BAR.thick,
    alignItems: 'center',
    gap: AI_GAP
  },
  rail: {
    position: 'absolute',
    left: 10 + (84 - BAR.thick) / 2,
    width: BAR.thick,
    alignItems: 'center',
    gap: 12
  },
  railLine: { width: 40, height: 1, marginVertical: 4 },
  railSmall: { alignItems: 'center', gap: 3, width: 84 },
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
