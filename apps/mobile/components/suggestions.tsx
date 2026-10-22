import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useLayoutEffect
} from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg'
import { scheduleOnRN } from 'react-native-worklets'
import { Glass } from '@/components/glass'
import { EASE, haptic, SWAP, usePressScale } from '@/components/motion'
import { ACID, Icon, INK, LIVE, PAPER, text } from '@/components/ui'
import { gameTitle } from '@/lib/my-games'
import {
  chips,
  distanceText,
  gameWhen,
  isToday,
  reasonLine,
  SLOT_LABEL,
  type Suggestion,
  usualLine
} from '@/lib/suggestions'

/*
 * O baralho de "Bares pra você" (23a–23c, gestos da 23g): o card de foto,
 * que é escuro nos dois temas, e o arraste. Direita Curti, esquerda Passo,
 * para cima abre a página do bar, toque nas laterais da foto troca a foto
 * (o bar tem uma só: o toque dá só um balanço). Tudo no thread de UI; o JS
 * só fica sabendo quando a decisão já foi tomada.
 */

export const CARD_W = 358
export const CARD_H = 560
const MUTE = '#aaa9a4'
const SOFT = '#d6d3cb'
const FLY = 520
// Onde a soltura decide: projetada pela velocidade, um peteleco basta.
const COMMIT_X = 120
const COMMIT_UP = 140
const SNAP = { duration: 400, dampingRatio: 0.8 } as const
const OUT = {
  duration: 300,
  dampingRatio: 1,
  overshootClamping: true
} as const
// Com movimento reduzido a viagem vira fade, e o fade não pode virar corte.
const FADE = { duration: 160, reduceMotion: ReduceMotion.Never } as const

/** Quanto mais longe do lugar, menos o card segue o dedo (borda macia). */
function rubberband(offset: number, dimension: number) {
  'worklet'
  return (offset * dimension * 0.55) / (dimension + 0.55 * Math.abs(offset))
}

/** Onde o dedo pararia se continuasse desacelerando (curva da Apple). */
function project(velocity: number) {
  'worklet'
  return ((velocity / 1000) * 0.998) / (1 - 0.998)
}

// --- Peças do card -----------------------------------------------------------

/** "86 COMBINA": a nota arredondada, no quadrado acid. */
export function ScoreBadge({
  score,
  size = 56
}: {
  score: number
  size?: number
}) {
  const k = size / 56
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, shadowOffset: { width: 3, height: 3 } }
      ]}
    >
      <Text style={[styles.badgeNumber, { fontSize: 28 * k }]}>
        {Math.round(score)}
      </Text>
      <Text style={[styles.badgeLabel, { fontSize: 9 * k }]}>COMBINA</Text>
    </View>
  )
}

const SLOT_DOT = { sua_cara: ACID, pra_variar: PAPER, vale_arriscar: LIVE }

/** "1 Sua cara": a posição e a regra que a escolheu (22e). */
export function SlotPill({ item }: { item: Suggestion }) {
  const dot = SLOT_DOT[item.slot]
  return (
    <View style={styles.slot}>
      <View style={[styles.slotDot, { backgroundColor: dot }]}>
        <Text
          style={[styles.slotNumber, { color: dot === LIVE ? PAPER : INK }]}
        >
          {item.position}
        </Text>
      </View>
      <Text style={[text(12, 'Bold', 1.2), { color: PAPER }]}>
        {SLOT_LABEL[item.slot]}
      </Text>
    </View>
  )
}

/** A foto do bar com o degradê do design; sem foto, o cinza do design. */
export function CardPhoto({ uri }: { uri: string | null }) {
  return (
    <>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: CARD_W, height: CARD_H, position: 'absolute' }}
          resizeMode="cover"
        />
      ) : null}
      <LinearGradient
        colors={[
          'rgba(18,18,15,.45)',
          'rgba(18,18,15,0)',
          'rgba(18,18,15,0)',
          'rgba(18,18,15,.95)'
        ]}
        locations={[0, 0.2, 0.34, 0.74]}
        style={StyleSheet.absoluteFill}
      />
    </>
  )
}

type CardActions = {
  onOpen: () => void
  onGo: () => void
  onRemind: () => void
  onAlert: () => void
}

/** O card de um bar (23a). Sem gesto: o arraste é do `Deck`. */
export function SuggestionCard({
  item,
  now,
  actions,
  behind
}: {
  item: Suggestion
  now: number
  actions?: CardActions
  /** Card de trás da pilha: só a foto e o topo, como no design. */
  behind?: boolean
}) {
  const game = item.game
  const today = game ? isToday(game.startsAt, now) : false
  const alerted = item.alerts.sportIds.length + item.alerts.teamIds.length > 0
  return (
    <View style={styles.card}>
      <CardPhoto uri={item.photoUrl} />
      {/* Uma foto por bar: a faixa é um segmento só, cheio. */}
      <View style={styles.segments}>
        <View style={styles.segment} />
      </View>
      <View style={styles.top}>
        <SlotPill item={item} />
        <ScoreBadge score={item.score} />
      </View>
      {behind ? null : (
        <View style={styles.bottom}>
          <View style={styles.nameRow}>
            {/* Nome longo encolhe até 60% antes de cortar: a altura de linha
                natural do Anton deixava duas linhas muito separadas. */}
            <Text
              style={styles.name}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {item.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir a página do ${item.name}`}
              hitSlop={8}
              onPress={actions?.onOpen}
              style={styles.up}
            >
              <Icon name="arrowUp" size={16} color={PAPER} />
            </Pressable>
          </View>
          <Text style={[text(14), styles.where]} numberOfLines={1}>
            {[item.neighborhood, distanceText(item.distanceKm)]
              .filter(Boolean)
              .join(' · ')}
            {item.isExpandedRadius ? ' · Fora do seu raio' : ''}
          </Text>
          <View style={styles.reason}>
            <Icon name="sparkle" size={16} color={INK} accent={LIVE} />
            <Text style={[text(13.5, 'SemiBold', 1.35), styles.reasonText]}>
              {reasonLine(item)}
            </Text>
          </View>
          {chips(item).length ? (
            <View style={styles.chips}>
              {chips(item).map((axis) => (
                <View key={axis.key} style={styles.chip}>
                  <Icon
                    name={axis.icon}
                    size={13}
                    color={PAPER}
                    accent={ACID}
                  />
                  <Text style={[text(12, 'SemiBold', 1.2), { color: PAPER }]}>
                    {axis.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.game}>
            <Icon
              name={game ? 'tv' : 'calendar'}
              size={20}
              color={PAPER}
              accent={ACID}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[styles.when, { color: game ? ACID : MUTE }]}
                numberOfLines={1}
              >
                {game ? gameWhen(game.startsAt, now) : 'SEM JOGO MARCADO'}
              </Text>
              <Text
                style={[text(13.5, 'Bold', 1.3), styles.gameTitle]}
                numberOfLines={game ? 1 : 2}
              >
                {game ? gameTitle(game) : usualLine(item)}
              </Text>
            </View>
            {game && today ? (
              <GamePill
                label={game.attending ? 'Você vai' : 'Vou assistir'}
                icon="ticket"
                solid
                onPress={actions?.onGo}
              />
            ) : game ? (
              <GamePill
                label={game.reminded ? 'Lembrete' : 'Lembrar'}
                icon={game.reminded ? 'check' : 'bell'}
                on={game.reminded}
                onPress={actions?.onRemind}
              />
            ) : item.facts.usualSports.length ? (
              <GamePill
                label={alerted ? 'Avisando' : 'Avisar'}
                icon={alerted ? 'check' : 'bell'}
                on={alerted}
                onPress={actions?.onAlert}
              />
            ) : null}
          </View>
        </View>
      )}
    </View>
  )
}

function GamePill({
  label,
  icon,
  solid,
  on,
  onPress
}: {
  label: string
  icon: 'ticket' | 'bell' | 'check'
  solid?: boolean
  on?: boolean
  onPress?: () => void
}) {
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      hitSlop={6}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.pill,
          solid || on ? styles.pillSolid : styles.pillGhost,
          press.style
        ]}
      >
        {/* O rótulo que muda ("Avisar" → "Avisando") troca suave. */}
        <Animated.View key={label} entering={SWAP} style={styles.pillRow}>
          <Icon
            name={icon}
            size={15}
            color={solid || on ? INK : PAPER}
            accent={solid || on ? INK : ACID}
          />
          <Text
            style={[
              text(13, 'Bold', 1.2),
              { color: solid || on ? INK : PAPER }
            ]}
          >
            {label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}

// --- Baralho ----------------------------------------------------------------

export type DeckHandle = {
  /** Os botões Passo e Curti mandam o card como o arraste mandaria. */
  fling: (direction: 'like' | 'pass') => void
}

type DeckProps = {
  items: Suggestion[]
  now: number
  onDecide: (item: Suggestion, direction: 'like' | 'pass') => void
  onOpen: (item: Suggestion) => void
  actions: (item: Suggestion) => CardActions
  /** O arraste, de -1 (Passo) a 1 (Curti), para os botões e a pílula. */
  drag: SharedValue<number>
  /** Voltar: o card desfeito entra pelo lado de onde saiu. */
  returning: { barId: string; direction: 'like' | 'pass' } | null
}

export const Deck = forwardRef<DeckHandle, DeckProps>(function Deck(
  { items, now, onDecide, onOpen, actions, drag, returning },
  ref
) {
  const reduced = useReducedMotion()
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const fade = useSharedValue(1)
  const start = useSharedValue({ x: 0, y: 0 })
  const nudge = useSharedValue(0)
  // No voo de saída ou de volta o `drag` desce sozinho e o háptico de limite cala.
  const flying = useSharedValue(false)
  const top = items[0]

  // A decisão vai ao JS só quando o card já saiu da tela.
  const decide = (direction: 'like' | 'pass') => {
    if (top) onDecide(top, direction)
  }
  const open = () => {
    if (top) onOpen(top)
  }

  // O card de cima mudou: o próximo assume no lugar, sem pulo; o desfeito
  // pelo Voltar entra pelo lado de onde saiu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage ao card de cima
  useLayoutEffect(() => {
    y.set(0)
    flying.set(false)
    if (returning && returning.barId === top?.barId) {
      if (reduced) {
        x.set(0)
        fade.set(0)
        fade.set(withTiming(1, FADE))
      } else {
        fade.set(1)
        flying.set(true)
        x.set(returning.direction === 'like' ? FLY : -FLY)
        x.set(
          withSpring(0, SNAP, () => {
            'worklet'
            flying.set(false)
          })
        )
      }
      return
    }
    x.set(0)
    fade.set(1)
  }, [top?.barId])

  useAnimatedReaction(
    () => Math.max(-1, Math.min(1, x.get() / COMMIT_X)),
    (value) => {
      if (!flying.get()) drag.set(value)
    }
  )
  // Passar do ponto de soltura dá um toque, uma vez em cada sentido.
  useAnimatedReaction(
    () => (Math.abs(x.get()) >= COMMIT_X ? Math.sign(x.get()) : 0),
    (now, before) => {
      if (!flying.get() && before !== null && now !== before && now !== 0)
        scheduleOnRN(haptic.select)
    }
  )

  const flyOut = (direction: 'like' | 'pass', velocity = 0) => {
    'worklet'
    const to = direction === 'like' ? FLY : -FLY
    flying.set(true)
    drag.set(withTiming(0, { duration: 180, easing: EASE }))
    const done = (finished?: boolean) => {
      'worklet'
      if (finished) scheduleOnRN(decide, direction)
    }
    if (reduced) {
      fade.set(withTiming(0, FADE, done))
      return
    }
    // O peteleco leva a velocidade junto: mola sem quique, que parte na
    // velocidade do dedo em vez de dar tranco ao soltar.
    x.set(withSpring(to, { ...OUT, velocity }, done))
  }

  useImperativeHandle(ref, () => ({
    fling: (direction) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      flyOut(direction)
    }
  }))

  const pan = Gesture.Pan()
    .minDistance(8)
    // Um dedo só: trocar de dedo no meio do arraste fazia o card pular.
    .maxPointers(1)
    .onStart(() => {
      // Pegar o card no meio da volta continua de onde ele está.
      start.set({ x: x.get(), y: y.get() })
    })
    .onUpdate((e) => {
      x.set(start.get().x + e.translationX)
      // Só "para cima" tem função (abrir o bar): o vertical resiste.
      y.set(rubberband(start.get().y + e.translationY, CARD_H))
    })
    .onEnd((e) => {
      const px = x.get() + project(e.velocityX)
      // A decisão olha o dedo, não o card que resiste.
      const py = start.get().y + e.translationY + project(e.velocityY)
      if (px > COMMIT_X || px < -COMMIT_X) {
        scheduleOnRN(Haptics.impactAsync, Haptics.ImpactFeedbackStyle.Light)
        flyOut(px > 0 ? 'like' : 'pass', e.velocityX)
        return
      }
      if (py < -COMMIT_UP && Math.abs(x.get()) < 60) scheduleOnRN(open)
      x.set(withSpring(0, { ...SNAP, velocity: e.velocityX }))
      y.set(withSpring(0, { ...SNAP, velocity: e.velocityY }))
    })

  // Toque nas laterais da foto: uma foto só, então um balanço curto.
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e, ok) => {
      if (!ok || e.y > CARD_H * 0.55) return
      const side = e.x < CARD_W * 0.3 ? -1 : e.x > CARD_W * 0.7 ? 1 : 0
      if (!side) return
      scheduleOnRN(haptic.select)
      if (reduced) return
      nudge.set(
        withTiming(side * 6, { duration: 90, easing: EASE }, () => {
          nudge.set(withSpring(0, SNAP))
        })
      )
    })

  const topStyle = useAnimatedStyle(() => ({
    opacity: fade.get(),
    transform: [
      { translateX: x.get() + nudge.get() },
      { translateY: y.get() },
      // Gira pela base, como uma carta na mão (design: 110 px → 10°).
      { rotate: `${(x.get() / CARD_W) * 30}deg` }
    ]
  }))
  const likeRing = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, COMMIT_X], [0, 1], Extrapolation.CLAMP)
  }))
  const passRing = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, -COMMIT_X], [0, 1], Extrapolation.CLAMP)
  }))
  const progress = () => {
    'worklet'
    return Math.min(1, Math.abs(x.get()) / COMMIT_X)
  }
  const second = useAnimatedStyle(() => {
    const p = progress()
    return {
      transform: [{ translateY: 12 - 12 * p }, { scale: 0.95 + 0.05 * p }]
    }
  })
  const secondShade = useAnimatedStyle(() => ({
    opacity: 0.25 * (1 - progress())
  }))
  const third = useAnimatedStyle(() => {
    const p = progress()
    return {
      transform: [{ translateY: 24 - 12 * p }, { scale: 0.9 + 0.05 * p }]
    }
  })
  const thirdShade = useAnimatedStyle(() => ({
    opacity: 0.45 - 0.2 * progress()
  }))

  const [next, after] = [items[1], items[2]]
  return (
    <View style={styles.deck}>
      {after ? (
        <Animated.View style={[styles.layer, third]}>
          <SuggestionCard item={after} now={now} behind />
          <Animated.View style={[styles.shade, thirdShade]} />
        </Animated.View>
      ) : null}
      {next ? (
        <Animated.View style={[styles.layer, second]}>
          <SuggestionCard item={next} now={now} behind />
          <Animated.View style={[styles.shade, secondShade]} />
        </Animated.View>
      ) : null}
      {top ? (
        <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
          <Animated.View
            key={top.barId}
            style={[styles.layer, styles.topCard, topStyle]}
          >
            <SuggestionCard item={top} now={now} actions={actions(top)} />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { borderColor: ACID, backgroundColor: 'rgba(201,241,53,.12)' },
                likeRing
              ]}
            />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.ring,
                { borderColor: LIVE, backgroundColor: 'rgba(232,50,12,.16)' },
                passRing
              ]}
            />
            <Stamp label="CURTI" color={ACID} side="left" x={x} />
            <Stamp label="PASSO" color={LIVE} side="right" x={x} />
          </Animated.View>
        </GestureDetector>
      ) : null}
    </View>
  )
})

/** O carimbo inclinado que aparece com o arraste (23b, 23c). */
function Stamp({
  label,
  color,
  side,
  x
}: {
  label: string
  color: string
  side: 'left' | 'right'
  x: SharedValue<number>
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(
      x.get(),
      side === 'left' ? [20, COMMIT_X] : [-20, -COMMIT_X],
      [0, 1],
      Extrapolation.CLAMP
    )
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.stamp,
        side === 'left'
          ? { left: 22, transform: [{ rotate: '-16deg' }] }
          : { right: 22, transform: [{ rotate: '16deg' }] },
        { borderColor: color },
        style
      ]}
    >
      <Text style={[styles.stampText, { color }]}>{label}</Text>
    </Animated.View>
  )
}

// --- Botões e brilho ---------------------------------------------------------

/** O clarão do lado para onde o card vai (acid à direita, vermelho à esquerda). */
export function EdgeGlow({ drag }: { drag: SharedValue<number> }) {
  const right = useAnimatedStyle(() => ({ opacity: Math.max(0, drag.get()) }))
  const left = useAnimatedStyle(() => ({ opacity: Math.max(0, -drag.get()) }))
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { right: -120 }, right]}
      >
        <Blob color={ACID} strength={0.55} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { left: -120 }, left]}
      >
        <Blob color={LIVE} strength={0.45} />
      </Animated.View>
    </>
  )
}

function Blob({ color, strength }: { color: string; strength: number }) {
  return (
    <Svg width={300} height={420}>
      <Defs>
        <RadialGradient id={`g${color.slice(1)}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Ellipse
        cx={150}
        cy={210}
        rx={150}
        ry={210}
        fill={`url(#g${color.slice(1)})`}
      />
    </Svg>
  )
}

/** "SOLTA PRA CURTIR · vai para Salvos": aparece depois do ponto de soltura. */
export function ReleaseHint({
  drag,
  dark
}: {
  drag: SharedValue<number>
  dark: boolean
}) {
  // Segue o dedo: aparece no último trecho antes da soltura.
  const like = useAnimatedStyle(() => {
    const p = interpolate(drag.get(), [0.7, 1], [0, 1], Extrapolation.CLAMP)
    return { opacity: p, transform: [{ translateY: 6 * (1 - p) }] }
  })
  const pass = useAnimatedStyle(() => {
    const p = interpolate(-drag.get(), [0.7, 1], [0, 1], Extrapolation.CLAMP)
    return { opacity: p, transform: [{ translateY: 6 * (1 - p) }] }
  })
  return (
    <View pointerEvents="none" style={styles.hintRow}>
      <Animated.View style={[styles.hint, styles.hintLike, like]}>
        <Text style={[styles.hintStrong, { color: INK }]}>
          Solta pra curtir
        </Text>
        <Text style={[text(12.5, 'Regular', 1.2), { color: INK }]}>
          vai para Salvos
        </Text>
      </Animated.View>
      <Animated.View
        style={[
          styles.hint,
          {
            backgroundColor: dark
              ? 'rgba(232,50,12,.75)'
              : 'rgba(232,50,12,.85)'
          },
          pass
        ]}
      >
        <Text style={[styles.hintStrong, { color: PAPER }]}>
          Solta pra passar
        </Text>
        <Text style={[text(12.5, 'Regular', 1.2), { color: PAPER }]}>
          some por 30 dias
        </Text>
      </Animated.View>
    </View>
  )
}

/**
 * Voltar, Passo, Curti e Por quê (23a). Passo e Curti crescem com o arraste
 * para o lado deles; os de vidro só encolhem (vidro não leva transparência
 * animada).
 */
export function DeckButtons({
  drag,
  dark,
  canUndo,
  onUndo,
  onPass,
  onLike,
  onWhy
}: {
  drag: SharedValue<number>
  dark: boolean
  canUndo: boolean
  onUndo: () => void
  onPass: () => void
  onLike: () => void
  onWhy: () => void
}) {
  const side = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.08 * Math.min(1, Math.abs(drag.get())) }]
  }))
  const pass = useAnimatedStyle(() => {
    const d = drag.get()
    return {
      transform: [{ scale: d < 0 ? 1 + 0.12 * -d : 1 - 0.08 * d }],
      opacity: d > 0 ? 1 - 0.45 * d : 1
    }
  })
  const like = useAnimatedStyle(() => {
    const d = drag.get()
    return {
      transform: [{ scale: d > 0 ? 1 + 0.12 * d : 1 + 0.08 * d }],
      opacity: d < 0 ? 1 + 0.45 * d : 1
    }
  })
  // O anel de 6 pt do design em volta do botão para onde o card vai.
  const passHalo = useAnimatedStyle(() => ({
    opacity: Math.max(0, -drag.get())
  }))
  const likeHalo = useAnimatedStyle(() => ({
    opacity: Math.max(0, drag.get())
  }))
  const label = dark ? MUTE : '#55554f'
  const edge = dark ? '#000' : INK
  return (
    <View style={styles.buttons}>
      <RoundAction
        label="Voltar"
        color={label}
        disabled={!canUndo}
        onPress={onUndo}
      >
        <Animated.View style={side}>
          <Glass
            tone={dark ? 'dark' : 'light'}
            interactive
            style={styles.small}
          >
            <Icon name="back" size={19} color={dark ? PAPER : INK} />
          </Glass>
        </Animated.View>
      </RoundAction>
      <RoundAction label="Passo" color={label} onPress={onPass}>
        <Animated.View
          style={[
            styles.big,
            { backgroundColor: LIVE, shadowColor: edge },
            pass
          ]}
        >
          <Animated.View
            style={[
              styles.halo,
              { borderColor: 'rgba(232,50,12,.25)' },
              passHalo
            ]}
          />
          <Icon name="close" size={29} color={PAPER} />
        </Animated.View>
      </RoundAction>
      <RoundAction label="Curti" color={label} onPress={onLike}>
        <Animated.View
          style={[
            styles.big,
            { backgroundColor: ACID, shadowColor: edge },
            like
          ]}
        >
          <Animated.View
            style={[
              styles.halo,
              { borderColor: 'rgba(201,241,53,.3)' },
              likeHalo
            ]}
          />
          <Icon name="fan" size={29} color={INK} accent={INK} />
        </Animated.View>
      </RoundAction>
      <RoundAction label="Por quê" color={label} onPress={onWhy}>
        <Animated.View style={side}>
          <Glass
            tone={dark ? 'dark' : 'light'}
            interactive
            style={styles.small}
          >
            <Icon name="eye" size={19} color={dark ? PAPER : INK} />
          </Glass>
        </Animated.View>
      </RoundAction>
    </View>
  )
}

function RoundAction({
  label,
  color,
  disabled,
  onPress,
  children
}: {
  label: string
  color: string
  disabled?: boolean
  onPress: () => void
  children: ReactNode
}) {
  const press = usePressScale(0.94)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.action}
    >
      <Animated.View style={press.style}>{children}</Animated.View>
      <Text style={[text(11, 'SemiBold', 1.2), { color }]}>{label}</Text>
    </Pressable>
  )
}

/** Uma cópia pequena do card, para a fileira da 23f e da 23h. */
export function MiniCard({
  item,
  label,
  width = 92,
  height = width * 1.7,
  tilt = 0,
  dark
}: {
  item: Suggestion
  label: string | null
  width?: number
  height?: number
  tilt?: number
  dark: boolean
}) {
  return (
    <View style={{ width, alignItems: 'center', gap: 8 }}>
      <View
        style={[
          styles.mini,
          { width, height, transform: [{ rotate: `${tilt}deg` }] }
        ]}
      >
        {item.photoUrl ? (
          <Image
            source={{ uri: item.photoUrl }}
            style={{ width, height, position: 'absolute' }}
          />
        ) : null}
        <LinearGradient
          colors={['rgba(18,18,15,0)', 'rgba(18,18,15,.7)']}
          style={StyleSheet.absoluteFill}
        />
        {label ? (
          <View
            style={[
              styles.miniTag,
              label === 'VOU'
                ? { backgroundColor: ACID }
                : label === 'CURTI'
                  ? { backgroundColor: dark ? PAPER : INK }
                  : { backgroundColor: 'rgba(110,60,50,.85)' }
            ]}
          >
            <Text
              style={[
                styles.miniTagText,
                {
                  color:
                    label === 'VOU'
                      ? INK
                      : label === 'CURTI'
                        ? dark
                          ? INK
                          : PAPER
                        : '#e6cfc7'
                }
              ]}
            >
              {label}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[
          text(12.5, 'Bold', 1.2),
          { color: dark ? PAPER : INK, maxWidth: width }
        ]}
        numberOfLines={1}
      >
        {item.name}
      </Text>
    </View>
  )
}

/** O lugar vazio da rodada curta (23h): tracejado com "?". */
export function MissingCard({
  width = 92,
  height = width * 1.7,
  dark
}: {
  width?: number
  height?: number
  dark: boolean
}) {
  return (
    <View
      style={[
        styles.missing,
        {
          width,
          height,
          borderColor: dark ? 'rgba(241,238,230,.25)' : 'rgba(18,18,15,.25)'
        }
      ]}
    >
      <Text
        style={{
          fontFamily: 'Anton',
          fontSize: 26,
          color: dark ? 'rgba(241,238,230,.3)' : 'rgba(18,18,15,.3)'
        }}
      >
        ?
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0
  },
  badgeNumber: { fontFamily: 'Anton', color: INK, marginVertical: -6 },
  badgeLabel: {
    fontFamily: 'GeistMono-Bold',
    color: INK,
    letterSpacing: 0.36,
    marginTop: 1
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 26,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 13,
    backgroundColor: 'rgba(18,18,15,.72)'
  },
  slotDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  slotNumber: { fontFamily: 'Anton', fontSize: 11, marginVertical: -4 },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#2a2a25'
  },
  segments: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 10,
    flexDirection: 'row',
    gap: 4
  },
  segment: { flex: 1, height: 3.5, borderRadius: 2, backgroundColor: PAPER },
  top: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 9 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10
  },
  name: {
    flex: 1,
    fontFamily: 'Anton',
    fontSize: 44,
    color: PAPER,
    textTransform: 'uppercase',
    letterSpacing: -0.44,
    marginVertical: -8
  },
  up: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(241,238,230,.16)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.25)'
  },
  where: { color: SOFT, marginTop: -3 },
  reason: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: 'rgba(201,241,53,.92)'
  },
  reasonText: { color: INK, flex: 1 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(241,238,230,.14)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.2)'
  },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingRight: 8,
    paddingLeft: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(18,18,15,.55)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.18)'
  },
  when: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 },
  gameTitle: { color: PAPER, marginTop: 2 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillSolid: { backgroundColor: ACID },
  pillGhost: {
    backgroundColor: 'rgba(241,238,230,.14)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.25)'
  },
  deck: { width: CARD_W, height: CARD_H, alignSelf: 'center' },
  layer: { position: 'absolute', left: 0, top: 0, transformOrigin: '50% 100%' },
  topCard: {
    transformOrigin: '50% 120%',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 24 }
  },
  shade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: '#000'
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 14,
    borderWidth: 3
  },
  stamp: {
    position: 'absolute',
    top: 110,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 4
  },
  stampText: {
    fontFamily: 'Anton',
    fontSize: 48,
    marginVertical: -12,
    textShadowColor: 'rgba(0,0,0,.4)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 2 }
  },
  glow: { position: 'absolute', top: 200, width: 300, height: 420 },
  hintRow: { height: 30, alignItems: 'center' },
  hint: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15
  },
  hintLike: { backgroundColor: 'rgba(201,241,53,.85)' },
  hintStrong: {
    fontFamily: 'Anton',
    fontSize: 15,
    textTransform: 'uppercase',
    marginVertical: -4
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 22
  },
  action: { alignItems: 'center', gap: 6 },
  small: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  big: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  halo: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 39,
    borderWidth: 6
  },
  mini: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#2a2a25',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10
  },
  miniTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4 },
  miniTagText: { fontFamily: 'Anton', fontSize: 14, marginVertical: -3 },
  missing: {
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center'
  }
})
