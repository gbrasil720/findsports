import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View
} from 'react-native'
import Animated, {
  FadeInDown,
  FadeOut,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, {
  Circle,
  Defs,
  Line,
  RadialGradient,
  Rect,
  Stop
} from 'react-native-svg'
import { Card } from '@/components/card'
import { initials } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import {
  EASE,
  ErrorText,
  haptic,
  POP,
  POP_FAST,
  popFrom,
  ScalePress,
  SWAP
} from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  CARD_H,
  CARD_W,
  Deck,
  DeckButtons,
  type DeckHandle,
  EdgeGlow,
  MiniCard,
  MissingCard,
  ReleaseHint
} from '@/components/suggestions'
import { usePalette } from '@/components/theme'
import {
  ACCENT,
  ACID,
  BlockButton,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { env } from '@/lib/env'
import { type Coordinates, searchCenter } from '@/lib/explore'
import { dayKey } from '@/lib/filters'
import { todayGoing } from '@/lib/notices'
import {
  isToday,
  nextRoundLabel,
  type Round,
  roundSummary,
  type Suggestion,
  sportWord,
  stripLabel
} from '@/lib/suggestions'
import { trpc } from '@/lib/trpc'

/*
 * "Bares pra você" (seção 08 do design: 23a–23k, regras da 22e e gestos da
 * 23g). Uma rodada de até cinco bares por dia, gravada no servidor; a
 * próxima abre às 10:00 de Brasília. Direita Curti (salva e conta como
 * interesse forte), esquerda Passo (some por 30 dias), Voltar desfaz.
 * Aberta pelo item do menu "Você" (2c), por cima, sem a barra de abas.
 */

type Place = Coordinates & { name?: string }

// Constantes de módulo: o Reanimated recomeça a entrada se o objeto muda.
const MATCH_OUT = FadeOut.duration(140)
// O "COMBINOU!" e o confete chegam logo atrás do par, não depois de tudo.
const MATCH_TITLE = popFrom(0.9, 90)
const CONFETTI_IN = popFrom(0.9, 150)
// As miniaturas da 23f/23h entram em cascata (tela rara: cabe o capricho).
const STRIP_IN = [0, 1, 2, 3, 4].map((i) =>
  FadeInDown.delay(i * 50)
    .duration(220)
    .easing(EASE)
    // O padrão do FadeInDown sobe 25 pt: aqui só assenta.
    .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
)
type Decision = 'liked' | 'passed' | null

export default function SuggestionsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const dark = palette.dark
  const soon = useSoon()
  const queryClient = useQueryClient()
  const state = useExploreState()
  useStatusBar('auto')
  // Só no navegador DEV: força um estado vazio para conferir o desenho.
  const { estado } = useLocalSearchParams<{ estado?: string }>()

  // Aberta por link (sem tela embaixo), fechar leva ao Explorar.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/explore')
  const [place, setPlace] = useState<Place | null>(null)
  const where = place ?? state.device
  const todayKey = trpc.recommendations.today.queryKey()
  const today = useQuery(
    trpc.recommendations.today.queryOptions({
      where: where ? { lat: where.lat, lng: where.lng } : null
    })
  )
  const round = today.data?.round ?? null
  const userRadius = today.data?.userRadiusKm ?? 3

  // Decisões desta visita, antes de o servidor responder (e o Voltar).
  const [local, setLocal] = useState<Record<string, Decision>>({})
  const history = useRef<{ barId: string; direction: 'like' | 'pass' }[]>([])
  const [returning, setReturning] = useState<{
    barId: string
    direction: 'like' | 'pass'
  } | null>(null)
  const [finishedHere, setFinishedHere] = useState(false)
  const [match, setMatch] = useState<Suggestion | null>(null)
  const [picking, setPicking] = useState(false)
  const deck = useRef<DeckHandle>(null)
  const drag = useSharedValue(0)
  const now = Date.now()

  const items: Suggestion[] = (round?.items ?? []).map((item) =>
    item.barId in local
      ? { ...item, decision: local[item.barId] ?? null }
      : item
  )
  const merged: Round | null = round ? { ...round, items } : null
  const pending = items.filter((item) => !item.decision)

  const refresh = () => queryClient.invalidateQueries({ queryKey: todayKey })
  const like = useMutation(trpc.recommendations.like.mutationOptions())
  const pass = useMutation(trpc.recommendations.dismiss.mutationOptions())
  const undo = useMutation(trpc.recommendations.undo.mutationOptions())
  const impressions = useMutation(
    trpc.recommendations.recordImpressions.mutationOptions()
  )
  const recordOpen = useMutation(
    trpc.recommendations.recordOpen.mutationOptions()
  )
  const remind = useMutation(
    trpc.recommendations.remind.mutationOptions({ onSettled: refresh })
  )
  const alert = useMutation(
    trpc.recommendations.setAlert.mutationOptions({ onSettled: refresh })
  )

  // A impressão do card que fica por cima (uma vez por bar e rodada).
  const top = pending[0]
  const seen = useRef(new Set<string>())
  // biome-ignore lint/correctness/useExhaustiveDependencies: um registro por card
  useEffect(() => {
    if (!round || !top || top.seen || seen.current.has(top.barId)) return
    seen.current.add(top.barId)
    impressions.mutate({
      runId: round.runId,
      items: [
        {
          barId: top.barId,
          position: top.position,
          reason: top.reason,
          expandedRadius: top.isExpandedRadius
        }
      ]
    })
  }, [top?.barId, round?.runId])

  const decide = (item: Suggestion, direction: 'like' | 'pass') => {
    if (!round) return
    history.current.push({ barId: item.barId, direction })
    setReturning(null)
    setLocal((all) => ({
      ...all,
      [item.barId]: direction === 'like' ? 'liked' : 'passed'
    }))
    if (pending.length === 1) setFinishedHere(true)
    const input = { runId: round.runId, barId: item.barId }
    if (direction === 'like') {
      like.mutate(input, {
        onSettled: () => {
          refresh()
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getFavorites.queryKey()
          })
        }
      })
      setMatch(item)
    } else pass.mutate(input, { onSettled: refresh })
  }

  const back = () => {
    const last = history.current.pop()
    if (!last || !round) return
    haptic.select()
    setFinishedHere(false)
    setReturning(last)
    setLocal((all) => ({ ...all, [last.barId]: null }))
    undo.mutate(
      { runId: round.runId, barId: last.barId },
      {
        onSettled: () => {
          refresh()
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getFavorites.queryKey()
          })
        }
      }
    )
  }

  const openBar = (item: Suggestion) => {
    if (round) recordOpen.mutate({ runId: round.runId, barId: item.barId })
    router.push({
      pathname: '/bar/[id]',
      params: {
        id: item.barId,
        name: item.name,
        photo: item.photoUrl ?? undefined,
        km: String(item.distanceKm)
      }
    } as Href)
  }
  const going = (item: Suggestion) => {
    if (!round || !item.game) return
    router.push({
      pathname: '/vou/[barId]',
      params: { barId: item.barId, eventId: item.game.id, runId: round.runId }
    } as Href)
  }
  const sportAlert = (item: Suggestion) => item.facts.usualSports[0] ?? null
  const actionsFor = (item: Suggestion) => ({
    onOpen: () => openBar(item),
    onGo: () => going(item),
    onRemind: () => {
      if (!item.game || !round) return
      haptic.select()
      remind.mutate({
        eventId: item.game.id,
        on: !item.game.reminded,
        runId: round.runId
      })
    },
    onAlert: () => {
      const sport = sportAlert(item)
      if (!sport || !round) return
      haptic.select()
      const on = !item.alerts.sportIds.includes(sport.id)
      alert.mutate({
        barId: item.barId,
        sportId: sport.id,
        on,
        runId: round.runId
      })
    }
  })

  const why = () => {
    if (!round || !top) return
    router.push({
      pathname: '/por-que',
      params: { runId: round.runId, barId: top.barId }
    } as Href)
  }

  // --- Estados --------------------------------------------------------------

  const header = (subtitle: string) => (
    <Header
      subtitle={subtitle}
      onClose={close}
      onSettings={() =>
        router.push({
          pathname: '/configuracoes',
          params: { aba: 'preferencias' }
        })
      }
    />
  )

  const demo = __DEV__ ? estado : undefined
  let body: React.ReactNode
  let subtitle = ''
  if (
    demo === 'sem-local' ||
    picking ||
    (!round && !where && !today.isPending)
  ) {
    subtitle = 'Precisamos saber onde você está'
    body = (
      <Locate
        center={searchCenter(state.device, null)}
        picking={picking}
        onPlace={(next) => {
          setPicking(false)
          setPlace(next)
        }}
        onSettings={() => Linking.openSettings()}
      />
    )
  } else if (!merged) {
    body = <ActivityIndicator color={palette.ink} style={{ marginTop: 120 }} />
  } else if (demo === 'vazio' || merged.items.length === 0) {
    subtitle = 'Nada por aqui ainda'
    body = (
      <Empty
        radiusKm={userRadius}
        where={where}
        onPick={() => setPicking(true)}
        onFilled={refresh}
      />
    )
  } else if (pending.length && !demo) {
    const index = items.length - pending.length + 1
    subtitle = `${index} de ${items.length} · curta ou passe`
    body = (
      <View style={{ flex: 1 }}>
        <View style={styles.deckArea}>
          <Deck
            ref={deck}
            items={pending}
            now={now}
            drag={drag}
            returning={returning}
            onDecide={decide}
            onOpen={openBar}
            actions={actionsFor}
          />
        </View>
        {/* A 28 pt do rodapé, como no design (o indicador de início fica por cima). */}
        <View style={[styles.controls, { paddingBottom: 28 }]}>
          <ReleaseHint drag={drag} dark={dark} />
          <DeckButtons
            drag={drag}
            dark={dark}
            canUndo={history.current.length > 0}
            onUndo={back}
            onPass={() => deck.current?.fling('pass')}
            onLike={() => deck.current?.fling('like')}
            onWhy={why}
          />
        </View>
      </View>
    )
  } else if (merged.items.length < 5 || demo === 'curta') {
    const size = demo === 'curta' ? 2 : merged.items.length
    subtitle = `${size} de ${size} · rodada curta`
    body = (
      <Short
        round={
          demo === 'curta'
            ? { ...merged, items: merged.items.slice(0, 2) }
            : merged
        }
        radiusKm={round?.radiusKm ?? userRadius}
        where={where}
        now={now}
        onFilled={() => {
          setFinishedHere(false)
          refresh()
        }}
      />
    )
  } else if (finishedHere || demo === 'fechada') {
    subtitle = ''
    body = <Closed round={merged} now={now} />
  } else {
    subtitle = `${merged.items.length} de ${merged.items.length} · você viu todos`
    body = (
      <SeenAll
        round={merged}
        now={now}
        onReview={() => {
          const passed = merged.items.filter((i) => i.decision === 'passed')
          setLocal((all) => ({
            ...all,
            ...Object.fromEntries(passed.map((i) => [i.barId, null]))
          }))
          for (const item of passed)
            undo.mutate(
              { runId: merged.runId, barId: item.barId },
              { onSettled: refresh }
            )
        }}
      />
    )
  }

  const closed = body && subtitle === '' && merged && !pending.length
  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      {dark ? <CenterGlow /> : null}
      {pending.length && !demo ? <EdgeGlow drag={drag} /> : null}
      <View style={{ paddingTop: insets.top + 4, flex: 1 }}>
        {closed ? (
          <View style={styles.closeOnly}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              hitSlop={8}
              onPress={close}
            >
              <GlassRound>
                <Icon name="close" size={18} color={palette.ink} />
              </GlassRound>
            </Pressable>
          </View>
        ) : (
          header(subtitle)
        )}
        {body}
      </View>
      {match && merged ? (
        <Match
          item={match}
          runId={merged.runId}
          now={now}
          onClose={() => setMatch(null)}
          onGo={() => {
            const item = match
            setMatch(null)
            going(item)
          }}
          onBar={() => {
            const item = match
            setMatch(null)
            openBar(item)
          }}
        />
      ) : null}
      {soon.toast}
    </View>
  )
}

/** O brilho acid de fundo do escuro (8%, no centro), parado. */
function CenterGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="center" cx="50%" cy="50%" rx="80%" ry="50%">
          <Stop offset="0" stopColor={ACID} stopOpacity={0.08} />
          <Stop offset="0.7" stopColor={ACID} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#center)" />
    </Svg>
  )
}

// --- Cabeçalho ---------------------------------------------------------------

function Header({
  subtitle,
  onClose,
  onSettings
}: {
  subtitle: string
  onClose: () => void
  onSettings: () => void
}) {
  const palette = usePalette()
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        hitSlop={8}
        onPress={onClose}
      >
        <GlassRound>
          <Icon name="close" size={18} color={palette.ink} />
        </GlassRound>
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.title, { color: palette.ink }]}>
          Bares pra você
        </Text>
        <Animated.Text
          key={subtitle}
          entering={SWAP}
          style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
          numberOfLines={1}
        >
          {subtitle}
        </Animated.Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Preferências das sugestões"
        hitSlop={8}
        onPress={onSettings}
      >
        <GlassRound>
          <Icon name="sliders" size={18} color={palette.ink} accent={LIVE} />
        </GlassRound>
      </Pressable>
    </View>
  )
}

// --- Combinou! (23d, 23e) ----------------------------------------------------

function Match({
  item,
  runId,
  now,
  onClose,
  onGo,
  onBar
}: {
  item: Suggestion
  runId: string
  now: number
  onClose: () => void
  onGo: () => void
  onBar: () => void
}) {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const session = authClient.useSession()
  const dark = palette.dark
  const hot = dark ? ACID : palette.live
  const game = item.game
  const going = game?.going ? todayGoing(game.going) : null
  const gameToday = game ? isToday(game.startsAt, now) : false
  const teams = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const queryClient = useQueryClient()
  const alert = useMutation(trpc.recommendations.setAlert.mutationOptions())
  const remind = useMutation(trpc.recommendations.remind.mutationOptions())
  // O esporte do aviso: o seu que o bar costuma passar, senão o primeiro dele.
  const mine = new Set((prefs.data ?? []).map((p) => p.sportId))
  const sport =
    item.facts.usualSports.find((s) => mine.has(s.id)) ??
    item.facts.usualSports[0] ??
    null
  const team = teams.data?.[0] ?? null
  const [sportOn, setSportOn] = useState(true)
  const [teamOn, setTeamOn] = useState(false)

  const leave = async (then: () => void) => {
    if (!game) {
      const work: Promise<unknown>[] = []
      if (sport && sportOn)
        work.push(
          alert.mutateAsync({
            barId: item.barId,
            sportId: sport.id,
            on: true,
            runId
          })
        )
      if (team && teamOn)
        work.push(
          alert.mutateAsync({
            barId: item.barId,
            teamId: team.id,
            on: true,
            runId
          })
        )
      await Promise.allSettled(work)
      queryClient.invalidateQueries({
        queryKey: trpc.recommendations.today.queryKey()
      })
    }
    then()
  }

  return (
    <Animated.View
      entering={SWAP}
      exiting={MATCH_OUT}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: palette.bg, zIndex: 100 }
      ]}
    >
      <View
        style={[
          styles.matchBody,
          { paddingTop: insets.top + 16, paddingBottom: 28 }
        ]}
      >
        <Confetti />
        <Animated.View entering={POP} style={styles.pair}>
          <View style={styles.meRing} />
          <View style={[styles.me, { borderColor: dark ? INK : PAPER }]}>
            <Text style={styles.meText}>
              {initials(session.data?.user.name ?? '')}
            </Text>
          </View>
          <View style={[styles.them, { borderColor: dark ? PAPER : INK }]}>
            {item.photoUrl ? (
              <Image source={{ uri: item.photoUrl }} style={styles.themPhoto} />
            ) : null}
          </View>
          <View style={[styles.heart, { backgroundColor: INK }]}>
            <Icon name="fan" size={22} color={ACID} accent={ACID} />
          </View>
        </Animated.View>
        <Animated.View entering={MATCH_TITLE} style={{ alignItems: 'center' }}>
          <Title
            lines={[['COM', 'BINOU!']]}
            size={78}
            color={palette.ink}
            accentColor={hot}
          />
          <Text
            style={[
              text(16, 'Regular', 1.45),
              { color: palette.muted, textAlign: 'center', marginTop: 10 }
            ]}
          >
            O{' '}
            <Text style={{ fontFamily: 'Archivo-Bold', color: palette.ink }}>
              {item.name}
            </Text>{' '}
            foi para os seus Salvos.
            {game ? '' : ' Ainda não tem jogo marcado lá.'}
          </Text>
        </Animated.View>

        {game ? (
          // O ingresso é papel no escuro (design) e tinta no claro.
          <View>
            <View style={[styles.ticketShadow, { backgroundColor: ACID }]} />
            <View
              style={[styles.ticket, { backgroundColor: dark ? PAPER : INK }]}
            >
              <View style={styles.ticketTop}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[text(13, 'Bold'), { color: dark ? ACCENT : LIVE }]}
                  >
                    {gameToday ? 'Tem jogo aqui hoje' : 'Tem jogo aqui'}
                  </Text>
                  <Text
                    style={[styles.ticketTitle, { color: dark ? INK : PAPER }]}
                  >
                    {gameTitle(game)}
                  </Text>
                </View>
                <Text
                  style={[styles.ticketTime, { color: dark ? INK : PAPER }]}
                >
                  {new Date(game.startsAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Sao_Paulo'
                  })}
                </Text>
              </View>
              {going && (going.bold || going.rest !== 'Você vai') ? (
                <>
                  <Perforation
                    ink={dark ? 'rgba(18,18,15,.2)' : 'rgba(241,238,230,.2)'}
                  />
                  {/* "Marina e mais 17 vão" (23d): amigos pela privacidade
                    de cada um (WEB-404), o resto só contagem e iniciais. */}
                  <View style={styles.goingRow}>
                    <View style={{ flexDirection: 'row' }}>
                      {going.faces.map((letters, i) => (
                        <View
                          // biome-ignore lint/suspicious/noArrayIndexKey: iniciais repetem, a posição é a identidade
                          key={`${letters}${i}`}
                          style={[
                            styles.face,
                            {
                              backgroundColor: i ? LIVE : ACID,
                              marginLeft: i ? -8 : 0,
                              borderColor: dark ? PAPER : INK
                            }
                          ]}
                        >
                          <Text style={[text(11, 'Bold', 1), { color: INK }]}>
                            {letters}
                          </Text>
                        </View>
                      ))}
                      {going.more > 0 ? (
                        <View
                          style={[
                            styles.face,
                            {
                              backgroundColor: INK,
                              marginLeft: -8,
                              borderColor: dark ? PAPER : INK
                            }
                          ]}
                        >
                          <Text style={[text(11, 'Bold', 1), { color: PAPER }]}>
                            +{going.more.toLocaleString('pt-BR')}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[text(14), { color: dark ? INK : PAPER, flex: 1 }]}
                    >
                      {going.bold ? (
                        <Text style={{ fontFamily: 'Archivo-Bold' }}>
                          {going.bold}
                        </Text>
                      ) : null}
                      {going.rest}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        ) : (
          <Card shadow={dark ? '#5d7020' : ACID} offset={6}>
            {sport ? (
              <ToggleRow
                icon="bell"
                title={`Avisar quando passar ${sportWord(sport.name)}`}
                sub="Quando o bar publicar um jogo do seu esporte"
                on={sportOn}
                onChange={setSportOn}
              />
            ) : null}
            {team ? (
              <ToggleRow
                icon="tv"
                title={`Avisar em jogo do ${team.name}`}
                sub="Só se for o seu time"
                on={teamOn}
                onChange={setTeamOn}
                last
              />
            ) : null}
          </Card>
        )}

        <View style={{ flex: 1 }} />
        {game && gameToday ? (
          <>
            <PillButton
              label="Vou assistir hoje"
              leading="ticket"
              onPress={onGo}
            />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
              <Text
                style={[
                  text(15, 'Bold'),
                  styles.later,
                  { color: palette.muted }
                ]}
              >
                Agora não · continuar vendo
              </Text>
            </Pressable>
          </>
        ) : game ? (
          // Jogo em outro dia: o design não desenha; vale o "Lembrar" do card.
          <>
            <PillButton
              label={game.reminded ? 'Lembrete ligado' : 'Lembrar no dia'}
              leading="bell"
              onPress={() => {
                if (!game.reminded)
                  remind.mutate(
                    { eventId: game.id, on: true, runId },
                    {
                      onSettled: () =>
                        queryClient.invalidateQueries({
                          queryKey: trpc.recommendations.today.queryKey()
                        })
                    }
                  )
                haptic.success()
                onClose()
              }}
            />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose}>
              <Text
                style={[
                  text(15, 'Bold'),
                  styles.later,
                  { color: palette.muted }
                ]}
              >
                Agora não · continuar vendo
              </Text>
            </Pressable>
          </>
        ) : (
          <View style={styles.matchButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={() => leave(onBar)}
              style={{ flex: 1 }}
            >
              <View
                style={[
                  styles.ghost,
                  dark
                    ? {
                        backgroundColor: '#1c1c18',
                        borderColor: 'rgba(241,238,230,.18)'
                      }
                    : {
                        backgroundColor: '#fffdf8',
                        borderColor: 'rgba(18,18,15,.12)'
                      }
                ]}
              >
                <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                  Ver o bar
                </Text>
              </View>
            </Pressable>
            <View style={{ flex: 1.3 }}>
              <PillButton label="Continuar" onPress={() => leave(onClose)} />
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  )
}

function Confetti() {
  // Os quadradinhos do design, parados: celebração rara, sem chuva.
  const bits = [
    { left: 196, top: 30, size: 10, color: PAPER, rot: 45 },
    { left: 50, top: 90, size: 12, color: ACID, rot: 20 },
    { left: 36, top: 180, size: 10, color: LIVE, rot: -15 },
    { left: 330, top: 72, size: 14, color: LIVE, rot: 12 },
    { left: 350, top: 182, size: 8, color: PAPER, rot: 45 }
  ]
  return (
    <Animated.View
      entering={CONFETTI_IN}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {bits.map((bit) => (
        <View
          key={`${bit.left}-${bit.top}`}
          style={{
            position: 'absolute',
            left: bit.left,
            top: bit.top + 60,
            width: bit.size,
            height: bit.size,
            backgroundColor: bit.color,
            borderRadius: 2,
            transform: [{ rotate: `${bit.rot}deg` }]
          }}
        />
      ))}
    </Animated.View>
  )
}

function Perforation({ ink }: { ink: string }) {
  const palette = usePalette()
  return (
    <View style={styles.cut}>
      <View style={[styles.hole, { left: -9, backgroundColor: palette.bg }]} />
      <Svg height={2} style={{ marginHorizontal: 14 }}>
        <Line
          x1={0}
          y1={1}
          x2="100%"
          y2={1}
          stroke={ink}
          strokeWidth={1.5}
          strokeDasharray="5,5"
        />
      </Svg>
      <View style={[styles.hole, { right: -9, backgroundColor: palette.bg }]} />
    </View>
  )
}

function ToggleRow({
  icon,
  title,
  sub,
  on,
  onChange,
  last
}: {
  icon: 'bell' | 'tv'
  title: string
  sub: string
  on: boolean
  onChange: (on: boolean) => void
  last?: boolean
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={() => {
        haptic.select()
        onChange(!on)
      }}
      style={[
        styles.toggleRow,
        !last && { borderBottomWidth: 1, borderBottomColor: palette.line }
      ]}
    >
      <Icon
        name={icon}
        size={22}
        color={palette.ink}
        accent={palette.dark ? ACID : LIVE}
      />
      <View style={{ flex: 1 }}>
        <Text style={[text(15.5, 'Bold', 1.3), { color: palette.ink }]}>
          {title}
        </Text>
        <Text style={[text(13.5, 'Regular', 1.35), { color: palette.muted }]}>
          {sub}
        </Text>
      </View>
      <Switch on={on} off={palette.dark ? '#2a2a25' : '#d9d5cc'} />
    </Pressable>
  )
}

/**
 * O interruptor: a bolinha anda (180 ms) e trilho e bolinha trocam de cor no
 * mesmo passo, em vez de a cor pular no primeiro quadro.
 */
function Switch({ on, off }: { on: boolean; off: string }) {
  const x = useSharedValue(on ? 22 : 0)
  useEffect(() => {
    x.set(withTiming(on ? 22 : 0, { duration: 180, easing: EASE }))
  }, [on, x])
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(x.get(), [0, 22], [off, ACID])
  }))
  const knob = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(x.get(), [0, 22], [PAPER, INK]),
    transform: [{ translateX: x.get() }]
  }))
  return (
    <Animated.View style={[styles.switch, track]}>
      <Animated.View style={[styles.knob, knob]} />
    </Animated.View>
  )
}

// --- Fim da rodada (23f) -----------------------------------------------------

function Closed({ round, now }: { round: Round; now: number }) {
  const palette = usePalette()
  const router = useRouter()
  const dark = palette.dark
  const liked = round.items.filter((i) => i.decision === 'liked')
  const ticket = round.items.find(
    (i) => i.game?.attending && isToday(i.game.startsAt, now)
  )
  const alerted = round.items.find(
    (i) => i.alerts.sportIds.length || i.alerts.teamIds.length
  )
  const sportName = alerted?.facts.usualSports.find((s) =>
    alerted.alerts.sportIds.includes(s.id)
  )?.name
  return (
    <ScrollView contentContainerStyle={styles.endBody}>
      <Strip round={round} now={now} dark={dark} />
      <Animated.View entering={POP}>
        <Title
          lines={[['RODADA ', 'FECHADA.']]}
          size={56}
          color={palette.ink}
          accentColor={dark ? ACID : palette.live}
        />
      </Animated.View>
      <Text style={[text(16, 'Regular', 1.45), { color: palette.muted }]}>
        {roundSummary(round, now)}
      </Text>
      {/* No lugar do "Mais 5 pra você": a rodada é uma por dia (dono). */}
      <NextRound at={round.nextRoundAt} now={now} />
      <View style={[styles.rows, { borderTopColor: palette.line }]}>
        {ticket?.game ? (
          <Row
            icon="ticket"
            title="Ver meu código"
            sub={`${ticket.name} · hoje ${new Date(ticket.game.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`}
            onPress={() => router.push(`/codigo/${ticket.game?.id}` as Href)}
          />
        ) : null}
        {liked.length ? (
          <Row
            icon="fan"
            title={`${liked.length} ${liked.length === 1 ? 'bar' : 'bares'} em Salvos`}
            sub={liked.map((i) => i.name).join(', ')}
            onPress={() =>
              router.navigate({
                pathname: '/favoritos',
                params: { aba: 'saved' }
              })
            }
          />
        ) : null}
        {alerted ? (
          <Row
            icon="bell"
            title="Aviso ligado"
            sub={`${alerted.name} · ${sportName ? `quando passar ${sportWord(sportName)}` : 'em jogo do seu time'}`}
            onPress={() => router.push('/avisos')}
          />
        ) : null}
      </View>
    </ScrollView>
  )
}

function NextRound({ at, now }: { at: string; now: number }) {
  const palette = usePalette()
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.next}>
        <Icon
          name="calendar"
          size={16}
          color={palette.ink}
          accent={palette.dark ? ACID : LIVE}
        />
        <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
          {nextRoundLabel(at, now)}
        </Text>
      </Glass>
    </View>
  )
}

function Strip({
  round,
  now,
  dark,
  missing = 0
}: {
  round: Round
  now: number
  dark: boolean
  missing?: number
}) {
  // Rodada curta (23h): os bares largos e os lugares vazios estreitos.
  const palette = usePalette()
  const width = missing ? 96 : 68
  const height = missing ? 128 : 116
  return (
    <View style={styles.strip}>
      {round.items.map((item, i) => (
        <Animated.View key={item.barId} entering={STRIP_IN[i]}>
          <MiniCard
            item={item}
            label={stripLabel(item, now)}
            width={width}
            height={height}
            tilt={[-3, 1, 0, 1.5, 3][i] ?? 0}
            dark={dark}
          />
        </Animated.View>
      ))}
      {Array.from({ length: missing }, (_, i) => (
        <MissingCard
          // biome-ignore lint/suspicious/noArrayIndexKey: lugares vazios, a posição é a identidade
          key={`missing-${i}`}
          width={46}
          height={height}
          dark={palette.dark}
        />
      ))}
    </View>
  )
}

function Row({
  icon,
  title,
  sub,
  onPress
}: {
  icon: 'ticket' | 'fan' | 'bell' | 'tv' | 'calendar' | 'search' | 'bar'
  title: string
  sub: string
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <ScalePress
      accessibilityRole="button"
      to={0.985}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: palette.line }]}
    >
      <Icon
        name={icon}
        size={24}
        color={palette.ink}
        accent={palette.dark ? ACID : LIVE}
      />
      <View style={{ flex: 1 }}>
        <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
          {title}
        </Text>
        <Text
          style={[text(14, 'Regular', 1.35), { color: palette.muted }]}
          numberOfLines={2}
        >
          {sub}
        </Text>
      </View>
      <Icon name="next" size={14} color={palette.muted} />
    </ScalePress>
  )
}

// --- Rodada curta (23h) ------------------------------------------------------

function useExpansion(where: Coordinates | null, enabled: boolean) {
  return useQuery({
    ...trpc.recommendations.expansion.queryOptions(where ?? { lat: 0, lng: 0 }),
    enabled: enabled && Boolean(where)
  })
}

function useRefill(onFilled: () => void) {
  return useMutation(
    trpc.recommendations.refill.mutationOptions({
      onSuccess: () => {
        haptic.success()
        onFilled()
      }
    })
  )
}

function Short({
  round,
  radiusKm,
  where,
  now,
  onFilled
}: {
  round: Round
  radiusKm: number
  where: Coordinates | null
  now: number
  onFilled: () => void
}) {
  const palette = usePalette()
  const router = useRouter()
  const state = useExploreState()
  const dark = palette.dark
  const expansion = useExpansion(where, true)
  const refill = useRefill(onFilled)
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const savePrefs = useMutation(trpc.pubs.updateMyPreferences.mutationOptions())
  const days = useQuery({
    ...trpc.pubs.gameDays.queryOptions({
      ...(where ?? { lat: 0, lng: 0 }),
      radiusKm: Math.min(50, radiusKm * 2)
    }),
    enabled: Boolean(where)
  })
  const tomorrow = days.data?.[1]
  const extra = expansion.data?.sports ?? []
  const n = round.items.length
  const weekday = new Date(`${dayKey(now, 1)}T15:00:00Z`).toLocaleDateString(
    'pt-BR',
    { weekday: 'long', timeZone: 'America/Sao_Paulo' }
  )
  return (
    <ScrollView contentContainerStyle={styles.endBody}>
      <Strip round={round} now={now} dark={dark} missing={5 - n} />
      <Animated.View entering={POP}>
        <Title
          lines={[[`SÓ ${n} `, 'POR HOJE.']]}
          size={56}
          color={palette.ink}
          accentColor={dark ? ACID : palette.live}
        />
      </Animated.View>
      <Text style={[text(17, 'Regular', 1.45), { color: palette.ink }]}>
        No seu raio de {radiusKm} km, só {n}{' '}
        {n === 1 ? 'bar combina' : 'bares combinam'} com você agora.
        {expansion.data?.bars ? ' Abrindo um pouco, aparecem mais.' : ''}
      </Text>
      {expansion.data?.bars && where ? (
        <PillButton
          label={
            refill.isPending
              ? 'Ampliando…'
              : `Ampliar para ${expansion.data.radiusKm} km · +${expansion.data.bars} ${expansion.data.bars === 1 ? 'bar' : 'bares'}`
          }
          leading="pin"
          onPress={() =>
            refill.mutate({
              where,
              radiusKm: expansion.data?.radiusKm ?? radiusKm
            })
          }
        />
      ) : null}
      {(extra.length && where) || tomorrow?.games ? (
        <Card soft>
          {extra.length && where ? (
            <Row
              icon="tv"
              title={`Incluir ${listNames(extra.map((s) => sportWord(s.name)))}`}
              sub="Mais esportes, mais bares"
              onPress={async () => {
                const ids = [
                  ...(prefs.data ?? []).map((p) => p.sportId),
                  ...extra.map((s) => s.id)
                ]
                await savePrefs.mutateAsync({ sportIds: ids })
                refill.mutate({ where, radiusKm })
              }}
            />
          ) : null}
          {tomorrow?.games ? (
            <Row
              icon="calendar"
              title="Ver bares com jogo amanhã"
              sub={`${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} tem ${tomorrow.games} ${tomorrow.games === 1 ? 'jogo' : 'jogos'} perto`}
              onPress={() => {
                state.setFilters({ ...state.filters, date: dayKey(now, 1) })
                router.dismissTo('/explore')
              }}
            />
          ) : null}
        </Card>
      ) : null}
      <Text
        style={[
          text(14, 'Regular', 1.45),
          { color: palette.muted, textAlign: 'center' }
        ]}
      >
        Novas sugestões chegam quando um bar perto publica um jogo.
      </Text>
    </ScrollView>
  )
}

const listNames = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
    : (names[0] ?? '')

// --- Nada no raio (23i) ------------------------------------------------------

function Empty({
  radiusKm,
  where,
  onPick,
  onFilled
}: {
  radiusKm: number
  where: Coordinates | null
  onPick: () => void
  onFilled: () => void
}) {
  const palette = usePalette()
  const dark = palette.dark
  const expansion = useExpansion(where, true)
  const refill = useRefill(onFilled)
  const invite = () =>
    Share.share({
      message: `Conhece um bar que passa jogo aqui perto? Ele pode entrar na Onside de graça e aparecer para quem procura onde assistir: ${env.EXPO_PUBLIC_SERVER_URL}/signup?role=pub`
    }).catch(() => {})
  return (
    <ScrollView contentContainerStyle={styles.endBody}>
      <Card shadow={ACID} offset={6}>
        <View style={styles.mapBox}>
          <Image
            source={
              dark
                ? require('../assets/images/intro/map-dark.jpg')
                : require('../assets/images/intro/map.jpg')
            }
            style={{ width: '100%', height: 250 }}
            resizeMode="cover"
          />
          <Svg style={StyleSheet.absoluteFill} viewBox="0 0 358 250">
            <Circle
              cx={179}
              cy={128}
              r={84}
              fill="none"
              stroke={palette.ink}
              strokeWidth={2.5}
            />
            <Circle cx={179} cy={128} r={40} fill={ACID} opacity={0.18} />
            <Circle cx={179} cy={128} r={21} fill={ACID} opacity={0.35} />
            <Circle
              cx={179}
              cy={128}
              r={11}
              fill={ACID}
              stroke={INK}
              strokeWidth={3}
            />
          </Svg>
          <View style={[styles.mapTag, { backgroundColor: palette.card }]}>
            <Text style={[styles.mono, { color: palette.ink }]}>
              {radiusKm} km
            </Text>
            <Text style={[text(13, 'Bold', 1.2), { color: palette.ink }]}>
              {' '}
              · 0 bares
            </Text>
          </View>
        </View>
      </Card>
      <Animated.View entering={POP_FAST}>
        <Title
          lines={[['NENHUM BAR'], ['', 'NO SEU RAIO.']]}
          size={52}
          color={palette.ink}
          accentColor={dark ? ACID : palette.live}
        />
      </Animated.View>
      <Text style={[text(16, 'Regular', 1.45), { color: palette.muted }]}>
        Não achamos bares na Onside a até {radiusKm} km de você.
        {expansion.data?.bars ? ' Os mais perto ficam logo depois.' : ''}
      </Text>
      {expansion.data?.bars && where ? (
        <BlockButton
          leading="pin"
          label={
            refill.isPending
              ? 'Ampliando…'
              : `Ampliar para ${expansion.data.radiusKm} km · ${expansion.data.bars} ${expansion.data.bars === 1 ? 'bar' : 'bares'}`
          }
          onPress={() =>
            refill.mutate({
              where,
              radiusKm: expansion.data?.radiusKm ?? radiusKm
            })
          }
        />
      ) : null}
      <Card soft>
        <Row
          icon="search"
          title="Escolher outro bairro"
          sub="Para quando você vai sair de outro lugar"
          onPress={onPick}
        />
        <Row
          icon="bar"
          title="Indicar um bar daqui"
          sub="Mandamos o convite para ele entrar na Onside"
          onPress={invite}
        />
      </Card>
    </ScrollView>
  )
}

// --- Viu tudo (23j) ----------------------------------------------------------

function SeenAll({
  round,
  now,
  onReview
}: {
  round: Round
  now: number
  onReview: () => void
}) {
  const palette = usePalette()
  const router = useRouter()
  const dark = palette.dark
  const liked = round.items.filter((i) => i.decision === 'liked').length
  const passed = round.items.filter((i) => i.decision === 'passed').length
  return (
    <View style={[styles.endBody, { flex: 1, paddingBottom: 28, gap: 14 }]}>
      <Animated.View entering={POP} style={styles.fan}>
        {[-8, 8, 0].map((rot, i) => (
          <View
            key={rot}
            style={[
              styles.fanCard,
              {
                transform: [
                  { translateX: rot * 6 },
                  { translateY: i === 2 ? 0 : 30 },
                  { rotate: `${rot}deg` }
                ],
                backgroundColor: dark ? '#161613' : '#1c1c18'
              }
            ]}
          >
            <View style={[styles.band, { backgroundColor: ACID }]} />
            {i === 2 ? <Text style={styles.question}>?</Text> : null}
          </View>
        ))}
      </Animated.View>
      <NextRound at={round.nextRoundAt} now={now} />
      <Title
        lines={[['VOCÊ VIU'], ['', 'TODOS DE HOJE.']]}
        size={52}
        color={palette.ink}
        accentColor={dark ? ACID : palette.live}
      />
      <Text style={[text(16, 'Regular', 1.45), { color: palette.muted }]}>
        Não sobrou nenhum bar diferente para mostrar agora. Curtir, avaliar e ir
        aos jogos melhora a próxima rodada.
      </Text>
      <View style={{ flex: 1 }} />
      {liked ? (
        <PillButton
          label={`Ver ${liked === 1 ? 'o que' : `os ${liked} que`} você curtiu`}
          leading="fan"
          onPress={() =>
            router.navigate({
              pathname: '/favoritos',
              params: { aba: 'saved' }
            })
          }
        />
      ) : null}
      {passed ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onReview}>
          <Text
            style={[text(15, 'Bold'), styles.later, { color: palette.muted }]}
          >
            Rever os que você passou
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

// --- Sem localização (23k) ---------------------------------------------------

function Locate({
  center,
  picking,
  onPlace,
  onSettings
}: {
  center: Coordinates
  picking: boolean
  onPlace: (place: Place) => void
  onSettings: () => void
}) {
  const palette = usePalette()
  const scheme = useColorScheme()
  const dark = palette.dark
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const origin = searchCenter(null, city.data ?? center)
  const places = useQuery(trpc.recommendations.places.queryOptions(origin))
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const useDevice = async () => {
    setBusy(true)
    setError(null)
    try {
      const asked = await Location.requestForegroundPermissionsAsync()
      if (!asked.granted) {
        if (!asked.canAskAgain) onSettings()
        else setError('Sem permissão, escolha um bairro abaixo.')
        return
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      })
      haptic.success()
      onPlace({ lat: position.coords.latitude, lng: position.coords.longitude })
    } catch {
      setError('Não deu para achar você agora. Escolha um bairro.')
    } finally {
      setBusy(false)
    }
  }

  const search = async () => {
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      // O geocodificador do sistema: sem chave e sem servidor.
      const [hit] = await Location.geocodeAsync(
        city.data ? `${q}, ${city.data.name} - ${city.data.uf}` : q
      )
      if (!hit) setError('Não achamos esse lugar. Tente outro nome.')
      else onPlace({ lat: hit.latitude, lng: hit.longitude, name: q })
    } catch {
      setError('Não achamos esse lugar. Tente outro nome.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.endBody, { alignItems: 'stretch' }]}
      keyboardShouldPersistTaps="handled"
    >
      <Animated.View entering={POP_FAST} style={styles.rings}>
        <View style={[styles.ring1, { borderColor: palette.line }]} />
        <View style={[styles.ring2, { borderColor: palette.line }]} />
        <View style={styles.pinDisc}>
          <Icon name="pin" size={30} color={INK} accent={ACID} />
        </View>
      </Animated.View>
      <View style={{ alignItems: 'center' }}>
        <Title
          lines={[['ONDE VOCÊ ', 'ESTÁ?']]}
          size={50}
          color={palette.ink}
          accentColor={dark ? ACID : palette.live}
        />
      </View>
      <Text
        style={[
          text(16, 'Regular', 1.45),
          { color: palette.muted, textAlign: 'center' }
        ]}
      >
        Sem a sua localização, não dá para saber o que é perto. Ela só é usada
        enquanto o app está aberto.
      </Text>
      {picking ? null : (
        <BlockButton
          label={busy ? 'Procurando…' : 'Usar minha localização'}
          leading="pin"
          onPress={useDevice}
        />
      )}
      <View style={styles.or}>
        <View style={[styles.orLine, { backgroundColor: palette.line }]} />
        <Text style={[text(14), { color: palette.muted }]}>
          {picking ? 'escolha um bairro' : 'ou escolha um bairro'}
        </Text>
        <View style={[styles.orLine, { backgroundColor: palette.line }]} />
      </View>
      <View
        style={[
          styles.field,
          { backgroundColor: dark ? '#1c1c18' : '#fffdf8' }
        ]}
      >
        <Icon name="search" size={20} color={palette.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={search}
          returnKeyType="search"
          placeholder="Bairro ou endereço"
          placeholderTextColor={palette.muted}
          keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
          style={[
            text(16, 'Regular', 1.2),
            styles.input,
            { color: palette.ink }
          ]}
        />
      </View>
      <ErrorText style={[text(13.5), { color: palette.live }]}>
        {error}
      </ErrorText>
      <View style={styles.chipsWrap}>
        {(places.data ?? []).map((p) => (
          <ScalePress
            key={p.name}
            accessibilityRole="button"
            onPress={() => {
              haptic.select()
              onPlace({ lat: p.lat, lng: p.lng, name: p.name })
            }}
            style={[
              styles.hood,
              {
                borderColor: palette.line,
                backgroundColor: dark ? '#1c1c18' : '#ebe7de'
              }
            ]}
          >
            <Text style={[text(15, 'Bold', 1.2), { color: palette.ink }]}>
              {p.name}
            </Text>
          </ScalePress>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    zIndex: 20
  },
  closeOnly: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: 'flex-start'
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginVertical: -6
  },
  deckArea: {
    height: CARD_H + 24,
    width: CARD_W,
    alignSelf: 'center',
    zIndex: 10
  },
  controls: { flex: 1, justifyContent: 'flex-end', gap: 14, zIndex: 20 },
  matchBody: { flex: 1, paddingHorizontal: 16, gap: 20 },
  pair: {
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -20
  },
  meRing: {
    position: 'absolute',
    left: 33,
    top: 21,
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 3,
    borderColor: ACID
  },
  me: {
    position: 'absolute',
    left: 36,
    top: 24,
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 6,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 }
  },
  meText: {
    fontFamily: 'Anton',
    fontSize: 60,
    color: INK,
    marginVertical: -16
  },
  them: {
    position: 'absolute',
    right: 36,
    top: 18,
    width: 158,
    height: 158,
    borderRadius: 79,
    borderWidth: 3,
    backgroundColor: '#2a2a25',
    overflow: 'hidden'
  },
  themPhoto: { width: 158, height: 158 },
  heart: {
    position: 'absolute',
    left: 156,
    top: 76,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ticketShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    borderRadius: 6
  },
  ticket: { borderRadius: 6, overflow: 'hidden' },
  ticketTop: { flexDirection: 'row', padding: 16, gap: 10 },
  ticketTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginTop: 2
  },
  ticketTime: { fontFamily: 'Anton', fontSize: 34 },
  cut: { height: 18, justifyContent: 'center' },
  hole: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  face: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2
  },
  later: { textAlign: 'center', paddingVertical: 6 },
  matchButtons: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  ghost: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  switch: { width: 50, height: 28, borderRadius: 14, padding: 3 },
  knob: { width: 22, height: 22, borderRadius: 11 },
  endBody: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 18 },
  strip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 10
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    overflow: 'hidden'
  },
  rows: { borderTopWidth: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1
  },
  mapBox: { height: 250, overflow: 'hidden', borderRadius: 6 },
  mapTag: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  fan: { height: 310, alignItems: 'center', justifyContent: 'center' },
  fanCard: {
    position: 'absolute',
    width: 220,
    height: 300,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.12)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40
  },
  band: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: 120,
    height: 50,
    transform: [{ rotate: '-20deg' }]
  },
  question: {
    fontFamily: 'Anton',
    fontSize: 44,
    color: 'rgba(241,238,230,.18)'
  },
  rings: {
    height: 170,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ring1: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5
  },
  ring2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5
  },
  pinDisc: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    shadowColor: INK,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  input: { flex: 1, height: 52 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hood: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center'
  }
})
