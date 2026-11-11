import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { haptic, SWAP, usePressScale } from '@/components/motion'
import { ObTitle } from '@/components/ob-frame'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, LIVE, Text, text } from '@/components/ui'
import { AXES, axisLine, axisTag } from '@/lib/suggestions'
import { trpc } from '@/lib/trpc'

/*
 * "Por que esse bar?" (22c): a conta do card em português, eixo por eixo,
 * com os pontos de verdade. "Mais assim" conta como Curti e "Menos assim"
 * como Passo, sem sair da folha (decisão do dono, 21/10/2026); a decisão
 * vale para o baralho quando a folha fecha.
 */

export default function WhyThisBar() {
  const { runId, barId } = useLocalSearchParams<{
    runId: string
    barId: string
  }>()
  const palette = usePalette()
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

  // Os fatores do mais forte ao mais fraco, como o desenho lista (`.pq`).
  const order = [...AXES].sort(
    (x, y) => item.axes[y.key] / y.max - item.axes[x.key] / x.max
  )

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.head}>
        <ObTitle plain="Por que" hot="esse bar?" size={34} breakLine />
        <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
          {item.name} · o que pesou na escolha de hoje
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        {order.map((axis) => (
          <Factor
            key={axis.key}
            icon={axis.icon}
            label={axis.label}
            line={axisLine(item, axis.key, radius)}
            tag={axisTag(item, axis.key)}
          />
        ))}
      </View>

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
      <Text style={[text(13, 'Regular', 1.45), { color: palette.muted }]}>
        As sugestões usam só o que você faz na Onside: jogos que abre, bares que
        marca, códigos validados e avaliações. Dá para recomeçar do zero em
        Configurações · Preferências.
      </Text>
    </ScrollView>
  )
}

/** Um fator (`.pq .f`): o ícone, o nome, a frase e a etiqueta. */
function Factor({
  icon,
  label,
  line,
  tag
}: {
  icon: (typeof AXES)[number]['icon']
  label: string
  line: string
  tag: string
}) {
  const palette = usePalette()
  const strong = tag === 'Sua cara'
  return (
    <View
      style={[
        styles.factor,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <View style={[styles.factorIcon, { backgroundColor: palette.mark }]}>
        <Icon name={icon} size={22} color={palette.ink} accent={LIVE} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(15, 'Bold', 1.3), { color: palette.ink }]}>
          {label}
        </Text>
        <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
          {line}
        </Text>
      </View>
      <View
        style={[styles.tag, { backgroundColor: strong ? ACID : palette.mark }]}
      >
        <Text style={[styles.tagText, { color: strong ? INK : palette.ink }]}>
          {tag}
        </Text>
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
  // `.fs3`: 18 dos lados, 12 entre as peças.
  body: { paddingHorizontal: 18, paddingTop: 26, paddingBottom: 60, gap: 12 },
  head: { gap: 10 },
  factor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  factorIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tag: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 999 },
  tagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    marginVertical: -1.6
  },
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
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }
})
