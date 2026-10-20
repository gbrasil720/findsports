import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import MapView from 'react-native-maps'
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { Card } from '@/components/card'
import { Chip, type Palette, usePalette } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { haptic } from '@/components/motion'
import {
  ACID,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import { searchCenter } from '@/lib/explore'
import {
  BAR_ITEMS,
  defaultShortcuts,
  MAX_SHORTCUTS,
  moveShortcut,
  type Shortcut,
  shortcutLabel,
  toggleShortcut
} from '@/lib/filters'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * Atalhos do mapa (19e do design): a fileira de filtros no topo do Explorar.
 * Arrastar reordena, o "–" tira, o "+" põe (até cinco). "Ao vivo" é fixo e
 * fica fora da conta. "Salvar" grava no aparelho; o "×" descarta.
 * "Fim de semana" do design não entrou: a busca filtra um dia só.
 */

const ROW = 58

export default function ShortcutsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const state = useExploreState()
  useStatusBar('auto')
  const sports = useQuery({
    ...trpc.pubs.getSports.queryOptions(),
    meta: { errorToast: false }
  })
  const prefs = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    meta: { errorToast: false }
  })
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const mainSport = prefs.data?.[0]?.sport.slug ?? null
  const [list, setList] = useState<Shortcut[]>(
    state.shortcuts ?? defaultShortcuts(mainSport)
  )
  const sportList = sports.data ?? []
  const full = list.length >= MAX_SHORTCUTS
  const center = searchCenter(state.device, city.data)

  const add = (key: Shortcut) => {
    if (full) return haptic.error()
    haptic.select()
    setList((l) => toggleShortcut(l, key))
  }
  const remove = (key: Shortcut) => {
    haptic.select()
    setList((l) => l.filter((k) => k !== key))
  }
  const save = () => {
    haptic.success()
    state.setShortcuts(list)
    router.back()
  }

  const groups: { title: string; keys: Shortcut[] }[] = [
    { title: 'Quando', keys: ['hoje', 'amanha'] },
    { title: 'Esporte', keys: sportList.map((s) => `esporte:${s.slug}`) },
    { title: 'No bar', keys: BAR_ITEMS.map((i) => `item:${i.id}`) },
    { title: 'Distância', keys: ['raio:1', 'raio:2', 'raio:5'] }
  ]
    .map((g) => ({ ...g, keys: g.keys.filter((k) => !list.includes(k)) }))
    .filter((g) => g.keys.length)

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar sem salvar"
            hitSlop={8}
            onPress={() => router.back()}
          >
            <GlassRound>
              <Icon name="close" size={16} color={palette.ink} />
            </GlassRound>
          </Pressable>
          <Text
            style={[styles.title, { color: palette.ink }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Atalhos do mapa
          </Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={save}>
            <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
              Salvar
            </Text>
          </Pressable>
        </View>

        {/* Prévia: a fileira como vai ficar sobre o mapa. */}
        <Card
          palette={palette}
          shadow={
            palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'
          }
          offset={5}
          style={styles.preview}
        >
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: center.lat,
              longitude: center.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02
            }}
            mapType="mutedStandard"
            customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
            userInterfaceStyle={palette.dark ? 'dark' : 'light'}
            showsPointsOfInterests={false}
            scrollEnabled={false}
            zoomEnabled={false}
            pointerEvents="none"
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: palette.dark
                  ? 'rgba(18,18,15,.45)'
                  : 'rgba(241,238,230,.55)'
              }
            ]}
          />
          <Text style={[styles.mono, { color: palette.muted, margin: 12 }]}>
            PRÉVIA
          </Text>
          <ScrollView
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.previewRow}
            pointerEvents="none"
          >
            <View
              style={[
                styles.filterDot,
                palette.dark && { backgroundColor: ACID }
              ]}
            >
              <Icon
                name="sliders"
                size={17}
                color={palette.dark ? INK : PAPER}
                accent={palette.dark ? INK : ACID}
              />
            </View>
            <Chip
              live
              label="Ao vivo"
              on
              palette={palette}
              onPress={() => {}}
            />
            {list.map((key) => {
              const shown = shortcutLabel(key, sportList)
              return shown ? (
                <Chip
                  key={key}
                  icon={shown.icon}
                  label={shown.label}
                  on={false}
                  palette={palette}
                  onPress={() => {}}
                />
              ) : null
            })}
          </ScrollView>
        </Card>

        <View style={styles.sectionHead}>
          <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
            Na fileira
          </Text>
          <Text style={[styles.mono125, { color: palette.ink }]}>
            {list.length}/{MAX_SHORTCUTS}
          </Text>
        </View>
        <Card palette={palette} soft style={{ overflow: 'visible' }}>
          <View style={styles.row}>
            <Icon name="lock" size={18} color={palette.muted} />
            <View style={styles.liveDot} />
            <View style={{ flex: 1 }}>
              <Text style={[text(15, 'Bold', 1.25), { color: palette.ink }]}>
                Ao vivo
              </Text>
              <Text
                style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
              >
                Fixo. Só aparece quando tem jogo rolando
              </Text>
            </View>
          </View>
          <Sortable
            palette={palette}
            list={list}
            sportList={sportList}
            mainSport={mainSport}
            onMove={setList}
            onRemove={remove}
          />
        </Card>
        <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
          Arraste para mudar a ordem. O primeiro fica mais perto do botão de
          filtros.
        </Text>

        {groups.length ? (
          <Text
            style={[text(17, 'Bold'), { color: palette.ink, marginTop: 6 }]}
          >
            Adicionar
          </Text>
        ) : null}
        {groups.map((group) => (
          <View key={group.title} style={{ gap: 8 }}>
            <Text style={[text(13, 'SemiBold'), { color: palette.muted }]}>
              {group.title}
            </Text>
            <View style={styles.addRow}>
              {group.keys.map((key) => {
                const shown = shortcutLabel(key, sportList)
                if (!shown) return null
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="button"
                    accessibilityLabel={`Pôr ${shown.label} na fileira`}
                    accessibilityState={{ disabled: full }}
                    onPress={() => add(key)}
                    style={[
                      styles.add,
                      {
                        backgroundColor: palette.card,
                        borderColor: palette.ring
                      },
                      full && { opacity: 0.45 }
                    ]}
                  >
                    {shown.icon ? (
                      <Icon name={shown.icon} size={16} color={palette.ink} />
                    ) : null}
                    <Text
                      style={[text(14.5, 'SemiBold'), { color: palette.ink }]}
                    >
                      {shown.label}
                    </Text>
                    <View style={styles.plus}>
                      <Text style={[text(16, 'Bold', 1), { color: INK }]}>
                        +
                      </Text>
                    </View>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

/**
 * A lista que se arrasta: cada linha fica numa posição absoluta e troca de
 * lugar quando a arrastada passa da metade da vizinha. Altura fixa (58).
 */
function Sortable({
  palette,
  list,
  sportList,
  mainSport,
  onMove,
  onRemove
}: {
  palette: Palette
  list: Shortcut[]
  sportList: { slug: string; name: string }[]
  mainSport: string | null
  onMove: (list: Shortcut[]) => void
  onRemove: (key: Shortcut) => void
}) {
  // Onde cada linha está agora; muda durante o arraste, antes de soltar.
  const order = useSharedValue<Shortcut[]>(list)
  if (order.value.join() !== list.join()) order.value = list
  return (
    <View style={{ height: list.length * ROW }}>
      {list.map((key, index) => (
        <SortRow
          key={key}
          id={key}
          index={index}
          count={list.length}
          order={order}
          palette={palette}
          label={shortcutLabel(key, sportList)}
          sub={key === `esporte:${mainSport}` ? 'Seu esporte principal' : null}
          onDrop={(from, to) => {
            haptic.select()
            onMove(moveShortcut(list, from, to))
          }}
          onRemove={() => onRemove(key)}
        />
      ))}
    </View>
  )
}

function SortRow({
  id,
  index,
  count,
  order,
  palette,
  label,
  sub,
  onDrop,
  onRemove
}: {
  id: Shortcut
  index: number
  count: number
  order: SharedValue<Shortcut[]>
  palette: Palette
  label: ReturnType<typeof shortcutLabel>
  sub: string | null
  onDrop: (from: number, to: number) => void
  onRemove: () => void
}) {
  const dragging = useSharedValue(false)
  const y = useSharedValue(index * ROW)
  const start = useSharedValue(0)
  const pan = Gesture.Pan()
    .onBegin(() => {
      dragging.set(true)
      start.set(order.value.indexOf(id) * ROW)
    })
    .onUpdate((e) => {
      y.set(
        Math.max(0, Math.min((count - 1) * ROW, start.value + e.translationY))
      )
    })
    .onFinalize(() => {
      const from = index
      const to = Math.round(y.value / ROW)
      y.set(withSpring(to * ROW, { damping: 20, stiffness: 260 }))
      dragging.set(false)
      if (to !== from) scheduleOnRN(onDrop, from, to)
    })
  // Fora do arraste, a linha vai para a posição da lista.
  const style = useAnimatedStyle(() => {
    const target = dragging.value ? y.value : index * ROW
    if (!dragging.value && y.value !== target)
      y.set(withSpring(target, { damping: 20, stiffness: 260 }))
    return {
      transform: [
        { translateY: y.value },
        { rotate: dragging.value ? '-1deg' : '0deg' }
      ],
      zIndex: dragging.value ? 2 : 1
    }
  })
  const lift = useAnimatedStyle(() =>
    dragging.value
      ? {
          backgroundColor: palette.dark ? palette.card : '#fff',
          borderColor: palette.dark ? ACID : INK,
          borderWidth: 1.5,
          marginHorizontal: -6,
          shadowColor: ACID,
          shadowOpacity: 1,
          shadowRadius: 0,
          shadowOffset: { width: 5, height: 5 }
        }
      : {
          backgroundColor: 'transparent',
          borderWidth: 0,
          marginHorizontal: 0,
          shadowOpacity: 0
        }
  )
  return (
    <Animated.View style={[styles.sortRow, style]}>
      <Animated.View
        style={[
          styles.row,
          { borderTopWidth: 1, borderTopColor: palette.line, borderRadius: 6 },
          lift
        ]}
      >
        <GestureDetector gesture={pan}>
          <View
            accessibilityLabel={`Arrastar ${label?.label ?? ''}`}
            hitSlop={12}
            style={styles.handle}
          >
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.handleBar,
                  {
                    backgroundColor: palette.dark
                      ? 'rgba(241,238,230,.35)'
                      : 'rgba(18,18,15,.35)'
                  }
                ]}
              />
            ))}
          </View>
        </GestureDetector>
        {label?.icon ? (
          <Icon name={label.icon} size={20} color={palette.ink} />
        ) : (
          <View style={{ width: 20 }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={[text(15, 'Bold', 1.25), { color: palette.ink }]}>
            {label?.label ?? id}
          </Text>
          {sub ? (
            <Text style={[text(12, 'Regular', 1.3), { color: palette.muted }]}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tirar ${label?.label ?? ''} da fileira`}
          hitSlop={8}
          onPress={onRemove}
          style={styles.minus}
        >
          <View style={styles.minusBar} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flex: 1,
    fontFamily: 'Anton',
    fontSize: 30,
    textTransform: 'uppercase',
    letterSpacing: -0.6
  },
  preview: { height: 150 },
  previewRow: { gap: 7, paddingHorizontal: 12, alignItems: 'center' },
  filterDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  mono125: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: -6
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14
  },
  sortRow: { position: 'absolute', left: 0, right: 0, top: 0 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE },
  handle: { width: 16, gap: 3 },
  handleBar: { height: 2, borderRadius: 1 },
  minus: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: LIVE,
    alignItems: 'center',
    justifyContent: 'center'
  },
  minusBar: {
    width: 11,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: PAPER
  },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 22,
    borderWidth: 1
  },
  plus: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
