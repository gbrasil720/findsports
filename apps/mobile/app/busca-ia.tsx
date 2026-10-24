import { useMutation, useQuery } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { File, Paths } from 'expo-file-system'
import { LinearGradient } from 'expo-linear-gradient'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  type TextInput,
  View
} from 'react-native'
import Animated, {
  FadeInDown,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedKeyboard,
  useAnimatedStyle
} from 'react-native-reanimated'
import { Actions, FollowUps } from '@/components/ai/actions'
import {
  CodeCard,
  ConfirmCard,
  DecisionLine
} from '@/components/ai/confirmation'
import { AiHeader } from '@/components/ai/header'
import { UserMessage } from '@/components/ai/message'
import { PromptInput } from '@/components/ai/prompt-input'
import { Reasoning } from '@/components/ai/reasoning'
import {
  AnswerText,
  CitedBar,
  FilterChips,
  Sources
} from '@/components/ai/response'
import { Start } from '@/components/ai/start'
import { type AiPalette, useAiPalette } from '@/components/ai/theme'
import { DoneLine, ToolCard } from '@/components/ai/tool'
import { Chip, dayLabel } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { EASE, haptic, popFrom, SWAP } from '@/components/motion'
import { text, useStatusBar } from '@/components/ui'
import {
  applyEvent,
  barsFound,
  chipSearch,
  clock,
  confirmText,
  firstName,
  followUps,
  fromSearchBar,
  historyOf,
  inNeighborhood,
  isThinking,
  mapFocus,
  newTurn,
  patchVersion,
  plainText,
  type Recent,
  type Reply,
  redoTurn,
  resumeLabel,
  saveRecent,
  shownReply,
  sourcesLabel,
  stepVersion,
  type Turn,
  thoughtLabel,
  versionLabel
} from '@/lib/ai-chat'
import type { Dubla } from '@/lib/ai-dubla'
import type { ChatBar, ConfirmResult } from '@/lib/ai-events'
import { confirm, converse } from '@/lib/ai-stream'
import { authClient } from '@/lib/auth-client'
import { formatTime, isLive } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * Busca com IA (Rodada 24, 24a–24e; WEB-400): folha alta sobre o mapa,
 * aberta pela aba IA. A pessoa pergunta do seu jeito; `ai.converse` devolve
 * em fluxo o que a IA está fazendo (passos, ferramentas), os bares antes do
 * texto, o texto com citações e, no fim, o que ela entendeu (chips), as
 * fontes e as próximas perguntas. Ação que muda dado (marcar presença,
 * chamar amigo) só acontece no "Confirmar" (`ai.confirm`).
 *
 * As peças estão em `components/ai/`; as contas, em `lib/ai-chat.ts`. Em
 * desenvolvimento, `?dubla=1` troca o servidor pelo dublê (`lib/ai-dubla.ts`).
 *
 * O limite (10 por dia, 100 por mês) e a IA fora do ar não estão no design:
 * a frase entra no lugar da resposta, o subtítulo diz quando volta e o
 * atalho "Abrir a busca" leva à busca normal, que continua.
 */

/** Altura do cabeçalho fixo (17 de respiro + 44 do ícone + 8) até medir. */
const HEAD_HEIGHT = 69
const RECENTS = 'busca-ia-recentes.json'

// A conversa sobrevive a fechar a folha (abrir um bar e voltar), até o app
// fechar. Os recentes ficam no aparelho (o servidor não guarda texto).
let saved: { id: string; turns: Turn[] } = { id: newId(), turns: [] }

function newId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function readRecents(): Recent[] {
  try {
    const file = new File(Paths.document, RECENTS)
    return file.exists ? (JSON.parse(file.textSync()) as Recent[]) : []
  } catch {
    return []
  }
}

function writeRecents(list: Recent[]) {
  try {
    const file = new File(Paths.document, RECENTS)
    if (!file.exists) file.create()
    file.write(JSON.stringify(list))
  } catch {}
}

// Entradas como constante de módulo (o Reanimated recomeça a entrada quando
// o objeto muda).
const IN = FadeInDown.duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
const SETTLE = LinearTransition.duration(220).easing(EASE)
// Os bares chegam antes do texto, um depois do outro.
const BAR_IN = Array.from({ length: 8 }, (_, i) =>
  FadeInDown.delay(Math.min(i, 5) * 60)
    .duration(240)
    .easing(EASE)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] })
)

const OUT = FadeOut.duration(120)
// Depois do "Confirmar": as linhas do que foi feito uma depois da outra, e o
// código por último, com um estalo curto (o momento raro da conversa).
const DONE_IN = [0, 1, 2].map((i) =>
  FadeInDown.delay(i * 60)
    .duration(220)
    .easing(EASE)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
)
const CODE_IN = popFrom(0.96, 180)

type DevState = 'pensando' | 'resposta' | 'confirmar' | 'feito'
const DEV_QUESTION: Record<DevState, string> = {
  pensando:
    'Quero ver o Corinthians hoje num lugar com telão e área externa, perto de Pinheiros',
  resposta:
    'Quero ver o Corinthians hoje num lugar com telão e área externa, perto de Pinheiros',
  confirmar: 'Marca que vou no Bar do Zé e chama a Marina',
  feito: 'Marca que vou no Bar do Zé e chama a Marina'
}

export default function AiSearch() {
  const router = useRouter()
  const palette = useAiPalette()
  const explore = useExploreState()
  const session = authClient.useSession()
  useStatusBar('light')
  // Navegador DEV: `?dubla=1` usa o dublê; `estado` já manda a pergunta de
  // cada tela (24b pensando, 24c resposta, 24d confirmar, 24e feito).
  const params = useLocalSearchParams<{ dubla?: Dubla; estado?: DevState }>()
  const dubla = __DEV__ && params.dubla ? params.dubla : null
  const devState = __DEV__ ? params.estado : undefined

  const [conversation, setConversation] = useState(() =>
    devState ? { id: newId(), turns: [] } : saved
  )
  const turns = conversation.turns
  const setTurns = (update: (list: Turn[]) => Turn[]) =>
    setConversation((c) => ({ ...c, turns: update(c.turns) }))
  // Conversa guardada (a folha reabriu ou veio dos recentes) aparece pronta;
  // só turnos novos animam.
  const [restored, setRestored] = useState(() => turns.length > 0)
  const [recents, setRecents] = useState<Recent[]>(readRecents)
  const [draft, setDraft] = useState('')
  const [placeOn, setPlaceOn] = useState(true)
  const [day, setDay] = useState<'today' | 'tomorrow' | null>('today')
  const [tastes, setTastes] = useState(true)
  const [toggles, setToggles] = useState<boolean[]>([])
  const [flash, setFlash] = useState<{ id: string; at: number } | null>(null)
  const [dockHeight, setDockHeight] = useState(150)
  // O status quebra em duas linhas no início: o cabeçalho cresce.
  const [headHeight, setHeadHeight] = useState(HEAD_HEIGHT)
  const input = useRef<TextInput>(null)
  const scroll = useRef<ScrollView>(null)
  const content = useRef<View>(null)
  const cards = useRef(new Map<string, View>())
  const running = useRef<AbortController | null>(null)
  const stick = useRef(true)
  const now = Date.now()

  useEffect(() => {
    saved = conversation
  }, [conversation])
  useEffect(() => () => running.current?.abort(), [])

  const status = useQuery({
    ...trpc.ai.status.queryOptions(),
    enabled: !dubla
  })
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const feedback = useMutation(trpc.ai.feedback.mutationOptions())
  const action = useMutation(trpc.ai.action.mutationOptions())

  const last = turns.at(-1)
  const lastReply = last ? shownReply(last) : undefined
  const busy = lastReply?.state === 'run'
  const streaming = busy && !!lastReply?.text
  const blocked =
    (lastReply?.state === 'limit' ? lastReply.limit : null) ??
    (status.data?.kind === 'limit' && !last ? status.data : null)
  const off =
    lastReply?.state === 'unavailable' ||
    (status.data?.kind === 'unavailable' && !last)
  const pending =
    lastReply?.proposal && !lastReply.decision ? lastReply.proposal : null

  // Contexto do campo: o local (aparelho, senão a cidade do perfil) e o dia.
  const radiusKm = session.data?.user.searchRadiusKm ?? 3
  const origin = explore.device ?? (city.data ? city.data : null)
  const placeName = explore.district ?? city.data?.name ?? null
  const placeLabel = placeName ? `${placeName} · ${radiusKm} km` : null

  // Chips tirados da última resposta: a busca dos que sobram, sem IA.
  const chips = lastReply?.done?.chips ?? []
  const removed = lastReply?.removed ?? []
  const fieldOrigin =
    placeOn && origin ? { lat: origin.lat, lng: origin.lng } : null
  const rebuilt = removed.length
    ? chipSearch(chips, removed, fieldOrigin)
    : null
  const refined = useQuery({
    ...trpc.pubs.search.queryOptions(
      rebuilt?.input ?? { lat: 0, lng: 0, limit: 20 }
    ),
    enabled: !!rebuilt
  })

  const barsOf = (turn: Turn, reply: Reply): ChatBar[] => {
    if (turn !== last || !rebuilt || !refined.data) return reply.bars
    return inNeighborhood(refined.data.bars, rebuilt.neighborhood)
      .slice(0, 8)
      .map((b) => fromSearchBar(b, (g) => isLive(g, now)))
  }

  const send = (raw?: string, redoOf?: Turn) => {
    const message = (redoOf?.question ?? raw ?? draft).trim()
    if (!message || busy || blocked) {
      input.current?.focus()
      return
    }
    haptic.select()
    stick.current = true
    const id = redoOf?.id ?? (turns.at(-1)?.id ?? 0) + 1
    const before = redoOf ? turns.slice(0, turns.indexOf(redoOf)) : turns
    const turn = redoOf
      ? redoTurn(redoOf, Date.now())
      : newTurn(id, message, Date.now())
    const version = turn.versions.length - 1
    if (!redoOf) setDraft('')
    setRestored(false)
    setTurns((list) =>
      redoOf ? list.map((t) => (t.id === id ? turn : t)) : [...list, turn]
    )
    const patch = (fn: (reply: Reply) => Reply) =>
      setTurns((list) =>
        list.map((t) => (t.id === id ? patchVersion(t, version, fn) : t))
      )
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    const run = async () => {
      try {
        const stream = converse(
          {
            message,
            history: historyOf(before),
            origin:
              placeOn && origin ? { lat: origin.lat, lng: origin.lng } : null,
            placeLabel: placeOn ? placeName : null,
            radiusKm: placeOn ? radiusKm : undefined,
            day,
            useTastes: tastes,
            redo: !!redoOf || undefined
          },
          controller.signal,
          dubla ? { mode: dubla, hold: devState === 'pensando' } : null
        )
        for await (const event of stream) {
          if (controller.signal.aborted) return
          if (event.type === 'done') haptic.success()
          patch((reply) => applyEvent(reply, event, Date.now()))
        }
        patch((reply) =>
          reply.state === 'run' ? { ...reply, state: 'unavailable' } : reply
        )
      } catch {
        patch((reply) =>
          controller.signal.aborted
            ? {
                ...reply,
                state: 'stopped',
                thoughtAt: reply.thoughtAt ?? Date.now()
              }
            : { ...reply, state: 'unavailable' }
        )
      }
    }
    run()
  }

  const stop = () => {
    haptic.select()
    running.current?.abort()
  }

  // Ao terminar cada resposta, a conversa vai para os recentes do aparelho.
  const lastState = lastReply?.state
  useEffect(() => {
    if (!turns.length || lastState === 'run' || restored) return
    setRecents((list) => {
      const next = saveRecent(list, {
        id: conversation.id,
        title: turns[0]?.question ?? '',
        at: Date.now(),
        bars: barsFound(turns),
        turns
      })
      writeRecents(next)
      return next
    })
  }, [lastState, conversation.id, restored, turns])

  // Navegador DEV: manda a pergunta da tela pedida.
  const devSent = useRef(false)
  useEffect(() => {
    // `require` dentro do `__DEV__`: o pior caso não entra no bundle de produção.
    if (__DEV__ && devState && !devSent.current) {
      devSent.current = true
      const {
        WORST_QUESTION
      }: typeof import('@/lib/ai-chat-demo') = require('@/lib/ai-chat-demo')
      send(dubla === 'pior' ? WORST_QUESTION : DEV_QUESTION[devState])
    }
  })

  // A proposta nova traz os interruptores como a IA sugeriu.
  const proposalId = pending?.id
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a proposta muda
  useEffect(() => {
    if (pending) setToggles(pending.actions.map((a) => a.on))
  }, [proposalId])
  // 24e no navegador DEV: confirma sozinho quando a resposta termina.
  const readyToConfirm = !!pending && !!lastReply?.done
  // biome-ignore lint/correctness/useExhaustiveDependencies: uma vez, com a proposta pronta
  useEffect(() => {
    if (devState !== 'feito' || !readyToConfirm || !pending) return
    const timer = setTimeout(
      () => approve(pending.actions.map((a) => a.on)),
      700
    )
    return () => clearTimeout(timer)
  }, [readyToConfirm])

  const approve = (values = toggles) => {
    if (!last || !lastReply?.proposal || !lastReply.done) return
    const proposal = lastReply.proposal
    const index = last.shown
    const id = last.id
    const kind = (k: string) =>
      values[proposal.actions.findIndex((a) => a.kind === k)] ?? false
    const patch = (fn: (reply: Reply) => Reply) =>
      setTurns((list) =>
        list.map((t) => (t.id === id ? patchVersion(t, index, fn) : t))
      )
    patch((r) => ({ ...r, decision: { kind: 'sending' } }))
    confirm(
      {
        runId: lastReply.done.runId,
        proposalId: proposal.id,
        actions: {
          going: kind('going'),
          call: kind('call'),
          remind: kind('remind')
        }
      },
      !!dubla
    )
      .then((result: ConfirmResult) => {
        haptic.success()
        patch((r) => ({ ...r, decision: { kind: 'approved', result } }))
      })
      .catch(() => {
        haptic.error()
        patch((r) => ({ ...r, decision: null }))
        Alert.alert('Não deu para confirmar', 'Tente de novo em instantes.')
      })
  }

  const refuse = () => {
    if (!last) return
    haptic.select()
    const index = last.shown
    setTurns((list) =>
      list.map((t) =>
        t.id === last.id
          ? patchVersion(t, index, (r) => ({
              ...r,
              decision: { kind: 'refused', at: clock(Date.now()) }
            }))
          : t
      )
    )
  }

  const removeChip = (key: string) => {
    if (!last) return
    const index = last.shown
    setTurns((list) =>
      list.map((t) =>
        t.id === last.id
          ? patchVersion(t, index, (r) => ({
              ...r,
              removed: [...r.removed, key]
            }))
          : t
      )
    )
  }

  const rate = (turn: Turn, value: 1 | -1) => {
    const reply = shownReply(turn)
    if (!reply.done) return
    const next = reply.feedback === value ? null : value
    haptic.select()
    setTurns((list) =>
      list.map((t) =>
        t.id === turn.id
          ? patchVersion(t, t.shown, (r) => ({ ...r, feedback: next }))
          : t
      )
    )
    if (!dubla) feedback.mutate({ runId: reply.done.runId, value: next })
  }

  const openBar = (runId: string | undefined, bar: ChatBar) => {
    if (runId && !dubla)
      action.mutate({ runId, kind: 'open_bar', barId: bar.id })
    // A página do bar sai da folha: dentro dela, a folha do "Vou assistir"
    // não abre (folha sobre folha). A conversa fica guardada para a volta.
    router.back()
    router.push({
      pathname: '/bar/[id]',
      params: {
        id: bar.id,
        km: bar.distanceKm === null ? undefined : String(bar.distanceKm),
        name: bar.name,
        photo: bar.photoUrl ?? undefined,
        walk: explore.device ? '1' : undefined,
        ai: runId && !dubla ? runId : undefined
      }
    })
  }

  // "Ver no mapa": o Explorar vai até o ponto da busca (o card do chat não
  // traz coordenadas).
  const showOnMap = () => {
    const focus = mapFocus(chips, fieldOrigin, radiusKm)
    if (!focus) return
    explore.setFocus(focus)
    router.back()
    router.navigate('/explore')
  }

  // A citação leva até o card do bar e o faz piscar.
  const goToBar = (barId: string) => {
    const card = cards.current.get(barId)
    const root = content.current
    if (!card || !root) return
    haptic.select()
    card.measureLayout(root, (_x, y) => {
      scroll.current?.scrollTo({
        y: Math.max(0, y - headHeight - 12),
        animated: true
      })
      setFlash({ id: barId, at: Date.now() })
    })
  }

  const newConversation = () => {
    running.current?.abort()
    if (!turns.length) {
      input.current?.focus()
      return
    }
    haptic.select()
    setRestored(false)
    setConversation({ id: newId(), turns: [] })
  }

  const reopen = (recent: Recent) => {
    haptic.select()
    setRestored(true)
    setConversation({ id: recent.id, turns: recent.turns })
  }

  // "+" do campo: põe de volta o local e troca o dia.
  const addContext = () => {
    const options: { label: string; run: () => void }[] = []
    if (!placeOn && placeLabel)
      options.push({
        label: `Perto de ${placeLabel}`,
        run: () => setPlaceOn(true)
      })
    if (day !== 'today')
      options.push({ label: 'Hoje', run: () => setDay('today') })
    if (day !== 'tomorrow')
      options.push({ label: 'Amanhã', run: () => setDay('tomorrow') })
    haptic.select()
    if (Platform.OS === 'ios')
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Adicionar à pergunta',
          options: [...options.map((o) => o.label), 'Cancelar'],
          cancelButtonIndex: options.length
        },
        (i) => options[i]?.run()
      )
    else
      Alert.alert('Adicionar à pergunta', undefined, [
        ...options.map((o) => ({ text: o.label, onPress: o.run })),
        { text: 'Cancelar', style: 'cancel' as const }
      ])
  }

  const lastBars = last && lastReply ? barsOf(last, lastReply) : []
  const subtitle = busy
    ? lastReply?.proposal
      ? 'Esperando sua confirmação'
      : 'Procurando…'
    : blocked
      ? `Volta ${resumeLabel(blocked.resumesAt, now)}`
      : off
        ? 'Fora do ar agora'
        : lastReply?.decision?.kind === 'sending'
          ? 'Confirmando…'
          : lastReply?.decision?.kind === 'approved'
            ? 'Feito'
            : lastReply?.decision?.kind === 'refused'
              ? 'Nada foi feito'
              : pending
                ? 'Esperando sua confirmação'
                : lastReply?.state === 'stopped'
                  ? 'Parei aqui'
                  : lastReply?.done && !lastReply.proposal
                    ? lastBars.length
                      ? `Achei ${lastBars.length} ${lastBars.length === 1 ? 'bar' : 'bares'} para você`
                      : 'Nenhum bar com esse pedido'
                    : 'Conhece os bares, a agenda e os seus gostos'
  const spinning =
    (busy && !lastReply?.proposal) || lastReply?.decision?.kind === 'sending'

  const placeholder = blocked
    ? `O chat volta ${resumeLabel(blocked.resumesAt, now)}`
    : off && !last
      ? 'A busca com IA está fora do ar'
      : busy
        ? 'Responda ou espere eu terminar…'
        : pending
          ? 'Mude algo antes de confirmar…'
          : lastReply?.decision?.kind === 'approved'
            ? 'Pergunte outra coisa…'
            : last
              ? 'Refine ou pergunte outra coisa…'
              : 'Pergunte sobre bares, jogos ou bairros…'

  const followItems =
    !busy && !pending && lastReply?.done && last
      ? followUps(lastReply.done.suggestions, lastBars.length > 0)
      : []

  const keyboard = useAnimatedKeyboard()
  // O rodapé sobe junto do teclado, só por transform (30 pt de respiro sem
  // teclado; 10 pt acima dele).
  const footer = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboard.height.get() - 20) }]
  }))

  return (
    <>
      {/* Filho direto da tela, com flex: 1: numa folha nativa o
          react-native-screens mede outro caminho e o conteúdo some. */}
      <ScrollView
        ref={scroll}
        style={[styles.sheet, { backgroundColor: palette.sheetBg }]}
        contentContainerStyle={{ paddingTop: headHeight }}
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={64}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            e.nativeEvent
          // Gruda no fim enquanto a pessoa não rolou para cima.
          stick.current =
            contentOffset.y + layoutMeasurement.height > contentSize.height - 80
        }}
        onContentSizeChange={() => {
          // Com o texto chegando em pedaços, uma rolagem animada por pedaço
          // treme: acompanha seco e só anima quando entra um bloco inteiro.
          if (stick.current && turns.length)
            scroll.current?.scrollToEnd({ animated: !streaming })
        }}
      >
        <LayoutAnimationConfig
          key={conversation.id}
          skipEntering={restored}
          skipExiting
        >
          <View ref={content} collapsable={false} style={styles.body}>
            {!turns.length ? (
              <Start
                recents={recents}
                now={now}
                notice={
                  off
                    ? 'A busca com IA está fora do ar agora. A busca normal continua funcionando.'
                    : blocked
                      ? `Você usou as perguntas ${blocked.scope === 'day' ? 'de hoje' : 'deste mês'}. O chat volta ${resumeLabel(blocked.resumesAt, now)}; a busca normal continua.`
                      : null
                }
                palette={palette}
                onAsk={(q) => send(q)}
                onRecent={reopen}
              />
            ) : null}
            {turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                bars={barsOf(turn, shownReply(turn))}
                isLast={turn === last}
                busy={busy}
                now={now}
                palette={palette}
                toggles={toggles}
                flash={flash}
                cardRef={(id, view) => {
                  if (view) cards.current.set(id, view)
                  else cards.current.delete(id)
                }}
                onBar={(bar) => openBar(shownReply(turn).done?.runId, bar)}
                onCite={goToBar}
                onRemoveChip={
                  turn === last && chipSearch(chips, [], fieldOrigin)
                    ? removeChip
                    : undefined
                }
                onToggle={(i) =>
                  setToggles((list) => list.map((v, j) => (j === i ? !v : v)))
                }
                onConfirm={() => approve()}
                onRefuse={refuse}
                onCode={(eventId) => {
                  router.back()
                  router.push({
                    pathname: '/codigo/[eventId]',
                    params: { eventId }
                  })
                }}
                onCopy={(value) => {
                  Clipboard.setStringAsync(value).catch(() => {})
                  haptic.success()
                }}
                onShare={(value) =>
                  Share.share({ message: value }).catch(() => {})
                }
                onRedo={() => send(undefined, turn)}
                onRate={(value) => rate(turn, value)}
                onVersion={(by) =>
                  setTurns((list) =>
                    list.map((t) => (t.id === turn.id ? stepVersion(t, by) : t))
                  )
                }
              />
            ))}
          </View>
        </LayoutAnimationConfig>
        <View style={{ height: dockHeight + 16 }} />
      </ScrollView>

      <View
        style={[styles.top, { backgroundColor: palette.sheetBg }]}
        onLayout={(e) => setHeadHeight(e.nativeEvent.layout.height)}
      >
        <AiHeader
          status={subtitle}
          busy={spinning}
          quiet={!!blocked || off}
          palette={palette}
          onNew={newConversation}
          onClose={() => router.back()}
        />
      </View>
      <Animated.View
        style={[styles.dock, footer]}
        onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
      >
        {/* Borda de rolagem: a conversa some aos poucos sob o rodapé. */}
        <LinearGradient
          pointerEvents="none"
          colors={[`${palette.sheet}00`, palette.sheet]}
          locations={[0, 0.3]}
          style={StyleSheet.absoluteFill}
        />
        {followItems.length ? (
          <FollowUps
            key={`${last?.id}-${last?.shown}`}
            items={followItems}
            palette={palette}
            onAsk={(q) => send(q)}
            onMap={showOnMap}
          />
        ) : blocked || off ? (
          <View style={styles.pills}>
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
        <PromptInput
          inputRef={input}
          draft={draft}
          onDraft={setDraft}
          placeholder={placeholder}
          busy={busy}
          editable={!blocked && !(off && !last)}
          // Os chips de contexto aparecem no início (24a); na conversa o
          // contexto continua valendo e o "+" o muda, como no design.
          place={
            !turns.length && placeOn && placeLabel
              ? { label: placeLabel, onRemove: () => setPlaceOn(false) }
              : null
          }
          day={
            !turns.length && day
              ? {
                  label: day === 'today' ? 'Hoje' : 'Amanhã',
                  onRemove: () => setDay(null)
                }
              : null
          }
          tastes={tastes}
          palette={palette}
          onTastes={() => setTastes((v) => !v)}
          onAdd={addContext}
          onSend={() => send()}
          onStop={stop}
        />
      </Animated.View>
    </>
  )
}

/** Uma troca: a pergunta e a versão da resposta que está na tela. */
function TurnView({
  turn,
  bars,
  isLast,
  busy,
  now,
  palette,
  toggles,
  flash,
  cardRef,
  onBar,
  onCite,
  onRemoveChip,
  onToggle,
  onConfirm,
  onRefuse,
  onCode,
  onCopy,
  onShare,
  onRedo,
  onRate,
  onVersion
}: {
  turn: Turn
  bars: ChatBar[]
  isLast: boolean
  busy: boolean
  now: number
  palette: AiPalette
  toggles: boolean[]
  flash: { id: string; at: number } | null
  cardRef: (id: string, view: View | null) => void
  onBar: (bar: ChatBar) => void
  onCite: (barId: string) => void
  onRemoveChip?: (key: string) => void
  onToggle: (index: number) => void
  onConfirm: () => void
  onRefuse: () => void
  onCode: (eventId: string) => void
  onCopy: (value: string) => void
  onShare: (value: string) => void
  onRedo: () => void
  onRate: (value: 1 | -1) => void
  onVersion: (by: -1 | 1) => void
}) {
  const reply = shownReply(turn)
  const thinking = isThinking(reply)
  const decision = reply.decision
  const approved = decision?.kind === 'approved' ? decision.result : null
  // O número de cada bar citado é a posição dele na resposta original.
  const numberOf = (barId: string) => {
    const i = reply.bars.findIndex((b) => b.id === barId)
    return i < 0 ? null : i + 1
  }
  const proposal = reply.proposal
  const when = proposal
    ? `${dayLabel(proposal.game.startsAt, now).toLocaleLowerCase('pt-BR')} ${formatTime(proposal.game.startsAt)}`
    : ''
  // Ferramenta esperando confirmação fica fora do raciocínio (24d).
  // Se a resposta caiu ou foi parada, nada fica "Aguardando você".
  const live = reply.state === 'run' || reply.state === 'done'
  const waiting = live ? reply.tools.filter((t) => t.state !== 'done') : []
  const answer = approved ? confirmText(approved) : reply.text
  const finished = reply.state === 'done' || reply.state === 'stopped'
  // Enquanto o texto cresce, a transição de layout recomeçaria a cada pedaço
  // em todos os blocos de baixo: eles assentam quando o texto para.
  const settle =
    isLast && reply.state === 'run' && reply.text ? undefined : SETTLE

  return (
    <>
      <Animated.View entering={IN} layout={settle}>
        <UserMessage palette={palette}>{turn.question}</UserMessage>
      </Animated.View>

      {/* Depois do "Confirmar", o raciocínio sai e ficam as linhas (24e).
          "Pensando" aparece já no envio: o primeiro passo só chega quando o
          modelo pede a primeira ferramenta, alguns segundos depois. */}
      {(reply.steps.length || thinking) && !approved ? (
        <Animated.View entering={IN} exiting={OUT} layout={settle}>
          <Reasoning
            steps={reply.steps}
            tools={reply.tools}
            thinking={thinking}
            label={thoughtLabel(reply)}
            palette={palette}
          />
        </Animated.View>
      ) : null}

      {/* Rodando: as ferramentas abaixo dos passos; prontas, entram no
          raciocínio quando ele fecha. Esperando você, ficam à vista. */}
      {(thinking ? reply.tools : approved ? [] : waiting).map((tool) => (
        <Animated.View
          key={tool.id}
          entering={IN}
          exiting={OUT}
          layout={settle}
        >
          <ToolCard
            tool={
              decision?.kind === 'refused'
                ? { ...tool, state: 'done', params: undefined }
                : tool
            }
            palette={palette}
          />
        </Animated.View>
      ))}

      {approved ? <ApprovedLines result={approved} palette={palette} /> : null}

      {reply.state === 'unavailable' ? (
        <Animated.View entering={IN} layout={settle}>
          <Text style={[styles.answer, { color: palette.ink }]}>
            Não consegui responder agora. Tente de novo em instantes; a busca
            normal continua.
          </Text>
        </Animated.View>
      ) : null}
      {reply.state === 'limit' && reply.limit ? (
        <Animated.View entering={IN} layout={settle}>
          <Text style={[styles.answer, { color: palette.ink }]}>
            Você usou as perguntas{' '}
            {reply.limit.scope === 'day' ? 'de hoje' : 'deste mês'}. O chat
            volta{' '}
            <Text style={{ fontFamily: 'Archivo-Bold' }}>
              {resumeLabel(reply.limit.resumesAt, now)}
            </Text>
            ; a busca normal continua.
          </Text>
        </Animated.View>
      ) : null}
      {reply.state === 'stopped' && !reply.text ? (
        <Animated.View entering={IN} layout={settle}>
          <Text style={[styles.answer, { color: palette.muted }]}>
            Você parou a resposta.
          </Text>
        </Animated.View>
      ) : null}

      {answer && !proposal && !waiting.some((t) => t.state === 'wait') ? (
        <Animated.View
          key={`texto-${turn.shown}`}
          entering={turn.versions.length > 1 ? SWAP : IN}
          layout={settle}
        >
          <AnswerText
            text={answer}
            count={reply.bars.length}
            palette={palette}
            onCite={(n) => {
              const bar = reply.bars[n - 1]
              if (bar) onCite(bar.id)
            }}
          />
        </Animated.View>
      ) : null}
      {approved ? (
        <Animated.View entering={IN} layout={settle}>
          <AnswerText text={answer} count={0} palette={palette} />
        </Animated.View>
      ) : null}

      {reply.done?.chips.length ? (
        <Animated.View entering={IN} layout={settle}>
          <FilterChips
            chips={reply.done.chips.filter(
              (c) => !reply.removed.includes(c.key)
            )}
            palette={palette}
            onRemove={
              onRemoveChip ? (chip) => onRemoveChip(chip.key) : undefined
            }
          />
        </Animated.View>
      ) : null}

      {/* Busca refeita sem bares (o design não desenha): a frase no lugar. */}
      {reply.removed.length && reply.bars.length && !bars.length ? (
        <Animated.View entering={IN} layout={settle}>
          <Text
            style={[styles.note, { color: palette.muted, textAlign: 'left' }]}
          >
            Sem bares com esses filtros. Tire outro ou pergunte de novo.
          </Text>
        </Animated.View>
      ) : null}

      {/* Os cards chegam com a ferramenta, antes do texto. */}
      {bars.length ? (
        <Animated.View layout={settle} style={{ gap: 10 }}>
          {bars.map((bar, i) => (
            <Animated.View key={bar.id} entering={BAR_IN[i]} layout={settle}>
              <CitedBar
                ref={(view) => cardRef(bar.id, view)}
                bar={bar}
                n={numberOf(bar.id)}
                now={now}
                palette={palette}
                flash={flash?.id === bar.id ? flash.at : undefined}
                onPress={() => onBar(bar)}
              />
            </Animated.View>
          ))}
        </Animated.View>
      ) : null}

      {reply.done?.sources.length ? (
        <Animated.View entering={IN} layout={settle}>
          <Sources
            label={sourcesLabel(reply.done.sources, reply.done.chips, now)}
            sources={reply.done.sources}
            numberOf={numberOf}
            palette={palette}
            onOpen={(s) => {
              const bar = reply.bars.find((b) => b.id === s.barId)
              if (bar) onBar(bar)
            }}
          />
        </Animated.View>
      ) : null}

      {/* Um só cartão do pedir ao confirmar: "Confirmar" vira o giro nele. */}
      {proposal && (!decision || decision.kind === 'sending') ? (
        <>
          <Animated.View entering={IN} exiting={OUT} layout={settle}>
            <ConfirmCard
              proposal={proposal}
              values={isLast ? toggles : proposal.actions.map((a) => a.on)}
              when={when}
              sending={decision?.kind === 'sending'}
              palette={palette}
              onToggle={onToggle}
              onConfirm={onConfirm}
              onRefuse={onRefuse}
            />
          </Animated.View>
          <Animated.View entering={IN} exiting={OUT} layout={settle}>
            <Text style={[styles.note, { color: palette.muted }]}>
              Nada é marcado sem você confirmar.
            </Text>
          </Animated.View>
        </>
      ) : null}
      {decision?.kind === 'refused' ? (
        <Animated.View entering={IN} layout={settle}>
          <DecisionLine
            approved={false}
            label="Você recusou · nada foi feito"
            at={decision.at}
            palette={palette}
          />
        </Animated.View>
      ) : null}

      {approved?.going?.ok && approved.going.code && proposal ? (
        <Animated.View entering={CODE_IN} layout={settle}>
          <CodeCard
            code={approved.going.code}
            title={approved.going.eventTitle}
            when={when}
            place={[approved.going.barName, approved.going.neighborhood]
              .filter(Boolean)
              .join(' · ')}
            palette={palette}
            onPress={() => onCode(proposal.game.id)}
          />
        </Animated.View>
      ) : null}

      {/* Com a confirmação na tela (24d) a resposta ainda não existe: sem ações. */}
      {finished &&
      (reply.text || approved) &&
      !(busy && isLast) &&
      !(proposal && (!decision || decision.kind === 'sending')) ? (
        <Animated.View entering={IN} layout={settle}>
          <Actions
            feedback={reply.feedback}
            version={versionLabel(turn)}
            palette={palette}
            onCopy={() => onCopy(plainText(answer))}
            onRedo={onRedo}
            onRate={onRate}
            onShare={() => onShare(plainText(answer))}
            onVersion={onVersion}
          />
        </Animated.View>
      ) : null}
    </>
  )
}

/** As linhas do que foi feito (24e), com a hora e "Pronto". */
function ApprovedLines({
  result,
  palette
}: {
  result: ConfirmResult
  palette: AiPalette
}) {
  const lines = [
    result.going && {
      icon: 'ticket' as const,
      label: result.going.ok ? 'Presença marcada' : 'Presença não marcada',
      failed: !result.going.ok
    },
    result.call && {
      icon: 'people' as const,
      label: result.call.ok
        ? `Chamado para ${firstName(result.call.friendName)}`
        : 'Chamado não enviado',
      failed: !result.call.ok
    },
    result.remind && {
      icon: 'bell' as const,
      label: result.remind.ok ? 'Lembrete marcado' : 'Lembrete não marcado',
      failed: !result.remind.ok
    }
  ].filter((l) => !!l)
  return lines.map((line, i) => (
    <Animated.View key={line.icon} entering={DONE_IN[i]} layout={SETTLE}>
      <DoneLine
        icon={line.icon}
        label={line.label}
        at={result.at}
        failed={line.failed}
        palette={palette}
      />
    </Animated.View>
  ))
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  body: { paddingTop: 6, paddingHorizontal: 16, paddingBottom: 14, gap: 14 },
  answer: { ...text(15.5, 'Regular', 1.5) },
  note: { ...text(12.5, 'Regular', 1.4), textAlign: 'center' },
  pills: { flexDirection: 'row', paddingHorizontal: 12 },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingBottom: 30,
    gap: 10
  }
})
