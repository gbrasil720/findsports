import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  withTiming
} from 'react-native-reanimated'
import { EASE, haptic } from '@/components/motion'
import { Icon, INK, text } from '@/components/ui'
import type { Step, Tool } from '@/lib/ai-chat'
import { AiIcon } from './icons'
import { Shimmer, Spinner } from './loader'
import { Chevron } from './response'
import type { AiPalette } from './theme'
import { ToolCard } from './tool'

/*
 * Raciocínio (Reasoning · ChainOfThought): aberto com os passos enquanto
 * pensa; quando a resposta começa, fecha sozinho em "Pensou por 4 s · 2
 * buscas" para ela ficar no topo. Tocar reabre (e mostra as ferramentas já
 * prontas, em linha).
 */

const STEP_IN = FadeInDown.duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 6 }] })
// O passo que termina: o check cresce de 0,6 sem passar do ponto.
const CHECK_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withTiming(1, { duration: 120 }),
      transform: [{ scale: withTiming(1, { duration: 200, easing: EASE }) }]
    }
  }
}
// Os passos saem rápido: a resposta sobe para o lugar deles.
const FOLD_OUT = FadeOut.duration(90)
const FOLD_IN = FadeIn.duration(200)
const RESIZE = LinearTransition.duration(240).easing(EASE)

export function Reasoning({
  steps,
  tools,
  thinking,
  label,
  palette
}: {
  steps: Step[]
  /** Ferramentas prontas: dentro do raciocínio quando ele reabre. */
  tools: Tool[]
  thinking: boolean
  /** "Pensou por 4 s · 2 buscas". */
  label: string
  palette: AiPalette
}) {
  // Aberto enquanto pensa; fecha quando termina. Tocar inverte.
  const [open, setOpen] = useState(thinking)
  useEffect(() => setOpen(thinking), [thinking])

  return (
    <Animated.View layout={RESIZE} style={{ gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={thinking ? 'Pensando' : label}
        disabled={thinking}
        hitSlop={8}
        onPress={() => {
          haptic.select()
          setOpen((v) => !v)
        }}
        style={styles.head}
      >
        {thinking ? (
          <>
            <Spinner size={14} palette={palette} />
            <Shimmer size={13.5} palette={palette}>
              Pensando
            </Shimmer>
          </>
        ) : (
          <Animated.View entering={FOLD_IN} style={styles.headRow}>
            <AiIcon name="spark" size={15} color={palette.muted} />
            <Text
              style={[text(13.5, 'SemiBold', 1.4), { color: palette.muted }]}
            >
              {label}
            </Text>
          </Animated.View>
        )}
        <Chevron open={open} color={palette.muted} />
      </Pressable>
      {open ? (
        <Animated.View exiting={FOLD_OUT} style={{ gap: 12 }}>
          <View style={{ paddingLeft: 2 }}>
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                last={i === steps.length - 1}
                palette={palette}
              />
            ))}
          </View>
          {thinking
            ? null
            : tools
                .filter((t) => t.state === 'done')
                .map((t) => <ToolCard key={t.id} tool={t} palette={palette} />)}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

function StepRow({
  step,
  last,
  palette
}: {
  step: Step
  last: boolean
  palette: AiPalette
}) {
  const done = step.state === 'done'
  return (
    <Animated.View entering={STEP_IN} style={styles.step}>
      <View style={styles.rail}>
        {done ? (
          <Animated.View entering={CHECK_IN} style={styles.check}>
            <Icon name="check" size={10} color={INK} accent={INK} />
          </Animated.View>
        ) : (
          <View style={styles.dot}>
            <Spinner size={16} palette={palette} />
          </View>
        )}
        {last ? null : (
          <View style={[styles.line, { backgroundColor: palette.rail }]} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 10 }}>
        {done ? (
          <Text style={[text(14, 'SemiBold', 1.4), { color: palette.ink }]}>
            {step.label}
          </Text>
        ) : (
          <Shimmer size={14} palette={palette}>
            {step.label}
          </Shimmer>
        )}
        {step.tags?.length ? (
          <View style={styles.tags}>
            {step.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tag, { backgroundColor: palette.stepTag }]}
              >
                <Text
                  style={[
                    text(11.5, 'SemiBold', 1.4),
                    { color: palette.stepTagText }
                  ]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {step.detail ? (
          <Text
            style={[
              text(12.5, 'Regular', 1.4),
              { color: palette.muted, marginTop: 3 }
            ]}
          >
            {step.detail}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  )
}

/** Passo que ainda não começou (o design desenha; o contrato não manda). */
export function TodoStep({
  label,
  palette
}: {
  label: string
  palette: AiPalette
}) {
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.todo, { borderColor: palette.todo }]} />
      </View>
      <Text style={[text(14, 'SemiBold', 1.4), { color: palette.muted }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { flexDirection: 'row', gap: 10 },
  rail: { alignItems: 'center', width: 18 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#c9f135',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dot: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  todo: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  line: { flex: 1, width: 2, minHeight: 12, marginVertical: 3 },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 3
  },
  tag: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 4 }
})
