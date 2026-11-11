import { gameTitle } from '@findsports_oficial/db/game-title'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import {
  forwardRef,
  type ReactNode,
  useImperativeHandle,
  useLayoutEffect
} from 'react'
import { Image, Pressable, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { EASE, haptic, SWAP, usePressScale } from '@/components/motion'
import { ACID, Icon, INK, LIVE, PAPER, Text, text } from '@/components/ui'
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
// Passado daqui o card já saiu da tela (o canto de baixo, girado, é o último
// a sair): a decisão vai ao JS sem esperar a cauda da mola.
const GONE = 330
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

/** A foto na metade de cima (`.ph2`), apagando na tinta do card. */
export function CardPhoto({ uri }: { uri: string | null }) {
  return (
    <View style={styles.photo}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      <LinearGradient
        colors={['rgba(18,18,15,0)', 'rgba(18,18,15,0)', INK]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

type CardActions = {
  onOpen: () => void
  onGo: () => void
  onRemind: () => void
  onAlert: () => void
}

/**
 * O card de um bar (rodada 4, `.cardx`): escuro nos dois temas, a foto na
 * metade de cima, o bairro, a distância e a nota em mono, o nome em Anton, a
 * frase do motivo (o jogo em acid), os chips do porquê e, embaixo, Avisar ou
 * Lembrar e quem vai. Sem gesto: o arraste é do `Deck`.
 */
export function SuggestionCard({
  item,
  now,
  actions,
  behind,
  reveal
}: {
  item: Suggestion
  now: number
  actions?: CardActions
  /** Card de trás da pilha: só a foto e o topo, como no design. */
  behind?: boolean
  /** O de trás com o resto por baixo, que aparece quando o de cima sai. */
  reveal?: SharedValue<number>
}) {
  const game = item.game
  const today = game ? isToday(game.startsAt, now) : false
  const alerted = item.alerts.sportIds.length + item.alerts.teamIds.length > 0
  const meta = [
    item.neighborhood,
    distanceText(item.distanceKm),
    item.facts.rating ? `${item.facts.rating.percentage}% voltariam` : null
  ]
    .filter(Boolean)
    .join(' · ')
    .toLocaleUpperCase('pt-BR')
  const going = game?.going?.count ?? null
  return (
    <View style={styles.card}>
      <CardPhoto uri={item.photoUrl} />
      {behind && !reveal ? null : (
        <Reveal value={reveal}>
          <View style={styles.bottom}>
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
              {item.isExpandedRadius ? ' · FORA DO RAIO' : ''}
            </Text>
            <View style={styles.nameRow}>
              {/* Anton em duas linhas com o entrelinha do desenho (.95):
                  uma linha por vez, com margem negativa. */}
              <View style={{ flex: 1 }} accessible accessibilityRole="header">
                {nameLines(item.name).map((line) => (
                  <Text
                    key={line}
                    style={styles.name}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {line}
                  </Text>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir a página do ${item.name}`}
                hitSlop={10}
                onPress={actions?.onOpen}
                style={styles.up}
              >
                <Icon name="arrowUp" size={16} color={PAPER} />
              </Pressable>
            </View>
            <Text style={[text(14.5, 'Regular', 1.4), styles.why]}>
              {game && today ? (
                <>
                  Passa{' '}
                  <Text style={{ color: ACID, fontFamily: 'Archivo-Bold' }}>
                    {gameTitle(game)}
                  </Text>{' '}
                  hoje às {gameWhen(game.startsAt, now).split(' ').at(-1)}.
                </>
              ) : (
                reasonLine(item)
              )}
            </Text>
            {chips(item).length ? (
              <View style={styles.chips}>
                {chips(item).map((axis) => (
                  <View key={axis.key} style={styles.chip}>
                    <Text style={styles.chipText}>
                      {axis.label.toLocaleUpperCase('pt-BR')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.minis}>
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
              {going ? (
                <View style={styles.goingPill}>
                  <Icon name="people" size={16} color={PAPER} />
                  <Text style={[text(13, 'SemiBold', 1.2), { color: PAPER }]}>
                    {going} {going === 1 ? 'vai' : 'vão'}
                  </Text>
                </View>
              ) : game ? null : (
                <Text
                  style={[text(12.5, 'Regular', 1.3), styles.usual]}
                  numberOfLines={2}
                >
                  {usualLine(item)}
                </Text>
              )}
            </View>
          </View>
        </Reveal>
      )}
    </View>
  )
}

function Reveal({
  value,
  children
}: {
  value?: SharedValue<number>
  children: ReactNode
}) {
  const style = useAnimatedStyle(() => ({ opacity: value ? value.get() : 1 }))
  if (!value) return children
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      {children}
    </Animated.View>
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

/**
 * O nome em até duas linhas, quebrando no espaço mais perto do meio quando
 * não cabe numa só (13 letras em Anton 38 na largura do card).
 */
function nameLines(name: string) {
  const upper = name.toLocaleUpperCase('pt-BR')
  if (upper.length <= 13 || !upper.includes(' ')) return [upper]
  const words = upper.split(' ')
  let best = 1
  let gap = Number.POSITIVE_INFINITY
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(' ').length
    const right = words.slice(i).join(' ').length
    if (Math.max(left, right) < gap) {
      gap = Math.max(left, right)
      best = i
    }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')]
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
  // O resto do próximo card aparece quando o de cima é lançado: o JS ainda
  // vai trocar a pilha, e até lá quem fica à mostra já é o bar seguinte.
  const promote = useSharedValue(0)
  // O sentido do card que está saindo (1 Curti, -1 Passo), até ele sumir.
  const leaving = useSharedValue(0)
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
    promote.set(0)
    leaving.set(0)
    if (returning && returning.barId === top?.barId) {
      // O que estava por cima apaga o resto enquanto o desfeito o cobre,
      // em vez de ficar vazio de uma vez.
      promote.set(1)
      promote.set(withTiming(0, { duration: 250, easing: EASE }))
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
  useAnimatedReaction(
    () =>
      leaving.get() !== 0 && Math.abs(x.get()) >= GONE ? leaving.get() : 0,
    (direction) => {
      if (!direction) return
      leaving.set(0)
      scheduleOnRN(decide, direction > 0 ? 'like' : 'pass')
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
    promote.set(withTiming(1, { duration: 180, easing: EASE }))
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
    leaving.set(direction === 'like' ? 1 : -1)
    x.set(withSpring(to, { ...OUT, velocity }))
  }

  useImperativeHandle(ref, () => ({
    fling: (direction) => {
      // Um toque a mais em Curti durante o voo decidia o mesmo bar duas vezes.
      if (flying.get()) return
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
  // Derivado, não função: o estilo só assina o shared value que lê direto,
  // e com `x` dentro de outra função a pilha de trás não andava com o arraste.
  const progress = useDerivedValue(() =>
    Math.min(1, Math.abs(x.get()) / COMMIT_X)
  )
  const second = useAnimatedStyle(() => {
    const p = progress.get()
    return {
      transform: [{ translateY: 12 - 12 * p }, { scale: 0.95 + 0.05 * p }]
    }
  })
  const secondShade = useAnimatedStyle(() => ({
    opacity: 0.25 * (1 - progress.get())
  }))
  const third = useAnimatedStyle(() => {
    const p = progress.get()
    return {
      transform: [{ translateY: 24 - 12 * p }, { scale: 0.9 + 0.05 * p }]
    }
  })
  const thirdShade = useAnimatedStyle(() => ({
    opacity: 0.45 - 0.2 * progress.get()
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
          <SuggestionCard item={next} now={now} behind reveal={promote} />
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
          ? { left: 18, transform: [{ rotate: '-10deg' }] }
          : { right: 18, transform: [{ rotate: '10deg' }] },
        { borderColor: color },
        style
      ]}
    >
      <Text style={[styles.stampText, { color }]}>{label}</Text>
    </Animated.View>
  )
}

// --- Botões e brilho ---------------------------------------------------------

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
  onLike
}: {
  drag: SharedValue<number>
  dark: boolean
  canUndo: boolean
  onUndo: () => void
  onPass: () => void
  onLike: () => void
  onWhy?: () => void
}) {
  // `.acts`: Passo e Voltar no papel do card, Curti em acid e maior. Passo e
  // Curti crescem com o arraste para o lado deles.
  const pass = useAnimatedStyle(() => {
    const d = drag.get()
    return { transform: [{ scale: d < 0 ? 1 + 0.12 * -d : 1 - 0.08 * d }] }
  })
  const like = useAnimatedStyle(() => {
    const d = drag.get()
    return { transform: [{ scale: d > 0 ? 1 + 0.12 * d : 1 + 0.08 * d }] }
  })
  const card = dark ? '#1c1c18' : '#fbf9f4'
  const drop = dark ? '#000' : 'rgba(18,18,15,.09)'
  const ink = dark ? PAPER : INK
  return (
    <View style={styles.buttons}>
      <RoundAction label="Passo" onPress={onPass}>
        <Animated.View
          style={[
            styles.big,
            { backgroundColor: card, shadowColor: drop },
            pass
          ]}
        >
          <Icon name="close" size={26} color={ink} />
        </Animated.View>
      </RoundAction>
      <RoundAction label="Voltar" disabled={!canUndo} onPress={onUndo}>
        <View
          style={[
            styles.small,
            { backgroundColor: card, shadowColor: drop },
            !canUndo && { opacity: 0.45 }
          ]}
        >
          <Icon name="back" size={20} color={ink} />
        </View>
      </RoundAction>
      <RoundAction label="Curti" onPress={onLike}>
        <Animated.View style={[styles.like, like]}>
          <Icon name="fan" size={30} color={INK} accent={INK} />
        </Animated.View>
      </RoundAction>
    </View>
  )
}

function RoundAction({
  label,
  disabled,
  onPress,
  children
}: {
  label: string
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
    >
      <Animated.View style={press.style}>{children}</Animated.View>
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
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: INK
  },
  photo: { position: 'absolute', left: 0, right: 0, top: 0, height: '52%' },
  meta: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    letterSpacing: 0.5,
    color: '#aaa9a4'
  },
  why: { color: PAPER },
  chipText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.44,
    color: PAPER,
    marginVertical: -1.6
  },
  minis: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(241,238,230,.1)'
  },
  usual: { color: '#aaa9a4', flex: 1 },
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
  bottom: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 10 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10
  },
  name: {
    fontFamily: 'Anton',
    fontSize: 38,
    color: PAPER,
    marginVertical: -10.1
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
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(241,238,230,.1)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.16)'
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
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17
  },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillSolid: { backgroundColor: ACID },
  pillGhost: { backgroundColor: 'rgba(241,238,230,.1)' },
  deck: { width: CARD_W, height: CARD_H, alignSelf: 'center' },
  layer: { position: 'absolute', left: 0, top: 0, transformOrigin: '50% 100%' },
  topCard: {
    transformOrigin: '50% 120%',
    // Com fundo, o iOS desenha a sombra pela caixa e não recalcula pelo
    // conteúdo a cada quadro do arraste.
    backgroundColor: INK,
    borderRadius: 28,
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
    borderRadius: 28,
    backgroundColor: '#000'
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    borderWidth: 3
  },
  // `.lab`: mono 15 com o contorno de 2,5 sobre o vidro escuro.
  stamp: {
    position: 'absolute',
    top: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2.5,
    backgroundColor: 'rgba(18,18,15,.6)'
  },
  stampText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 15,
    letterSpacing: 1.5,
    marginVertical: -2.2
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
    alignItems: 'center',
    gap: 18
  },
  small: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  big: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  like: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
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
