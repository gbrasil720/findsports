import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import MapView from 'react-native-maps'
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { Card } from '@/components/card'
import { Chip, type Palette, usePalette } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { EASE, haptic } from '@/components/motion'
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
  type Shortcut,
  shortcutLabel,
  toggleShortcut
} from '@/lib/filters'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * Atalhos do mapa (19e do design): a fileira de filtros no topo do Explorar.
 * Arrastar reordena, o "–" tira, o "+" põe (até cinco). "Ao vivo" é fixo e
 * fica fora da conta. "Salvar" grava no aparelho; com alteração não salva,
 * um aviso aparece e o "×" pergunta antes de descartar.
 * "Fim de semana" do design não entrou: a busca filtra um dia só.
 */

const ROW = 58

export default function ShortcutsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const state = useExploreState()
  useStatusBar('auto')
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const mainSport = prefs.data?.[0]?.sport.slug ?? null
  const saved = state.shortcuts ?? defaultShortcuts(mainSport)
  const [draft, setList] = useState<Shortcut[] | null>(null)
  // Até a pessoa mexer, a lista é a salva (que muda quando o esporte
  // principal chega do servidor). Mexeu e não salvou: o aviso aparece e o
  // "×" pergunta antes de sair.
  const list = draft ?? saved
  const dirty = draft !== null && draft.join() !== saved.join()
  const sportList = sports.data ?? []
  const full = list.length >= MAX_SHORTCUTS
  const center = searchCenter(state.device, city.data)

  const add = (key: Shortcut) => {
    if (full) return haptic.error()
    haptic.select()
    setList(toggleShortcut(list, key))
  }
  const remove = (key: Shortcut) => {
    haptic.select()
    setList(list.filter((k) => k !== key))
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
            accessibilityLabel="Fechar"
            hitSlop={8}
            onPress={() => {
              if (!dirty) return router.back()
              haptic.error()
              Alert.alert(
                'Descartar alterações?',
                'A ordem e os atalhos que você mexeu ainda não foram salvos.',
                [
                  { text: 'Continuar editando', style: 'cancel' },
                  {
                    text: 'Descartar',
                    style: 'destructive',
                    onPress: () => router.back()
                  }
                ]
              )
            }}
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
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={save}
            style={dirty && styles.saveOn}
          >
            <Text
              style={[text(15, 'Bold'), { color: dirty ? INK : palette.ink }]}
            >
              Salvar
            </Text>
          </Pressable>
        </View>

        {dirty ? (
          <Animated.View
            entering={NOTE_IN}
            exiting={NOTE_OUT}
            accessibilityRole="alert"
            style={[
              styles.unsaved,
              {
                backgroundColor: palette.dark
                  ? 'rgba(243,66,29,.14)'
                  : 'rgba(232,50,12,.08)',
                borderColor: palette.dark
                  ? 'rgba(243,66,29,.4)'
                  : 'rgba(232,50,12,.3)'
              }
            ]}
          >
            <View style={styles.unsavedDot} />
            <Text
              style={[
                text(13, 'SemiBold', 1.3),
                { color: palette.ink, flex: 1 }
              ]}
            >
              Alterações não salvas. Toque em Salvar para manter.
            </Text>
          </Animated.View>
        ) : null}

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

/** A mola de quem assenta no lugar: curta, sem balanço. */
const SETTLE = { damping: 22, stiffness: 280 }
// Constantes de módulo: o Reanimated recomeça a entrada se o objeto muda.
const ROW_IN = FadeIn.duration(150)
const ROW_OUT = FadeOut.duration(120)
const NOTE_IN = FadeInDown.duration(180).easing(EASE)
const NOTE_OUT = FadeOut.duration(120)
const HEIGHT = LinearTransition.duration(200).easing(EASE)

/** Leva `id` para a posição `to`; quem estava no caminho anda uma casa. */
function shift(positions: Record<string, number>, id: string, to: number) {
  'worklet'
  const from = positions[id] ?? to
  const next: Record<string, number> = {}
  for (const key of Object.keys(positions)) {
    const at = positions[key] ?? 0
    if (key === id) next[key] = to
    else if (from < to && at > from && at <= to) next[key] = at - 1
    else if (from > to && at < from && at >= to) next[key] = at + 1
    else next[key] = at
  }
  return next
}

/**
 * A lista que se arrasta: cada linha fica numa posição absoluta. Enquanto a
 * arrastada passa da metade de uma vizinha, a vizinha já desliza para o
 * lugar livre; soltar grava a ordem. Altura fixa (58).
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
  const positions = useSharedValue<Record<string, number>>(
    Object.fromEntries(list.map((key, i) => [key, i]))
  )
  // A lista mudou (pôs, tirou, gravou a ordem): as posições seguem.
  useEffect(() => {
    positions.set(Object.fromEntries(list.map((key, i) => [key, i])))
  }, [list, positions])
  return (
    <Animated.View layout={HEIGHT} style={{ height: list.length * ROW }}>
      {list.map((key, index) => (
        <SortRow
          key={key}
          id={key}
          index={index}
          count={list.length}
          positions={positions}
          palette={palette}
          label={shortcutLabel(key, sportList)}
          sub={key === `esporte:${mainSport}` ? 'Seu esporte principal' : null}
          onTick={haptic.select}
          onCommit={onMove}
          onRemove={() => onRemove(key)}
        />
      ))}
    </Animated.View>
  )
}

function SortRow({
  id,
  index,
  count,
  positions,
  palette,
  label,
  sub,
  onTick,
  onCommit,
  onRemove
}: {
  id: Shortcut
  index: number
  count: number
  positions: SharedValue<Record<string, number>>
  palette: Palette
  label: ReturnType<typeof shortcutLabel>
  sub: string | null
  onTick: () => void
  onCommit: (order: Shortcut[]) => void
  onRemove: () => void
}) {
  const reduced = useReducedMotion()
  const dragging = useSharedValue(false)
  /** 0 no lugar, 1 levantada: escala, giro e o cartão por trás. */
  const lift = useSharedValue(0)
  const y = useSharedValue(index * ROW)
  const start = useSharedValue(0)
  // Outra linha passou por cima desta: desliza para a casa nova.
  useAnimatedReaction(
    () => positions.value[id],
    (at, before) => {
      if (at === undefined || at === before || dragging.value) return
      y.set(withSpring(at * ROW, SETTLE))
    }
  )
  const pan = Gesture.Pan()
    .onStart(() => {
      dragging.set(true)
      start.set(y.value)
      lift.set(withTiming(1, { duration: 140, easing: EASE }))
      scheduleOnRN(onTick)
    })
    .onUpdate((e) => {
      const next = Math.max(
        0,
        Math.min((count - 1) * ROW, start.value + e.translationY)
      )
      y.set(next)
      const to = Math.round(next / ROW)
      if (positions.value[id] !== to) {
        positions.set(shift(positions.value, id, to))
        scheduleOnRN(onTick)
      }
    })
    .onFinalize(() => {
      if (!dragging.value) return
      dragging.set(false)
      lift.set(withTiming(0, { duration: 180, easing: EASE }))
      const at = positions.value[id] ?? 0
      y.set(withSpring(at * ROW, SETTLE))
      const order = Object.keys(positions.value).sort(
        (a, b) => (positions.value[a] ?? 0) - (positions.value[b] ?? 0)
      )
      scheduleOnRN(onCommit, order)
    })
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: y.value },
      { scale: 1 + 0.02 * lift.value },
      // O giro é enfeite: some com "Reduzir movimento".
      { rotate: `${reduced ? 0 : -1 * lift.value}deg` }
    ],
    zIndex: lift.value > 0 ? 2 : 1
  }))
  const card = useAnimatedStyle(() => ({ opacity: lift.value }))
  return (
    <Animated.View
      entering={ROW_IN}
      exiting={ROW_OUT}
      style={[styles.sortRow, style]}
    >
      {/* O cartão de quem está na mão: só a opacidade anima. */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.liftCard,
          {
            backgroundColor: palette.dark ? palette.card : '#fff',
            borderColor: palette.dark ? ACID : INK
          },
          card
        ]}
      />
      <View
        style={[
          styles.row,
          { borderTopWidth: 1, borderTopColor: palette.line }
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
      </View>
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
  saveOn: {
    backgroundColor: ACID,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginVertical: -7,
    marginRight: -4
  },
  unsaved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1
  },
  unsavedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE },
  liftCard: {
    borderRadius: 6,
    borderWidth: 1.5,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 5, height: 5 }
  },
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
