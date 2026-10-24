import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Card } from '@/components/card'
import { haptic, SWAP, usePressScale } from '@/components/motion'
import { ScoreBadge } from '@/components/suggestions'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  PAPER,
  Title,
  text
} from '@/components/ui'
import {
  AXES,
  axisLine,
  axisPoints,
  heaviestAxis,
  type Suggestion
} from '@/lib/suggestions'
import { trpc } from '@/lib/trpc'

/*
 * "Por que esse bar?" (22c): a conta do card em português, eixo por eixo,
 * com os pontos de verdade. "Mais assim" conta como Curti e "Menos assim"
 * como Passo, sem sair da folha (decisão do dono, 21/10/2026); a decisão
 * vale para o baralho quando a folha fecha.
 */

// As cores dos eixos na barra do topo, na ordem do design.
const AXIS_COLOR = [LIVE, ACID, PAPER, '#9a9893', '#5f5e59']

export default function WhyThisBar() {
  const { runId, barId } = useLocalSearchParams<{
    runId: string
    barId: string
  }>()
  const palette = usePalette()
  const dark = palette.dark
  const queryClient = useQueryClient()
  // A rodada já existe: sem localização o servidor só a lê.
  const today = useQuery(
    trpc.recommendations.today.queryOptions({ where: null })
  )
  const item = today.data?.round?.items.find((i) => i.barId === barId)
  const radius = today.data?.userRadiusKm ?? 3
  const [picked, setPicked] = useState<'like' | 'pass' | null>(null)
  const settle = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.recommendations.today.queryKey()
    })
  const like = useMutation(
    trpc.recommendations.like.mutationOptions({ onSettled: settle })
  )
  const pass = useMutation(
    trpc.recommendations.dismiss.mutationOptions({ onSettled: settle })
  )
  const undo = useMutation(
    trpc.recommendations.undo.mutationOptions({ onSettled: settle })
  )

  if (!item) return <View style={{ flex: 1 }} />
  const decided =
    picked ??
    (item.decision === 'liked'
      ? 'like'
      : item.decision === 'passed'
        ? 'pass'
        : null)
  const choose = (next: 'like' | 'pass') => {
    haptic.select()
    if (decided === next) {
      setPicked(null)
      undo.mutate({ runId, barId })
      return
    }
    setPicked(next)
    if (next === 'like') like.mutate({ runId, barId })
    else pass.mutate({ runId, barId })
  }
  const heavy = heaviestAxis(item)
  const total = AXES.reduce((sum, axis) => sum + item.axes[axis.key], 0) || 1

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: dark ? 'rgba(18,18,15,.9)' : 'rgba(241,238,230,.9)'
      }}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Title
            lines={[['POR QUE ', 'ESSE BAR?']]}
            size={40}
            color={palette.ink}
            accentColor={dark ? ACID : palette.live}
          />
        </View>
        <BackButton icon="close" />
      </View>

      <Card palette={palette} shadow={ACID} offset={6}>
        <View style={[styles.summary, { backgroundColor: INK }]}>
          <ScoreBadge score={item.score} size={62} />
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={[text(17, 'Bold', 1.25), { color: PAPER }]}>
              {item.name} combina {Math.round(item.score)} de 100
            </Text>
            <View style={styles.stack}>
              {AXES.map((axis, i) => (
                <View
                  key={axis.key}
                  style={{
                    flex: Math.max(item.axes[axis.key], 0.01) / total,
                    backgroundColor: AXIS_COLOR[i]
                  }}
                />
              ))}
            </View>
            <View style={styles.legend}>
              {AXES.map((axis, i) => (
                <View key={axis.key} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: AXIS_COLOR[i] }
                    ]}
                  />
                  <Text
                    style={[text(13, 'Regular', 1.2), { color: '#c9c6bf' }]}
                  >
                    {axis.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </Card>

      <Card palette={palette} soft>
        {AXES.map((axis, i) => (
          <AxisRow
            key={axis.key}
            item={item}
            axis={axis}
            heavy={axis.key === heavy}
            last={i === AXES.length - 1}
            radius={radius}
          />
        ))}
      </Card>

      <View style={styles.choices}>
        <Choice
          label="Mais assim"
          icon="plus"
          on={decided === 'like'}
          onPress={() => choose('like')}
        />
        <Choice
          label="Menos assim"
          icon="close"
          on={decided === 'pass'}
          onPress={() => choose('pass')}
        />
      </View>
      <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
        As sugestões usam só o que você faz na Onside: jogos que abre, bares que
        marca, códigos validados e avaliações. Dá para recomeçar do zero em
        Configurações · Preferências.
      </Text>
    </ScrollView>
  )
}

function AxisRow({
  item,
  axis,
  heavy,
  last,
  radius
}: {
  item: Suggestion
  axis: (typeof AXES)[number]
  heavy: boolean
  last: boolean
  radius: number
}) {
  const palette = usePalette()
  const points = axisPoints(item, axis.key)
  const fill = heavy ? LIVE : palette.ink
  return (
    <View
      style={[
        styles.axis,
        !last && { borderBottomWidth: 1, borderBottomColor: palette.line }
      ]}
    >
      <View
        style={[
          styles.axisIcon,
          heavy
            ? styles.axisIconHeavy
            : { backgroundColor: palette.dark ? '#2a2a25' : '#ebe7de' }
        ]}
      >
        <Icon
          name={axis.icon}
          size={22}
          color={heavy ? INK : palette.ink}
          accent={heavy ? INK : LIVE}
        />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.axisHead}>
          <Text style={[text(16, 'Bold', 1.25), { color: palette.ink }]}>
            {axis.label}
          </Text>
          {heavy ? (
            <Text style={[text(13, 'Bold', 1.2), { color: palette.live }]}>
              MAIOR PESO
            </Text>
          ) : null}
          <View style={{ flex: 1 }} />
          <Text style={[styles.points, { color: palette.ink }]}>
            {points}/{axis.max}
          </Text>
        </View>
        <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
          {axisLine(item, axis.key, radius)}
        </Text>
        {/* Um tracinho por ponto do teto, como no design. */}
        <View style={styles.dashes}>
          {Array.from({ length: axis.max }, (_, n) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: um tracinho por ponto, a posição é a identidade
              key={`${axis.key}-${n}`}
              style={[
                styles.dash,
                {
                  backgroundColor:
                    n < points ? fill : palette.dark ? '#2a2a25' : '#e7e3db'
                }
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  )
}

function Choice({
  label,
  icon,
  on,
  onPress
}: {
  label: string
  icon: 'plus' | 'close'
  on: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          styles.choice,
          on
            ? { borderColor: palette.ink, backgroundColor: palette.ink }
            : icon === 'plus'
              ? { borderColor: palette.ink }
              : { borderColor: palette.line },
          press.style
        ]}
      >
        <Animated.View
          key={String(on)}
          entering={SWAP}
          style={styles.choiceRow}
        >
          {/* O "+" é o "×" girado: o conjunto de ícones não tem mais. */}
          <View
            style={
              icon === 'plus' && !on
                ? { transform: [{ rotate: '45deg' }] }
                : undefined
            }
          >
            <Icon
              name={on ? 'check' : 'close'}
              size={17}
              color={on ? palette.bg : palette.ink}
            />
          </View>
          <Text
            style={[
              text(17, 'Bold', 1.2),
              { color: on ? palette.bg : palette.ink }
            ]}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 60, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    margin: -1,
    borderRadius: 6
  },
  stack: {
    flexDirection: 'row',
    height: 10,
    gap: 2,
    borderRadius: 2,
    overflow: 'hidden'
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  axis: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  axisIcon: {
    width: 40,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  axisIconHeavy: {
    backgroundColor: ACID,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  axisHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  points: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13.5,
    letterSpacing: 1
  },
  dashes: { flexDirection: 'row', gap: 3, marginTop: 6 },
  dash: { flex: 1, height: 5, borderRadius: 1 },
  choices: { flexDirection: 'row', gap: 12 },
  choice: {
    height: 52,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }
})
