import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { EASE, haptic } from '@/components/motion'
import { Icon, MAX_FONT_SCALE, Text, text } from '@/components/ui'
import type { Step } from '@/lib/ai-chat'
import { Chevron } from './response'
import type { AiPalette } from './theme'

/*
 * Raciocínio no padrão Chain of Thought (rodada 5, tela 4b): sem caixa, texto
 * apagado sobre a folha. Aberto com os passos enquanto pensa; com a resposta,
 * fecha sozinho numa linha em mono ("Pensou por 6 s · 1 busca") e tocar
 * reabre. Cada passo tem o ícone do que fez, ligado ao próximo por um fio;
 * o atual vai na cor cheia com um giro, os que faltam a 45%. As ferramentas
 * não aparecem aqui: o que o passo achou vai nas etiquetas.
 */

const STEP_IN = FadeIn.duration(150)
const FOLD_OUT = FadeOut.duration(90)
const FOLD_IN = FadeIn.duration(200)
const RESIZE = LinearTransition.duration(200).easing(EASE)

/** O ícone de cada passo pelo id que o servidor manda. */
const STEP_ICON: Record<string, Parameters<typeof Icon>[0]['name']> = {
  understood: 'doc',
  game: 'calendar',
  search: 'search',
  rank: 'sliders'
}

export function Reasoning({
  steps,
  thinking,
  label,
  palette
}: {
  steps: Step[]
  thinking: boolean
  /** "Pensou por 4 s · 2 buscas". */
  label: string
  palette: AiPalette
}) {
  // Aberto enquanto pensa; fecha quando termina. Tocar inverte.
  const [open, setOpen] = useState(thinking)
  useEffect(() => setOpen(thinking), [thinking])

  return (
    <Animated.View layout={RESIZE} style={{ gap: 10 }}>
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
        <Icon
          name="sparkle"
          size={open ? 16 : 14}
          color={palette.muted}
          accent={palette.muted}
        />
        <Animated.Text
          key={thinking ? 'thinking' : label}
          entering={FOLD_IN}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[
            open ? text(14, 'Regular', 1.35) : styles.mono,
            { color: palette.muted }
          ]}
        >
          {thinking ? 'Pensando' : label}
        </Animated.Text>
        <Chevron open={open} color={palette.muted} />
      </Pressable>
      {open ? (
        <Animated.View exiting={FOLD_OUT}>
          {steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              last={i === steps.length - 1}
              palette={palette}
            />
          ))}
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
  const now = step.state === 'run'
  const color = now ? palette.ink : palette.muted
  return (
    <Animated.View
      entering={STEP_IN}
      style={[
        styles.step,
        { paddingBottom: last ? 0 : 14 },
        step.state === 'todo' && { opacity: 0.45 }
      ]}
    >
      {last ? null : (
        <View style={[styles.line, { backgroundColor: palette.rail }]} />
      )}
      <View style={styles.icon}>
        {now ? (
          <Spin palette={palette} />
        ) : (
          <Icon
            name={STEP_ICON[step.id] ?? 'check'}
            size={16}
            color={palette.muted}
            accent={palette.muted}
          />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(14, 'Regular', 1.35), { color }]}>{step.label}</Text>
        {step.detail ? (
          <Text
            style={[
              text(12.5, 'Regular', 1.4),
              { color: palette.muted, opacity: 0.8, marginTop: 2 }
            ]}
          >
            {step.detail}
          </Text>
        ) : null}
        {step.tags?.length ? (
          <View style={styles.tags}>
            {step.tags.map((tag) => (
              <View
                key={tag}
                style={[styles.tag, { backgroundColor: palette.mark }]}
              >
                <Text
                  style={[text(11.5, 'Regular', 1), { color: palette.ink }]}
                >
                  {tag}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

/** O giro do passo atual (800 ms, linear); com menos movimento, parado. */
function Spin({ palette }: { palette: AiPalette }) {
  const reduced = useReducedMotion()
  const turn = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    turn.set(
      withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1)
    )
    return () => cancelAnimation(turn)
  }, [reduced, turn])
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.get() * 360}deg` }]
  }))
  return (
    <Animated.View
      style={[
        styles.spin,
        { borderColor: palette.rail, borderTopColor: palette.ink },
        style
      ]}
    />
  )
}

/** Passo que ainda não começou ("Comparar e ordenar" vazio, 24b). */
export function TodoStep({
  label,
  palette
}: {
  label: string
  palette: AiPalette
}) {
  return (
    <StepRow
      step={{ id: 'rank', label, state: 'todo' }}
      last
      palette={palette}
    />
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  step: { flexDirection: 'row', gap: 10 },
  icon: {
    width: 16,
    height: 16,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  line: { position: 'absolute', left: 7.5, top: 20, bottom: 2, width: 1 },
  spin: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  tag: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 }
})
