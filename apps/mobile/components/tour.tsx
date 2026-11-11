import * as SecureStore from 'expo-secure-store'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import Svg, { Defs, Mask, Rect } from 'react-native-svg'
import { haptic } from '@/components/motion'
import { useAiButtonCenter } from '@/components/side-nav'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, PillButton, Text, text } from '@/components/ui'

/*
 * Passeio guiado (rodada 5, tela 3b), no lugar do aviso só da IA (4o): o
 * resto da tela escurece, um recorte com anel acid mostra a peça de verdade
 * (com os dados da pessoa) e o cartão explica em uma frase. Cinco passos:
 * os jogos de hoje, a folha de bares, filtros e atalhos, a busca com IA e a
 * aba Você. Oferecido, nunca forçado; tocar fora do cartão não fecha, só
 * "Pular". O recorte anda de uma peça para a outra numa mola (300 ms, sem
 * balanço); com menos movimento, pula. O escuro entra uma vez (240 ms) e o
 * cartão troca o texto em 150 ms.
 *
 * As peças da tela se registram com `useTourTarget`; a barra de abas é
 * nativa e não se mede: os dois últimos passos usam a posição dela.
 */

const SEEN_KEY = 'onside.passeio'

// As do torcedor ('jogos', 'folha', 'filtros') e as do dono (`bar-tour.tsx`).
type Target = string
// O Explorar pode montar mais de uma vez (a cópia da foto do menu Você):
// cada montagem guarda a sua `ref`, e o passeio usa a que estiver na tela.
const targets = new Map<Target, Set<RefObject<View | null>>>()
export const targetOf = (key: Target) =>
  [...(targets.get(key) ?? [])].find((ref) => ref.current)?.current ?? null

/** A peça que o passeio pode cercar; devolve a `ref` para pôr nela. */
export function useTourTarget(key: Target) {
  const ref = useRef<View>(null)
  useEffect(() => {
    const set = targets.get(key) ?? new Set()
    set.add(ref)
    targets.set(key, set)
    return () => {
      set.delete(ref)
    }
  }, [key])
  return ref
}

/** O passeio já foi visto ou dispensado neste aparelho. */
export async function tourSeen() {
  return (await SecureStore.getItemAsync(SEEN_KEY).catch(() => null)) !== null
}
export const markTourSeen = () =>
  SecureStore.setItemAsync(SEEN_KEY, '1').catch(() => {})

type Step = {
  target: Target
  title: string
  body: string
  /** O recorte: o arredondado e a folga em volta da peça. */
  radius: number
  pad: number
}

const STEPS: Step[] = [
  {
    target: 'jogos',
    title: 'Comece pelo jogo',
    body: 'Os jogos de hoje ficam aqui. Escolha um e o mapa mostra só os bares que vão passar.',
    radius: 20,
    pad: 6
  },
  {
    target: 'folha',
    title: 'Os bares do jogo',
    body: 'Puxe a folha para ver a lista. Cada bar diz se tem telão, som e quantas pessoas vão.',
    radius: 30,
    pad: 0
  },
  {
    target: 'filtros',
    title: 'Filtros e atalhos',
    body: 'Telão, área externa, Pix… Fixe os que você mais usa e eles ficam nesta fileira.',
    radius: 24,
    pad: 6
  },
  {
    target: 'ia',
    title: 'Pergunte do seu jeito',
    body: 'A busca com IA entende pedidos inteiros e explica por que escolheu cada bar.',
    radius: 39,
    pad: 0
  },
  {
    target: 'voce',
    title: 'O que é seu fica em Você',
    body: 'Meus jogos, o código do balcão, a carteirinha e as conquistas de cada visita.',
    radius: 39,
    pad: 0
  }
]

export type Box = { x: number; y: number; w: number; h: number }

const AnimatedRect = Animated.createAnimatedComponent(Rect)
const SPRING = { duration: 300, dampingRatio: 1 }
const DIM_IN = FadeIn.duration(240)
const CARD_IN = FadeIn.duration(150)
const CARD_OUT = FadeOut.duration(150)

/**
 * O escuro com o recorte e o anel acid em volta da peça (sem peça, só o
 * escuro). O recorte anda numa mola de 300 ms sem balanço; com menos
 * movimento, pula. `breathe`: o anel respira (1 → 0,55 em 2,4 s), o passeio
 * do bar. Tocar no escuro não fecha.
 */
export function Spotlight({
  box,
  radius,
  pad,
  breathe
}: {
  box: Box | null
  radius: number
  pad: number
  breathe?: boolean
}) {
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  const w = useSharedValue(0)
  const h = useSharedValue(0)
  const glow = useSharedValue(1)
  const placed = useRef(false)
  useEffect(() => {
    if (!box) {
      placed.current = false
      w.set(0)
      h.set(0)
      return
    }
    const to = {
      x: box.x - pad,
      y: box.y - pad,
      w: box.w + pad * 2,
      h: box.h + pad * 2
    }
    const move = (v: typeof x, value: number) =>
      v.set(placed.current && !reduced ? withSpring(value, SPRING) : value)
    move(x, to.x)
    move(y, to.y)
    move(w, to.w)
    move(h, to.h)
    placed.current = true
  }, [box, pad, reduced, x, y, w, h])
  useEffect(() => {
    if (!breathe || reduced) return glow.set(1)
    glow.set(
      withRepeat(
        withTiming(0.55, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      )
    )
    return () => cancelAnimation(glow)
  }, [breathe, reduced, glow])

  const hole = useAnimatedProps(() => ({
    x: x.get(),
    y: y.get(),
    width: w.get(),
    height: h.get()
  }))
  const ring = useAnimatedProps(() => ({
    x: x.get() - 1.5,
    y: y.get() - 1.5,
    width: w.get() + 3,
    height: h.get() + 3,
    strokeOpacity: glow.get()
  }))
  return (
    <Pressable style={StyleSheet.absoluteFill} accessible={false}>
      <Svg width={width} height={height}>
        <Defs>
          <Mask id="tour-hole">
            <Rect width={width} height={height} fill="#fff" />
            <AnimatedRect
              animatedProps={hole}
              rx={radius}
              ry={radius}
              fill="#000"
            />
          </Mask>
        </Defs>
        <Rect
          width={width}
          height={height}
          fill="rgba(5,5,4,.74)"
          mask="url(#tour-hole)"
        />
        {box ? (
          <AnimatedRect
            animatedProps={ring}
            rx={radius + 1.5}
            ry={radius + 1.5}
            fill="none"
            stroke={ACID}
            strokeWidth={3}
          />
        ) : null}
      </Svg>
    </Pressable>
  )
}

export function Tour({
  fan,
  onClose,
  onSignup
}: {
  /** Sem conta, o último passo fala do que a conta guarda. */
  fan: boolean
  onClose: () => void
  onSignup: () => void
}) {
  const palette = usePalette()
  const { width, height } = useWindowDimensions()
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const step = STEPS[index] as Step
  const last = index === STEPS.length - 1

  // A barra de abas é nativa e não se mede: o botão da IA vem de onde a
  // navegação o põe (`useAiButtonCenter`); a aba Você, do desenho (390 x 844).
  const ai = useAiButtonCenter()
  const tabBox = (target: 'ia' | 'voce'): Box =>
    target === 'ia'
      ? { x: ai.x - 39, y: ai.y - 39, w: 78, h: 78 }
      : { x: width * 0.518, y: ai.y - 39, w: 96, h: 78 }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mede a cada passo e quando a tela muda de tamanho
  useEffect(() => {
    const measure = () => {
      const view = targetOf(step.target)
      // A barra de abas não se mede; a peça da tela que ainda não montou,
      // espera a próxima medida.
      if (step.target === 'ia' || step.target === 'voce')
        return setBox(tabBox(step.target))
      if (!view) return
      view.measureInWindow((x, y, w, h) => {
        // Ainda sem altura (a tela acabou de montar): espera a próxima.
        if (h < 8) return
        // Peça maior que a tela (a folha aberta): o recorte vai até o pé.
        setBox({ x, y, w, h: Math.min(h, height - y) })
      })
    }
    measure()
    // O Explorar ainda carrega os jogos ao abrir: mede de novo quando assenta.
    const later = [setTimeout(measure, 350), setTimeout(measure, 1200)]
    return () => later.forEach(clearTimeout)
  }, [step.target, width, height])

  const close = () => {
    haptic.select()
    markTourSeen()
    onClose()
  }
  const next = () => {
    if (!last) {
      haptic.select()
      setIndex(index + 1)
      return
    }
    haptic.success()
    markTourSeen()
    onClose()
    if (!fan) onSignup()
  }

  // O cartão fica do lado livre da peça: abaixo dela, se ela está em cima.
  const above = box ? box.y + box.h / 2 > height / 2 : false
  const cardPos = !box
    ? { top: height / 3 }
    : above
      ? { bottom: height - box.y + step.pad + 16 }
      : { top: box.y + box.h + step.pad + 16 }

  return (
    <Animated.View entering={DIM_IN} style={StyleSheet.absoluteFill}>
      <Spotlight box={box} radius={step.radius} pad={step.pad} />
      <Animated.View
        key={index}
        entering={CARD_IN}
        exiting={CARD_OUT}
        accessibilityViewIsModal
        style={[
          tourStyles.card,
          cardPos,
          { backgroundColor: palette.bg },
          palette.dark && tourStyles.cardDark
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pular o passeio"
          hitSlop={10}
          onPress={close}
          style={tourStyles.kicker}
        >
          <Text style={[tourStyles.mono, { color: palette.muted }]}>
            {index + 1} DE {STEPS.length}
          </Text>
          <Text style={[tourStyles.mono, { color: palette.muted }]}>PULAR</Text>
        </Pressable>
        <Text style={[tourStyles.title, { color: palette.ink }]}>
          {last && !fan ? 'Sua conta guarda tudo' : step.title}
        </Text>
        <Text
          style={[
            text(14.5, 'Regular', 1.45),
            { color: palette.dark ? '#c9c7c0' : '#3a3a35' }
          ]}
        >
          {last && !fan
            ? 'Com a conta, seus jogos, o código do balcão e as conquistas ficam em Você.'
            : step.body}
        </Text>
        <View style={tourStyles.foot}>
          <View style={tourStyles.dots}>
            {STEPS.map((s, i) => (
              <View
                key={s.target}
                style={[
                  tourStyles.dot,
                  i === index
                    ? { width: 24, backgroundColor: palette.ink }
                    : { backgroundColor: palette.mark }
                ]}
              />
            ))}
          </View>
          <PillButton
            label={
              last ? (fan ? 'Bora pro jogo' : 'Criar conta grátis') : 'Próximo'
            }
            height={40}
            onPress={next}
          />
        </View>
      </Animated.View>
    </Animated.View>
  )
}

export const tourStyles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 22,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 }
  },
  cardDark: { borderWidth: 1, borderColor: 'rgba(241,238,230,.12)' },
  kicker: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, letterSpacing: 0.88 },
  // Anton 26/1: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginVertical: -6.3
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  invite: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: INK,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  inviteMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteText: { color: PAPER, flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 }
})

const OPENS_KEY = 'onside.aberturas'
// Conta uma abertura por vez que o app sobe, não por montagem da tela.
let counted: Promise<number> | null = null
const countOpen = () => {
  counted ??= SecureStore.getItemAsync(OPENS_KEY)
    .then((raw) => {
      const opens = (Number(raw) || 0) + 1
      SecureStore.setItemAsync(OPENS_KEY, String(opens)).catch(() => {})
      return opens
    })
    .catch(() => 1)
  return counted
}

/**
 * O convite do passeio no topo do Explorar: a partir da segunda abertura,
 * para quem ainda não viu nem dispensou (quem entra pela folha de uma ação
 * não o vê na hora). Fica até tocar ou dispensar.
 */
export function TourInvite({
  top,
  onOpen
}: {
  top: number
  onOpen: () => void
}) {
  const palette = usePalette()
  const [show, setShow] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all([countOpen(), tourSeen()]).then(([opens, seen]) => {
      if (alive && opens >= 2 && !seen) setShow(true)
    })
    return () => {
      alive = false
    }
  }, [])
  if (!show) return null
  return (
    <Animated.View
      entering={CARD_IN}
      exiting={CARD_OUT}
      style={[
        tourStyles.invite,
        { top },
        palette.dark && { backgroundColor: '#26261f' }
      ]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic.select()
          setShow(false)
          onOpen()
        }}
        style={tourStyles.inviteMain}
      >
        <Icon name="sparkle" size={18} color={ACID} accent={ACID} />
        <Text style={[text(14, 'SemiBold', 1.25), tourStyles.inviteText]}>
          Novo por aqui? Ver como funciona · 30 s
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dispensar o passeio"
        hitSlop={10}
        onPress={() => {
          haptic.select()
          markTourSeen()
          setShow(false)
        }}
      >
        <Icon name="close" size={14} color="#aaa9a4" />
      </Pressable>
    </Animated.View>
  )
}
