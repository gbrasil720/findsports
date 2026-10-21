import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, {
  Easing,
  type EntryExitAnimationFunction,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import Svg, { Path, Rect } from 'react-native-svg'
import {
  BarRow,
  Chip,
  type Palette,
  type SearchBar,
  usePalette
} from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { EASE, haptic, ScalePress } from '@/components/motion'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import {
  boldSegments,
  chatHistory,
  cheapestFirst,
  resumeLabel
} from '@/lib/ai-chat'
import {
  WORST_ANSWER,
  WORST_BARS,
  WORST_CHIPS,
  WORST_QUESTION
} from '@/lib/ai-chat-demo'
import { trpc } from '@/lib/trpc'

/*
 * Busca com IA (2h, "IA · v2" do design, WEB-400): folha alta sobre o mapa,
 * aberta pela aba IA. A pessoa pergunta do seu jeito; o servidor conversa com
 * o modelo, que só consulta a Onside por ferramentas de leitura, e devolve a
 * frase, o que a busca entendeu ("Busquei por") e os bares, que aqui são os
 * mesmos cards do Explorar. Os atalhos refazem a busca sem gastar pergunta:
 * "Com oferta da casa" pela `pubs.search` com a característica 10, "Mais
 * barato" na própria lista, "Ver no mapa" leva o Explorar até os bares.
 *
 * O limite (10 por dia, 100 por mês) e a IA fora do ar não estão no design:
 * seguem a 2h, com a frase no lugar da resposta, o subtítulo dizendo quando
 * volta e o atalho para a busca normal, que continua.
 */

type Answer = Extract<
  inferRouterOutputs<AppRouter>['ai']['chat'],
  { kind: 'answer' }
>
type Limit = { kind: 'limit'; scope: 'day' | 'month'; resumesAt: string }

type Turn = {
  id: number
  question: string
  state: 'loading' | 'answer' | 'limit' | 'unavailable'
  answer?: Answer
  limit?: Limit
  feedback?: 1 | -1 | null
}

const OFFER = 10
/** Altura do cabeçalho fixo: 17 de respiro + a marca de 52 com 10 em cima e embaixo. */
const HEAD_HEIGHT = 89

// A conversa sobrevive a fechar a folha (abrir um bar e voltar), até o app
// fechar. ponytail: memória do módulo; persistir só se pedirem.
let saved: Turn[] = []

// Entradas como constante de módulo (o Reanimated recomeça a entrada quando
// o objeto muda).
const IN = FadeInDown.duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
// "Mais barato" e "Com oferta da casa" mudam a lista: os bares deslizam
// para o lugar novo e quem sai some rápido, em vez de teletransportar.
const REORDER = LinearTransition.duration(220).easing(EASE)
const ROW_OUT = FadeOut.duration(120)
// Os atalhos de vidro sobem sem opacidade (vidro não desenha a meio caminho).
const RISE: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ translateY: 12 }] },
    animations: {
      transform: [
        { translateY: withTiming(0, { duration: 220, easing: EASE }) }
      ]
    }
  }
}
const AnimatedScroll = Animated.createAnimatedComponent(ScrollView)

// A resposta assenta em ordem: frase, "Busquei por", bares.
const CHIPS_IN = FadeInDown.delay(50)
  .duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
const ROW_IN = Array.from({ length: 8 }, (_, i) =>
  FadeInDown.delay(100 + i * 45)
    .duration(240)
    .easing(EASE)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] })
)

export default function AiSearch() {
  const router = useRouter()
  const palette = usePalette()
  const explore = useExploreState()
  useStatusBar('light')
  // Navegador DEV: `?demo=pior` abre com o pior caso, sem chamar o modelo.
  const { demo } = useLocalSearchParams<{ demo?: string }>()
  const [turns, setTurns] = useState<Turn[]>(() =>
    __DEV__ && demo === 'pior' ? worstCase() : saved
  )
  const [draft, setDraft] = useState('')
  const [offer, setOffer] = useState(false)
  const [cheap, setCheap] = useState(false)
  const input = useRef<TextInput>(null)
  const scroll = useRef<ScrollView>(null)
  useEffect(() => {
    saved = turns
  }, [turns])

  const status = useQuery({
    ...trpc.ai.status.queryOptions(),
    meta: { errorToast: false }
  })
  const chat = useMutation(trpc.ai.chat.mutationOptions())
  const feedback = useMutation(trpc.ai.feedback.mutationOptions())
  const action = useMutation(trpc.ai.action.mutationOptions())

  const last = turns.at(-1)
  const lastAnswer = last?.state === 'answer' ? last.answer : undefined
  const blocked =
    (last?.state === 'limit' ? last.limit : undefined) ??
    (status.data?.kind === 'limit' && !last ? status.data : undefined)
  const off = status.data?.kind === 'unavailable' && !turns.length
  const loading = last?.state === 'loading'
  const now = Date.now()

  // "Com oferta da casa": a mesma busca, com a característica 10.
  const offerSearch = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...(lastAnswer?.search ?? { lat: 0, lng: 0, radiusKm: 3, limit: 20 }),
      amenities: [...new Set([...(lastAnswer?.search?.amenities ?? []), OFFER])]
    }),
    enabled: offer && !!lastAnswer?.search,
    meta: { errorToast: false }
  })

  const send = (raw?: string) => {
    const message = (raw ?? draft).trim()
    if (!message || loading || blocked || off) {
      input.current?.focus()
      return
    }
    haptic.select()
    const id = (turns.at(-1)?.id ?? 0) + 1
    const history = chatHistory(
      turns.map((t) => ({
        question: t.question,
        answer: t.answer?.text ?? null
      }))
    )
    setDraft('')
    setOffer(false)
    setCheap(false)
    setTurns((list) => [...list, { id, question: message, state: 'loading' }])
    const settle = (patch: Partial<Turn>) =>
      setTurns((list) =>
        list.map((t) => (t.id === id ? { ...t, ...patch } : t))
      )
    chat
      .mutateAsync({
        message,
        history,
        origin: explore.device
          ? { lat: explore.device.lat, lng: explore.device.lng }
          : null
      })
      .then((result) => {
        if (result.kind === 'answer') {
          haptic.success()
          settle({ state: 'answer', answer: result })
        } else if (result.kind === 'limit')
          settle({ state: 'limit', limit: result })
        else settle({ state: 'unavailable' })
      })
      .catch(() => settle({ state: 'unavailable' }))
  }

  const rate = (turn: Turn, value: 1 | -1) => {
    if (!turn.answer) return
    const next = turn.feedback === value ? null : value
    haptic.select()
    setTurns((list) =>
      list.map((t) => (t.id === turn.id ? { ...t, feedback: next } : t))
    )
    feedback.mutate({ runId: turn.answer.runId, value: next })
  }

  const openBar = (runId: string, bar: SearchBar) => {
    action.mutate({ runId, kind: 'open_bar', barId: bar.id })
    // A página do bar sai da folha: dentro dela, a folha do "Vou assistir"
    // não abre (folha sobre folha). A conversa fica guardada para a volta.
    router.back()
    router.push({
      pathname: '/bar/[id]',
      params: {
        id: bar.id,
        km: String(bar.distance_km),
        name: bar.name,
        photo: bar.photo_url ?? undefined,
        walk: explore.device ? '1' : undefined,
        ai: runId
      }
    })
  }

  const shown = (answer: Answer, isLast: boolean) => {
    const base =
      isLast && offer && offerSearch.data
        ? offerSearch.data.bars.filter(
            (b) =>
              !answer.search?.neighborhood ||
              b.neighborhood
                .toLocaleLowerCase('pt-BR')
                .includes(answer.search.neighborhood.toLocaleLowerCase('pt-BR'))
          )
        : answer.bars
    return (isLast && cheap ? cheapestFirst(base) : base).slice(0, 8)
  }

  const showOnMap = () => {
    if (!lastAnswer) return
    const bars = shown(lastAnswer, true)
    if (!bars.length) return
    const lats = bars.map((b) => Number(b.latitude))
    const lngs = bars.map((b) => Number(b.longitude))
    const spread = Math.max(
      (Math.max(...lats) - Math.min(...lats)) * 111,
      (Math.max(...lngs) - Math.min(...lngs)) * 102
    )
    explore.setFocus({
      lat: (Math.max(...lats) + Math.min(...lats)) / 2,
      lng: (Math.max(...lngs) + Math.min(...lngs)) / 2,
      km: Math.max(1.6, spread * 1.4)
    })
    router.back()
    router.navigate('/explore')
  }

  const count = lastAnswer ? shown(lastAnswer, true).length : 0
  const subtitle = loading
    ? 'Procurando…'
    : blocked
      ? `Volta ${resumeLabel(blocked.resumesAt, now)}`
      : off || last?.state === 'unavailable'
        ? 'Fora do ar agora'
        : lastAnswer
          ? count
            ? `Achei ${count} ${count === 1 ? 'bar' : 'bares'} para você`
            : 'Nenhum bar com esse pedido'
          : 'Diga o que você procura'

  const keyboard = useAnimatedKeyboard()
  const footer = useAnimatedStyle(() => ({
    paddingBottom: Math.max(30, keyboard.height.value + 10)
  }))
  // O fim da conversa fica acima dos atalhos e do campo.
  const spacer = useAnimatedStyle(() => ({
    height: 150 + Math.max(0, keyboard.height.value - 20)
  }))

  return (
    <>
      {/* Filho direto da tela, com flex: 1: numa folha nativa o
          react-native-screens mede outro caminho e o conteúdo some. O
          cabeçalho fica por cima, fixo (com `stickyHeaderIndices` ele sumia
          quando a lista rolava sozinha até o fim). */}
      <ScrollView
        ref={scroll}
        style={[styles.sheet, { backgroundColor: palette.sheet }]}
        contentContainerStyle={{ paddingTop: HEAD_HEIGHT }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          scroll.current?.scrollToEnd({ animated: true })
        }
      >
        <View style={styles.body}>
          {!turns.length ? (
            <Animated.View entering={IN}>
              <Text style={[styles.answer, { color: palette.ink }]}>
                {off
                  ? 'A busca com IA está fora do ar agora. A busca normal continua funcionando.'
                  : blocked
                    ? `Você usou as perguntas ${blocked.scope === 'day' ? 'de hoje' : 'deste mês'}. O chat volta ${resumeLabel(blocked.resumesAt, now)}; a busca normal continua.`
                    : 'Me diga o jogo e o que você precisa. Eu procuro para você.'}
              </Text>
            </Animated.View>
          ) : null}
          {turns.map((turn, index) => (
            <TurnView
              key={turn.id}
              turn={turn}
              palette={palette}
              now={now}
              bars={
                turn.answer
                  ? shown(turn.answer, index === turns.length - 1)
                  : []
              }
              extraChip={
                index === turns.length - 1 && offer ? 'Oferta da casa' : null
              }
              onBar={(bar) => turn.answer && openBar(turn.answer.runId, bar)}
              onRate={(value) => rate(turn, value)}
              onRetry={() => {
                setTurns((list) => list.filter((t) => t.id !== turn.id))
                send(turn.question)
              }}
            />
          ))}
        </View>
        <Animated.View style={spacer} />
      </ScrollView>

      <View style={[styles.top, { backgroundColor: palette.sheet }]}>
        <View style={styles.head}>
          <View style={styles.mark}>
            <Icon
              name="sparkle"
              size={41}
              color={palette.ink}
              accent={palette.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[text(17, 'Bold', 1.25), { color: palette.ink }]}>
              Onside IA
            </Text>
            <View style={styles.statusRow}>
              <StatusDot
                busy={loading}
                quiet={!!blocked || off || last?.state === 'unavailable'}
              />
              <Text
                style={[text(13, 'Regular', 1.3), { color: palette.muted }]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>
          </View>
          <View>
            <BackButton icon="close" onPress={() => router.back()} />
          </View>
        </View>
      </View>
      <Animated.View style={[styles.dock, footer]}>
        {/* Borda de rolagem: a conversa some aos poucos sob o rodapé. */}
        <LinearGradient
          pointerEvents="none"
          colors={[`${palette.sheet}00`, palette.sheet]}
          locations={[0, 0.35]}
          style={StyleSheet.absoluteFill}
        />
        {lastAnswer?.search && !loading ? (
          <AnimatedScroll
            entering={RISE}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.shortcuts}
          >
            <Chip
              label="Com oferta da casa"
              on={offer}
              palette={palette}
              onPress={() => setOffer((v) => !v)}
            />
            <Chip
              label="Ver no mapa"
              icon="map"
              on={false}
              palette={palette}
              onPress={showOnMap}
            />
            <Chip
              label="Mais barato"
              on={cheap}
              palette={palette}
              onPress={() => setCheap((v) => !v)}
            />
          </AnimatedScroll>
        ) : blocked || off || last?.state === 'unavailable' ? (
          <View style={styles.shortcuts}>
            <Chip
              label="Abrir a busca"
              icon="search"
              on={false}
              palette={palette}
              onPress={() => {
                router.back()
                router.push('/busca')
              }}
            />
          </View>
        ) : null}

        <View style={styles.footer}>
          <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.field}>
            <TextInput
              ref={input}
              value={draft}
              onChangeText={setDraft}
              editable={!blocked && !off}
              placeholder={
                blocked
                  ? `O chat volta ${resumeLabel(blocked.resumesAt, now)}`
                  : off
                    ? 'A busca com IA está fora do ar'
                    : turns.length
                      ? 'Refine ou pergunte outra coisa…'
                      : 'Diga o jogo e o que você precisa…'
              }
              placeholderTextColor={palette.muted}
              returnKeyType="send"
              onSubmitEditing={() => send()}
              maxLength={300}
              style={[styles.input, { color: palette.ink }]}
            />
            {/* Ditado: o microfone do teclado do sistema. Tocar aqui abre o
              teclado, com o microfone dele à mão. */}
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Ditar"
              hitSlop={8}
              to={0.9}
              onPress={() => input.current?.focus()}
            >
              <Mic color={palette.ink} />
            </ScalePress>
            <ScalePress
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              accessibilityState={{ disabled: !draft.trim() || loading }}
              onPress={() => send()}
              to={0.92}
              style={styles.send}
            >
              <Icon name="arrowUp" size={18} color={INK} />
            </ScalePress>
          </Glass>
        </View>
      </Animated.View>
    </>
  )
}

function worstCase(): Turn[] {
  const answer = (id: string, text: string, bars: SearchBar[]): Answer => ({
    kind: 'answer',
    runId: id,
    text,
    bars,
    chips: bars.length ? WORST_CHIPS : ['Leblon', 'Hoje', 'até 3 km'],
    // Vila Madalena: "Com oferta da casa" consulta bares de verdade.
    search: {
      lat: -23.5535,
      lng: -46.6911,
      radiusKm: 10,
      limit: 20,
      neighborhood: null
    },
    remainingToday: 1
  })
  // A troca sem bares antes; a última, com os oito, ganha os atalhos.
  return [
    {
      id: 1,
      question: 'e no Leblon?',
      state: 'answer',
      answer: answer(
        'demo-1',
        'Não achei bar com jogo hoje no Leblon. Quer que eu aumente o raio ou olhe amanhã?',
        []
      )
    },
    {
      id: 2,
      question: WORST_QUESTION,
      state: 'answer',
      answer: answer('demo-2', WORST_ANSWER, WORST_BARS)
    }
  ]
}

function TurnView({
  turn,
  palette,
  now,
  bars,
  extraChip,
  onBar,
  onRate,
  onRetry
}: {
  turn: Turn
  palette: Palette
  now: number
  bars: SearchBar[]
  extraChip: string | null
  onBar: (bar: SearchBar) => void
  onRate: (value: 1 | -1) => void
  onRetry: () => void
}) {
  const answer = turn.answer
  const chips = answer
    ? [...answer.chips, ...(extraChip ? [extraChip] : [])]
    : []
  return (
    <>
      <Animated.View
        entering={IN}
        style={[styles.bubble, { backgroundColor: palette.dark ? PAPER : INK }]}
      >
        <Text
          style={[styles.bubbleText, { color: palette.dark ? INK : PAPER }]}
        >
          {turn.question}
        </Text>
      </Animated.View>

      {turn.state === 'loading' ? (
        <Animated.View entering={IN}>
          <Text style={[styles.answer, { color: palette.muted }]}>
            Procurando os bares…
          </Text>
        </Animated.View>
      ) : null}

      {turn.state === 'unavailable' ? (
        <Animated.View
          entering={IN}
          style={{ gap: 10, alignItems: 'flex-start' }}
        >
          <Text style={[styles.answer, { color: palette.ink }]}>
            Não consegui responder agora. Tente de novo em instantes; a busca
            normal continua.
          </Text>
          <Chip
            label="Tentar de novo"
            on={false}
            palette={palette}
            onPress={onRetry}
          />
        </Animated.View>
      ) : null}

      {turn.state === 'limit' && turn.limit ? (
        <Animated.View entering={IN}>
          <Text style={[styles.answer, { color: palette.ink }]}>
            Você usou as perguntas{' '}
            {turn.limit.scope === 'day' ? 'de hoje' : 'deste mês'}. O chat volta{' '}
            <Text style={{ fontFamily: 'Archivo-Bold' }}>
              {resumeLabel(turn.limit.resumesAt, now)}
            </Text>
            ; a busca normal continua.
          </Text>
        </Animated.View>
      ) : null}

      {answer ? (
        <>
          <Animated.View entering={IN}>
            <Text style={[styles.answer, { color: palette.ink }]}>
              {boldSegments(answer.text).map((part, i) => (
                <Text
                  // biome-ignore lint/suspicious/noArrayIndexKey: pedaços fixos da frase
                  key={i}
                  style={part.bold ? { fontFamily: 'Archivo-Bold' } : null}
                >
                  {part.text}
                </Text>
              ))}
            </Text>
          </Animated.View>
          {chips.length ? (
            <Animated.View entering={CHIPS_IN} style={styles.chips}>
              <Text
                style={[text(11.5, 'Regular', 1.3), { color: palette.muted }]}
              >
                Busquei por
              </Text>
              {chips.map((chip) => (
                <View
                  key={chip}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: palette.dark ? palette.card : '#fff',
                      borderColor: palette.dark
                        ? palette.ring
                        : 'rgba(18,18,15,.10)'
                    }
                  ]}
                >
                  <Text
                    style={[text(11.5, 'Regular', 1.3), { color: palette.ink }]}
                  >
                    {chip}
                  </Text>
                </View>
              ))}
            </Animated.View>
          ) : null}
          {bars.map((bar, i) => (
            <Animated.View
              key={bar.id}
              entering={ROW_IN[i]}
              exiting={ROW_OUT}
              layout={REORDER}
            >
              <BarRow
                bar={bar}
                now={now}
                palette={palette}
                onPress={() => onBar(bar)}
              />
            </Animated.View>
          ))}
          <Animated.View entering={IN} style={styles.rate}>
            <Text style={[text(12, 'Regular', 1.3), { color: palette.muted }]}>
              Ajudou?
            </Text>
            <Thumb
              up
              on={turn.feedback === 1}
              palette={palette}
              onPress={() => onRate(1)}
            />
            <Thumb
              on={turn.feedback === -1}
              palette={palette}
              onPress={() => onRate(-1)}
            />
          </Animated.View>
        </>
      ) : null}
    </>
  )
}

/** O ponto acid ao lado do subtítulo; pulsa enquanto procura. */
function StatusDot({ busy, quiet }: { busy: boolean; quiet: boolean }) {
  const pulse = useSharedValue(1)
  useEffect(() => {
    pulse.value = busy
      ? withRepeat(
          withTiming(1.5, { duration: 600, easing: Easing.inOut(Easing.quad) }),
          -1,
          true
        )
      : withTiming(1, { duration: 200 })
  }, [busy, pulse])
  const halo = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }))
  const color = quiet ? 'rgba(85,85,79,.5)' : ACID
  return (
    <View style={styles.dotBox}>
      <Animated.View
        style={[
          styles.dotHalo,
          {
            backgroundColor: quiet
              ? 'rgba(85,85,79,.2)'
              : 'rgba(201,241,53,.35)'
          },
          halo
        ]}
      />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  )
}

/** Microfone do design (20 pt): corpo cheio, haste a 30%. */
function Mic({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M5 11a7 7 0 0 0 14 0h-2.2a4.8 4.8 0 0 1-9.6 0z"
        fill={color}
        opacity={0.3}
      />
      <Rect
        x={11}
        y={17}
        width={2}
        height={4}
        rx={1}
        fill={color}
        opacity={0.3}
      />
      <Rect x={8.5} y={2.5} width={7} height={12} rx={3.5} fill={color} />
    </Svg>
  )
}

/** Polegar da resposta (a métrica do teste). Não está no design. */
function Thumb({
  up,
  on,
  palette,
  onPress
}: {
  up?: boolean
  on: boolean
  palette: Palette
  onPress: () => void
}) {
  const color = on ? palette.ink : palette.muted
  return (
    <ScalePress
      accessibilityRole="button"
      accessibilityLabel={up ? 'Ajudou' : 'Não ajudou'}
      accessibilityState={{ selected: on }}
      hitSlop={10}
      to={0.9}
      onPress={onPress}
      style={styles.thumb}
    >
      <Svg
        width={17}
        height={17}
        viewBox="0 0 24 24"
        style={up ? undefined : { transform: [{ rotate: '180deg' }] }}
      >
        <Rect
          x={2.5}
          y={10}
          width={4}
          height={10.5}
          rx={1}
          fill={color}
          opacity={on ? 1 : 0.45}
        />
        <Path
          d="M8.5 20.5V10l4.4-6.6a1.9 1.9 0 0 1 3.4 1.4L15.5 9h4a2 2 0 0 1 2 2.4l-1.4 7.2a2.4 2.4 0 0 1-2.4 1.9z"
          fill={color}
          opacity={on ? 1 : 0.45}
        />
      </Svg>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 17,
    paddingHorizontal: 16,
    zIndex: 1
  },
  mark: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
    marginRight: 8
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotBox: {
    width: 13,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dotHalo: { position: 'absolute', width: 13, height: 13, borderRadius: 6.5 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  body: { paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: 270,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    shadowColor: ACID,
    shadowOpacity: 0.9,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  bubbleText: { ...text(15, 'Regular', 1.38) },
  answer: { ...text(15.5, 'Regular', 1.45) },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    alignItems: 'center'
  },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth
  },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -2 },
  thumb: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shortcuts: {
    paddingTop: 10,
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: 'row'
  },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { paddingTop: 10, paddingHorizontal: 14 },
  field: {
    height: 54,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 8,
    gap: 10,
    overflow: 'hidden'
  },
  input: { flex: 1, ...text(15, 'Regular', 1.2), paddingVertical: 0 },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 2 }
  }
})
