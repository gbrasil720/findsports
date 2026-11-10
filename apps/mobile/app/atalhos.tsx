import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { useExploreState } from '@/components/explore-state'
import { GroupLabel, LineList } from '@/components/game-line'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  Icon,
  LIVE,
  PillButton,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import {
  defaultShortcuts,
  FILTER_GROUPS,
  MAX_SHORTCUTS,
  type Shortcut,
  shortcutLabel,
  shortcutOn,
  toggleShortcut
} from '@/lib/filters'
import { trpc } from '@/lib/trpc'

/*
 * Atalhos do mapa (19e do design): a fileira de filtros no topo do Explorar.
 * Arrastar reordena, o "–" tira, o "+" põe (até cinco). "Ao vivo" é fixo e
 * fica fora da conta. "Salvar" grava no aparelho; com alteração não salva,
 * um aviso aparece e o "×" pergunta antes de descartar.
 * "Fim de semana" do design não entrou: a busca filtra um dia só.
 */

const ROW = 52

export default function ShortcutsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const state = useExploreState()
  useStatusBar('auto')
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
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

  // "Adicionar": os filtros que ainda não estão na fileira, numa lista só.
  const addable = [
    'hoje',
    'amanha',
    ...sportList.map((s) => `esporte:${s.slug}`),
    ...FILTER_GROUPS.flatMap((g) => g.items.map((i) => `item:${i.id}`))
  ].filter((key) => !list.includes(key))
  const now = Date.now()
  const back = () => {
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
  }

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
            accessibilityLabel="Voltar"
            hitSlop={8}
            onPress={back}
            style={[
              styles.round,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Icon name="back" size={20} color={palette.ink} />
          </Pressable>
          <PillButton label="Salvar" height={40} onPress={save} />
        </View>
        <Text style={[styles.title, { color: palette.ink }]}>Atalhos</Text>
        <Text
          style={[
            text(14, 'Regular', 1.45),
            { color: palette.muted, marginTop: -10 }
          ]}
        >
          Até cinco filtros na fileira do Explorar. Segure e arraste para
          ordenar.
        </Text>

        <GroupLabel>Como fica</GroupLabel>
        <ScrollView
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          pointerEvents="none"
          style={[styles.preview, { backgroundColor: palette.mark }]}
          contentContainerStyle={styles.previewRow}
        >
          <PreviewChip icon="aovivo" label="Ao vivo" />
          {list.map((key) => {
            const shown = shortcutLabel(key, sportList)
            return shown ? (
              <PreviewChip
                key={key}
                icon={shown.icon}
                label={shown.label}
                on={shortcutOn(key, state.filters, sportList, now)}
              />
            ) : null
          })}
        </ScrollView>

        <GroupLabel>{`Na fileira · ${list.length} de ${MAX_SHORTCUTS}`}</GroupLabel>
        <LineList>
          <View style={styles.row}>
            <Icon name="aovivo" size={18} color={palette.muted} accent={LIVE} />
            <Text
              style={[
                text(15, 'SemiBold', 1.2),
                { color: palette.muted, flex: 1 }
              ]}
            >
              Ao vivo
            </Text>
            <Text style={[styles.mono, { color: palette.muted }]}>FIXO</Text>
          </View>
          <Sortable
            list={list}
            sportList={sportList}
            onMove={setList}
            onRemove={remove}
          />
        </LineList>

        {addable.length ? <GroupLabel>Adicionar</GroupLabel> : null}
        <View style={styles.addRow}>
          {addable.map((key) => {
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
                  { borderColor: palette.line },
                  full && { opacity: 0.45 }
                ]}
              >
                {shown.icon ? (
                  <Icon name={shown.icon} size={16} color={palette.ink} />
                ) : null}
                <Text style={[text(13.5, 'SemiBold'), { color: palette.ink }]}>
                  {shown.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

/** O chip da prévia: a fileira como vai ficar; o filtro ligado em papel. */
function PreviewChip({
  icon,
  label,
  on
}: {
  icon?: Parameters<typeof Icon>[0]['name']
  label: string
  on?: boolean
}) {
  const palette = usePalette()
  return (
    <View style={[styles.previewChip, on && { backgroundColor: palette.ink }]}>
      {icon ? (
        <Icon
          name={icon}
          size={16}
          color={on ? palette.bg : palette.ink}
          accent={icon === 'aovivo' ? LIVE : undefined}
        />
      ) : null}
      <Text
        style={[
          text(13.5, 'SemiBold', 1.2),
          { color: on ? palette.bg : palette.ink }
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

/** A mola de quem assenta no lugar: curta, sem balanço. */
const SETTLE = { damping: 22, stiffness: 280 }
// Constantes de módulo: o Reanimated recomeça a entrada se o objeto muda.
const ROW_IN = FadeIn.duration(150)
const ROW_OUT = FadeOut.duration(120)
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
 * A lista que se arrasta: cada linha fica numa posição absoluta. Segurar a
 * linha 250 ms a levanta (háptico leve); enquanto a arrastada passa da
 * metade de uma vizinha, a vizinha já desliza para o lugar livre (háptico de
 * seleção a cada troca); soltar grava a ordem. Altura fixa (`ROW`).
 */
function Sortable({
  list,
  sportList,
  onMove,
  onRemove
}: {
  list: Shortcut[]
  sportList: { slug: string; name: string }[]
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
          label={shortcutLabel(key, sportList)}
          onPick={haptic.pick}
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
  label,
  onPick,
  onTick,
  onCommit,
  onRemove
}: {
  id: Shortcut
  index: number
  count: number
  positions: SharedValue<Record<string, number>>
  label: ReturnType<typeof shortcutLabel>
  onPick: () => void
  onTick: () => void
  onCommit: (order: Shortcut[]) => void
  onRemove: () => void
}) {
  const palette = usePalette()
  const dragging = useSharedValue(false)
  /** 0 no lugar, 1 levantada: a escala e o cartão por trás. */
  const lift = useSharedValue(0)
  const y = useSharedValue(index * ROW)
  const start = useSharedValue(0)
  // Outra linha passou por cima desta: desliza para a casa nova.
  useAnimatedReaction(
    () => positions.value[id],
    (at, before) => {
      if (at === undefined || at === before || dragging.value) return
      y.set(withTiming(at * ROW, { duration: 200, easing: EASE }))
    }
  )
  const pan = Gesture.Pan()
    .activateAfterLongPress(250)
    .onStart(() => {
      dragging.set(true)
      start.set(y.value)
      lift.set(withTiming(1, { duration: 140, easing: EASE }))
      scheduleOnRN(onPick)
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
    transform: [{ translateY: y.value }, { scale: 1 + 0.03 * lift.value }],
    zIndex: lift.value > 0 ? 2 : 1
  }))
  const card = useAnimatedStyle(() => ({ opacity: lift.value }))
  const line = useAnimatedStyle(() => ({ opacity: 1 - lift.value }))
  return (
    <Animated.View
      entering={ROW_IN}
      exiting={ROW_OUT}
      style={[styles.sortRow, style]}
    >
      {/* O cartão de quem está na mão: só a opacidade anima. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.liftCard, { backgroundColor: palette.card }, card]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.rule, { backgroundColor: palette.line }, line]}
      />
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityLabel={`${label?.label ?? ''}. Segure e arraste para ordenar`}
          style={styles.row}
        >
          <View style={styles.handle}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: palette.muted }]}
              />
            ))}
          </View>
          {label?.icon ? (
            <Icon name={label.icon} size={18} color={palette.ink} />
          ) : null}
          <Text
            style={[text(15, 'SemiBold', 1.2), { color: palette.ink, flex: 1 }]}
          >
            {label?.label ?? id}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tirar ${label?.label ?? ''} da fileira`}
            hitSlop={8}
            onPress={onRemove}
            style={[styles.remove, { backgroundColor: palette.mark }]}
          >
            <Icon name="close" size={14} color={palette.ink} />
          </Pressable>
        </View>
      </GestureDetector>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  // Anton 44: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 44,
    textTransform: 'uppercase',
    marginVertical: -10.7
  },
  preview: { borderRadius: 22, flexGrow: 0 },
  previewRow: { gap: 8, padding: 12 },
  previewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, letterSpacing: 0.88 },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  sortRow: { position: 'absolute', left: 0, right: 0, top: 0 },
  rule: { position: 'absolute', left: 0, right: 0, top: 0, height: 1 },
  liftCard: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -14,
    right: -14,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 14 }
  },
  handle: {
    width: 22,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    paddingHorizontal: 5
  },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
  remove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1.5
  }
})
