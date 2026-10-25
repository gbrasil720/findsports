import {
  type ActionPhase,
  actionPhase
} from '@findsports_oficial/api/lib/transient-error'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { type ReactNode, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line } from 'react-native-svg'
import { Card } from '@/components/card'
import { HardShadow } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import {
  AddButton,
  Avatar,
  useFriendActions,
  useKept
} from '@/components/friends'
import { MedalImage } from '@/components/medal'
import {
  haptic,
  LABEL_IN,
  ScalePress,
  SWAP,
  usePress,
  usePressScale
} from '@/components/motion'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  ErrorState,
  errorMessage,
  GlassRound,
  HOT,
  Icon,
  INK,
  LIVE,
  MAX_FONT_SCALE,
  MUTED,
  PAPER,
  phaseLabel,
  SPARK,
  Text,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import {
  type Achievement,
  nextInSeries,
  progressShare,
  unit
} from '@/lib/achievements'
import { firstName, formatTime, searchCenter, teamMark } from '@/lib/explore'
import { formatCode } from '@/lib/my-games'
import {
  buildNotices,
  type CallNotice,
  callLine,
  type FriendNotice,
  inTab,
  type Notice,
  type NoticeTab,
  noticeSections,
  noticeTime,
  startsIn,
  todayGoing
} from '@/lib/notices'
import { type NearBar, sides } from '@/lib/search'
import { trpc } from '@/lib/trpc'

/*
 * Avisos (19c/19h do design). No topo, o jogo marcado para hoje, com o
 * código e os amigos que vão. Embaixo, os avisos montados do que já existe
 * (`lib/notices.ts`): oferta liberada, jogo dos seus times perto, conquista
 * desbloqueada e, dos amigos, pedido recebido (com Aceitar e Recusar) e
 * pedido aceito, e o chamado de amigo (Rodada 24, com "Vou também" e "Agora
 * não"). As abas são as do design, Tudo, Jogos e Amigos; conquista
 * fica em Tudo. Ranking e comunidades ainda não existem. "Lido" fica no
 * aparelho.
 */

const READ_KEY = 'onside.avisos-lidos'
type Answered = 'friends' | 'declined'
type CallAnswered = { status: 'going' | 'not_now'; code: string | null }

export default function Notices() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  const state = useExploreState()
  useStatusBar('auto')
  const [tab, setTab] = useState<NoticeTab>('all')
  const [read, setRead] = useState<string[]>([])
  useEffect(() => {
    SecureStore.getItemAsync(READ_KEY)
      .then((raw) => raw && setRead(JSON.parse(raw)))
      .catch(() => {})
  }, [])

  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const medals = useQuery(trpc.achievements.mine.queryOptions())
  const teams = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const friendNotices = useQuery(trpc.friends.notices.queryOptions())
  // Pedido respondido continua na tela, com a resposta, até ela abrir de novo.
  const requests = useKept(friendNotices.data?.requests)
  const [answered, setAnswered] = useState<Record<string, Answered>>({})
  const actions = useFriendActions()
  const respond = (person: FriendNotice, accept: boolean) =>
    actions.respond.mutate(
      { userId: person.id, accept },
      {
        onSuccess: () =>
          setAnswered((all) => ({
            ...all,
            [person.id]: accept ? 'friends' : 'declined'
          }))
      }
    )
  // Chamado de amigo: a resposta troca o card na hora e fica até reabrir.
  const queryClient = useQueryClient()
  const calls = useKept(friendNotices.data?.calls)
  const [callAnswers, setCallAnswers] = useState<Record<string, CallAnswered>>(
    {}
  )
  const answerCall = useMutation(
    trpc.friends.respondCall.mutationOptions({
      onSuccess: (result, input) => {
        if (result.status === 'going') haptic.success()
        else haptic.select()
        setCallAnswers((all) => ({
          ...all,
          [input.callId]: { status: result.status, code: result.code }
        }))
        // O jogo marcado entra no cartão de hoje e em Meus jogos.
        queryClient.invalidateQueries({
          queryKey: trpc.attendance.pathKey()
        })
      },
      onError: (error) => {
        haptic.error()
        Alert.alert(
          'Não deu certo',
          errorMessage(error, 'Tente de novo em instantes.')
        )
      }
    })
  )
  // Avisar e Lembrar, de "Bares pra você" (WEB-425).
  const asked = useQuery(trpc.recommendations.notices.queryOptions())
  const center = searchCenter(state.device, city.data)
  const teamIds = (teams.data ?? []).map((t) => t.id)
  const teamBars = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm: 10,
      teamIds,
      limit: 50
    }),
    enabled: teamIds.length > 0
  })
  const now = Date.now()
  const list = medals.data?.achievements ?? []
  const notices = buildNotices(
    {
      mine: mine.data ?? [],
      medals: list,
      teamBars: (teamBars.data?.bars ?? []) as NearBar[],
      sides,
      friends: {
        requests,
        accepted: friendNotices.data?.accepted ?? [],
        calls: calls.map((call) => ({
          ...call,
          status: callAnswers[call.id]?.status ?? call.status
        })),
        callsAccepted: friendNotices.data?.callsAccepted
      },
      alerts: asked.data?.alerts,
      reminders: asked.data?.reminders
    },
    now
  )
  const shown = notices.filter((n) => inTab(n, tab))
  // O que cada botão de resposta conta enquanto tenta (WEB-460).
  const callPhase = actionPhase([answerCall])
  const respondPhase = actionPhase([actions.respond])
  const sources = [mine, medals, friendNotices, asked]
  const failed = sources.find((q) => q.isError)
  const unread = notices.filter((n) => !read.includes(n.id))
  const markAll = () => {
    haptic.select()
    const next = [...new Set([...read, ...notices.map((n) => n.id)])].slice(
      -200
    )
    setRead(next)
    SecureStore.setItemAsync(READ_KEY, JSON.stringify(next)).catch(() => {})
  }

  // O jogo marcado para hoje que ainda não acabou: o cartão do topo.
  const today = (mine.data ?? [])
    .filter((g) => !g.ended && brasiliaDay(g.startsAt) === brasiliaDay(now))
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0]

  const open = (notice: Notice) => {
    if (notice.kind === 'offer') router.push(`/codigo/${notice.eventId}`)
    else if (notice.kind === 'medal')
      router.push(`/conquista/${notice.medalId}` as Href)
    else if (
      notice.kind === 'friend-request' ||
      notice.kind === 'friend-accepted'
    )
      router.push(`/amigo/${notice.person.id}` as Href)
    else if (notice.kind === 'call')
      router.push(`/bar/${notice.call.barId}` as Href)
    else if (notice.kind === 'call-accepted')
      router.push(`/amigo/${notice.call.person.id}` as Href)
    else if (notice.kind === 'alert')
      router.push(`/bar/${notice.barId}` as Href)
    else if (notice.kind === 'reminder')
      router.push({
        pathname: '/vou/[barId]',
        params: { barId: notice.barId, eventId: notice.eventId }
      } as Href)
    else router.push({ pathname: '/busca', params: { q: notice.title } })
  }

  const pull = usePullRefresh(() =>
    Promise.all([
      mine.refetch(),
      medals.refetch(),
      teamBars.refetch(),
      friendNotices.refetch(),
      asked.refetch()
    ])
  )

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            onPress={() => router.back()}
          >
            <GlassRound>
              <Icon name="back" size={16} color={palette.ink} />
            </GlassRound>
          </Pressable>
          <Text style={[styles.title, { color: palette.ink }]}>Avisos</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajustes dos avisos"
            hitSlop={8}
            onPress={() =>
              router.push({
                pathname: '/configuracoes',
                params: { aba: 'avisos' }
              })
            }
          >
            <GlassRound>
              <Icon name="gear" size={18} color={palette.ink} />
            </GlassRound>
          </Pressable>
        </View>

        {today ? (
          <ScalePress
            accessibilityRole="button"
            to={0.985}
            onPress={() =>
              today.code
                ? router.push(`/codigo/${today.eventId}`)
                : router.push(`/bar/${today.barId}` as Href)
            }
          >
            <TodayCard game={today} now={now} />
          </ScalePress>
        ) : null}

        <View style={styles.tabsRow}>
          <View style={styles.tabs}>
            {(
              [
                ['all', `Tudo${unread.length ? ` · ${unread.length}` : ''}`],
                ['games', 'Jogos'],
                ['friends', 'Amigos']
              ] as const
            ).map(([key, label]) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityState={{ selected: tab === key }}
                onPress={() => {
                  haptic.select()
                  setTab(key)
                }}
                style={[
                  styles.tab,
                  tab === key
                    ? styles.tabOn
                    : { borderColor: palette.line, borderWidth: 1 }
                ]}
              >
                <Text
                  style={[
                    text(13, 'SemiBold', 1.2),
                    { color: tab === key ? INK : palette.ink }
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {unread.length ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={markAll}>
              <Text style={[text(13, 'Bold'), { color: HOT }]}>Ler tudo</Text>
            </Pressable>
          ) : null}
        </View>

        {/* O que não abriu não vira "nada por aqui" (WEB-460). */}
        {failed && !mine.isPending && !medals.isPending ? (
          <ErrorState
            style={{ gap: 14 }}
            title="Não deu para abrir todos os avisos."
            error={failed.error}
            onRetry={() => {
              for (const q of sources) if (q.isError) q.refetch()
            }}
            retrying={sources.some((q) => q.isFetching)}
          />
        ) : null}
        {mine.isPending || medals.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 24 }} />
        ) : shown.length ? (
          noticeSections(shown, now).map((section) => {
            const fresh = section.items.filter((n) => !read.includes(n.id))
            return (
              <View key={section.key} style={{ gap: 12 }}>
                <View style={styles.sectionHead}>
                  <Text style={[styles.section, { color: HOT }]}>
                    {section.title}
                  </Text>
                  {fresh.length ? (
                    <Text style={[text(12.5), { color: palette.muted }]}>
                      {fresh.length} {fresh.length === 1 ? 'novo' : 'novos'}
                    </Text>
                  ) : null}
                </View>
                {section.items.map((notice) =>
                  // O pedido e o chamado têm botões dentro: o cartão não vira
                  // um botão só (o leitor de tela não chegaria a eles); a
                  // linha de cima abre o perfil ou o bar.
                  notice.kind === 'call' || notice.kind === 'call-accepted' ? (
                    <CallCard
                      key={notice.id}
                      notice={notice}
                      unread={!read.includes(notice.id)}
                      now={now}
                      code={
                        callAnswers[notice.call.id]?.code ??
                        mine.data?.find(
                          (g) => g.eventId === notice.call.eventId
                        )?.code ??
                        null
                      }
                      busy={answerCall.isPending}
                      phase={
                        answerCall.variables?.callId === notice.call.id
                          ? callPhase
                          : 'idle'
                      }
                      sent={answerCall.variables?.answer}
                      onOpen={() => open(notice)}
                      onAnswer={(answer) =>
                        answerCall.mutate({ callId: notice.call.id, answer })
                      }
                      onCode={() =>
                        router.push(`/codigo/${notice.call.eventId}`)
                      }
                    />
                  ) : notice.kind === 'friend-request' ? (
                    <NoticeCard
                      key={notice.id}
                      notice={notice}
                      medals={list}
                      unread={!read.includes(notice.id)}
                      now={now}
                      onOpen={() => open(notice)}
                      answer={
                        <RequestAnswer
                          answered={answered[notice.person.id]}
                          busy={actions.busy}
                          phase={
                            actions.respond.variables?.userId ===
                            notice.person.id
                              ? respondPhase
                              : 'idle'
                          }
                          sent={actions.respond.variables?.accept}
                          onAnswer={(accept) => respond(notice.person, accept)}
                        />
                      }
                    />
                  ) : (
                    <ScalePress
                      key={notice.id}
                      to={0.985}
                      accessibilityRole="button"
                      onPress={() => open(notice)}
                    >
                      <NoticeCard
                        notice={notice}
                        medals={list}
                        unread={!read.includes(notice.id)}
                        now={now}
                      />
                    </ScalePress>
                  )
                )}
              </View>
            )
          })
        ) : failed ? null : (
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            {tab === 'friends'
              ? 'Nada dos amigos por aqui. Pedidos de amizade, pedidos aceitos e chamados para jogos aparecem aqui.'
              : 'Nada por aqui ainda. Os avisos chegam quando um bar valida seu código, quando sai uma conquista, quando um bar perto marca jogo dos seus times ou quando alguém te pede amizade.'}
          </Text>
        )}

        {shown.length ? (
          <Text style={[text(13), styles.foot, { color: palette.muted }]}>
            Avisos com mais de 30 dias saem daqui.
          </Text>
        ) : null}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

function TodayCard({
  game,
  now
}: {
  game: {
    barId: string
    barName: string
    startsAt: string
    code: string | null
    participants: string[]
    participantFreeText: string | null
    championship: string
  }
  now: number
}) {
  const palette = usePalette()
  const going = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: game.barId }),
    select: (bar) =>
      bar.events.find((e) => e.startsAt === game.startsAt)?.going ?? null
  })
  const who = todayGoing(going.data ?? null)
  const wait = startsIn(game.startsAt, now)
  // O design inverte o ingresso no escuro: papel com tinta, e o vermelho
  // no lugar do acid (19h).
  const dark = palette.dark
  const fg = dark ? INK : PAPER
  const muted = dark ? MUTED : '#aaa9a4'
  return (
    <View>
      <View style={[styles.todayShadow, { backgroundColor: ACID }]} />
      <View style={[styles.today, { backgroundColor: dark ? PAPER : INK }]}>
        <View style={styles.todayTop}>
          <View style={{ flex: 1 }}>
            <Text
              style={[text(12.5, 'Bold'), { color: dark ? '#c92b0c' : ACID }]}
            >
              Seu jogo de hoje
            </Text>
            <Text style={[styles.todayTitle, { color: fg }]} numberOfLines={2}>
              {gameTitle(game)}
            </Text>
            <Text style={[text(12.5), { color: muted }]}>
              {game.barName} · {formatTime(game.startsAt)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[text(11.5), { color: muted }]}>
              {wait ? 'começa em' : 'rolando'}
            </Text>
            <Text style={[styles.countdown, { color: fg }]}>
              {wait ?? 'agora'}
            </Text>
          </View>
        </View>
        <View style={styles.cut}>
          <View
            style={[styles.hole, { left: -9, backgroundColor: palette.bg }]}
          />
          {/* Borda tracejada de um lado só não aparece no iOS: SVG. */}
          <Svg height={2} style={styles.dash}>
            <Line
              x1={0}
              y1={1}
              x2="100%"
              y2={1}
              stroke={dark ? 'rgba(18,18,15,.18)' : 'rgba(241,238,230,.16)'}
              strokeWidth={1.5}
              strokeDasharray="5,5"
            />
          </Svg>
          <View
            style={[styles.hole, { right: -9, backgroundColor: palette.bg }]}
          />
        </View>
        <View style={styles.todayFoot}>
          <View style={styles.who}>
            {who.faces.length || who.more ? (
              <Stack
                faces={who.faces}
                more={who.more}
                size={28}
                ring={dark ? PAPER : INK}
              />
            ) : null}
            <Text
              style={[text(12.5), { color: fg, flex: 1 }]}
              numberOfLines={2}
            >
              {who.bold ? (
                <Text style={{ fontFamily: 'Archivo-Bold' }}>{who.bold}</Text>
              ) : null}
              {who.rest}
            </Text>
          </View>
          {game.code ? (
            <Text style={[styles.code, { color: fg }]}>
              {formatCode(game.code)}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function NoticeCard({
  notice,
  medals,
  unread,
  now,
  answer,
  onOpen
}: {
  notice: Notice
  medals: Achievement[]
  unread: boolean
  now: number
  /** Aceitar e Recusar, só no pedido recebido. */
  answer?: ReactNode
  /** O pedido abre o perfil pela linha de cima (os botões ficam fora). */
  onOpen?: () => void
}) {
  const palette = usePalette()
  const time = (
    <View style={styles.time}>
      {unread ? <View style={styles.dot} /> : null}
      {/* No jogo, a hora já está na linha de baixo. */}
      {notice.kind === 'game' ? null : (
        <Text style={[styles.mono11, { color: palette.muted }]}>
          {noticeTime(notice.at, now)}
        </Text>
      )}
    </View>
  )
  if (notice.kind === 'offer')
    return (
      <Card soft>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.stub}>
            <Icon name="ticket" size={26} color={INK} accent={INK} />
            <Svg width={2} style={styles.stubCut}>
              <Line
                x1={1}
                y1={0}
                x2={1}
                y2="100%"
                stroke="rgba(18,18,15,.3)"
                strokeWidth={2}
                strokeDasharray="4,4"
              />
            </Svg>
          </View>
          <View style={styles.offerBody}>
            <View style={styles.rowBetween}>
              <Text style={[text(14.5, 'Bold'), { color: palette.ink }]}>
                Oferta liberada
              </Text>
              {time}
            </View>
            <Text
              style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
            >
              {notice.barName} validou seu código. {notice.offer}
            </Text>
          </View>
        </View>
      </Card>
    )
  if (notice.kind === 'game')
    return (
      <Card soft>
        <View style={styles.gameRow}>
          {notice.sides ? (
            <View style={{ flexDirection: 'row' }}>
              {notice.sides.map((name, i) => (
                <View
                  key={name}
                  style={[
                    styles.mark,
                    { backgroundColor: palette.mark, marginLeft: i ? -10 : 0 }
                  ]}
                >
                  <Text style={[styles.markText, { color: palette.ink }]}>
                    {teamMark(name)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}>
              {notice.title} confirmado
            </Text>
            <Text style={[text(12.5), { color: palette.muted }]}>
              {notice.bars}{' '}
              {notice.bars === 1 ? 'bar perto vai' : 'bares perto vão'} passar ·{' '}
              {formatTime(notice.at)}
            </Text>
          </View>
          {time}
        </View>
      </Card>
    )
  if (notice.kind === 'friend-request' || notice.kind === 'friend-accepted') {
    const { person } = notice
    return (
      <Card soft>
        <View style={styles.friendCard}>
          <ScalePress
            to={0.98}
            accessibilityRole={onOpen ? 'button' : undefined}
            disabled={!onOpen}
            onPress={onOpen}
            style={styles.gameRow0}
          >
            <Avatar
              id={person.id}
              name={person.name}
              image={person.image}
              size={50}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* Sem corte: com nome longo, "pediu sua amizade" sumiria. */}
              <Text style={[text(15, 'Bold', 1.3), { color: palette.ink }]}>
                {notice.kind === 'friend-request'
                  ? `${person.name} pediu sua amizade`
                  : `${person.name} aceitou seu pedido`}
              </Text>
              {person.mutual ? (
                <View style={styles.mutual}>
                  <Stack
                    faces={person.mutualInitials}
                    more={0}
                    size={22}
                    ring={palette.card}
                    tones
                  />
                  <Text style={[text(12), { color: palette.muted }]}>
                    {person.mutual} {person.mutual === 1 ? 'amigo' : 'amigos'}{' '}
                    em comum
                  </Text>
                </View>
              ) : null}
            </View>
            {time}
          </ScalePress>
          {answer}
        </View>
      </Card>
    )
  }
  if (notice.kind === 'alert' || notice.kind === 'reminder')
    return (
      <Card soft>
        <View style={styles.gameRow}>
          <View style={[styles.mark, { backgroundColor: palette.mark }]}>
            <Icon
              name={notice.kind === 'alert' ? 'bell' : 'calendar'}
              size={20}
              color={palette.ink}
              accent={palette.dark ? ACID : LIVE}
            />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}>
              {notice.kind === 'alert'
                ? `${notice.barName} marcou jogo`
                : `Hoje: ${notice.title}`}
            </Text>
            <Text style={[text(12.5), { color: palette.muted }]}>
              {notice.kind === 'alert'
                ? `${notice.title} · ${noticeTime(notice.startsAt, now)} ${formatTime(notice.startsAt)}`
                : `${notice.barName} · ${formatTime(notice.at)}`}
            </Text>
          </View>
          {time}
        </View>
      </Card>
    )
  // O chamado tem o próprio cartão (`CallCard`).
  if (notice.kind !== 'medal') return null
  const medal = medals.find((a) => a.id === notice.medalId)
  if (!medal) return null
  const next = nextInSeries(medals, medal)
  return (
    <Card
      soft
      shadow={palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'}
      offset={5}
    >
      <View style={styles.medalRow}>
        <MedalImage id={medal.id} size={72} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rowBetween}>
            <Text style={[text(12, 'Bold'), { color: HOT }]}>
              Conquista desbloqueada
            </Text>
            {time}
          </View>
          <Text style={[styles.medalName, { color: palette.ink }]}>
            {medal.name}
          </Text>
          <Text style={[text(12.5), { color: palette.muted }]}>
            {medal.group === 'resenhas'
              ? unit('resenhas', medal.target)
              : `${unit(medal.group, medal.target)} diferentes`}
          </Text>
          {next ? (
            <>
              <View style={[styles.track, { backgroundColor: palette.mark }]}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${progressShare(next) * 100}%`,
                      backgroundColor: palette.dark ? ACID : INK
                    }
                  ]}
                />
              </View>
              <Text style={[text(12), { color: palette.muted }]}>
                Próxima: {unit(next.group, next.target)} ·{' '}
                {Math.min(next.progress, next.target)}/{next.target}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </Card>
  )
}

/** Aceitar e Recusar do pedido (19c); respondido, a resposta no lugar. */
function RequestAnswer({
  answered,
  busy,
  phase,
  sent,
  onAnswer
}: {
  answered?: Answered
  busy: boolean
  phase: ActionPhase
  /** A resposta que está no ar: aceitar (`true`) ou recusar. */
  sent?: boolean
  onAnswer: (accept: boolean) => void
}) {
  const label = (accept: boolean, idle: string) =>
    phaseLabel(sent === accept ? phase : 'idle', { idle, sending: idle })
  const palette = usePalette()
  const accept = usePress(3, 3)
  const decline = usePressScale(0.97)
  if (answered)
    return (
      <Animated.View entering={SWAP} style={styles.answered}>
        {answered === 'friends' ? (
          <AddButton relation="friends" onPress={() => {}} />
        ) : (
          <Text style={[text(13, 'Bold'), { color: palette.muted }]}>
            Recusado
          </Text>
        )}
      </Animated.View>
    )
  return (
    <View style={styles.answers}>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPressIn={accept.onPressIn}
        onPressOut={accept.onPressOut}
        onPress={() => onAnswer(true)}
        style={{ flex: 1 }}
      >
        {/* A sombra dura fica parada e o botão afunda sobre ela. */}
        <HardShadow color={palette.dark ? '#000' : INK} offset={3} radius={4} />
        <Animated.View
          style={[styles.answer, { backgroundColor: ACID }, accept.style]}
        >
          <ButtonLabel color={INK}>{label(true, 'Aceitar')}</ButtonLabel>
        </Animated.View>
      </Pressable>
      <Animated.View style={[{ flex: 1 }, decline.style]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPressIn={decline.onPressIn}
          onPressOut={decline.onPressOut}
          onPress={() => onAnswer(false)}
          style={[
            styles.answer,
            {
              borderWidth: 1,
              borderColor: palette.dark
                ? 'rgba(241,238,230,.22)'
                : 'rgba(18,18,15,.18)'
            }
          ]}
        >
          <ButtonLabel color={palette.ink}>
            {label(false, 'Recusar')}
          </ButtonLabel>
        </Pressable>
      </Animated.View>
    </View>
  )
}

/**
 * O "Chamado de amigo" (Rodada 24): RECEBIDO com "Vou também" e "Agora não"
 * e sombra acid; ACEITO com a faixa acid e o código; AGORA NÃO com a frase.
 * Para quem chamou, o mesmo topo com "Marina vai também".
 */
function CallCard({
  notice,
  unread,
  now,
  code,
  busy,
  phase,
  sent,
  onOpen,
  onAnswer,
  onCode
}: {
  notice: Extract<Notice, { kind: 'call' | 'call-accepted' }>
  unread: boolean
  now: number
  /** O código do balcão de quem disse "Vou também", se o bar emite. */
  code: string | null
  busy: boolean
  phase: ActionPhase
  /** A resposta que está no ar ou falhou. */
  sent?: 'going' | 'not_now'
  onOpen: () => void
  onAnswer: (answer: 'going' | 'not_now') => void
  onCode: () => void
}) {
  const palette = usePalette()
  const { call } = notice
  const first = firstName(call.person.name)
  const pending = notice.kind === 'call' && call.status === 'pending'
  return (
    <Card
      soft
      shadow={
        pending
          ? palette.dark
            ? 'rgba(201,241,53,.22)'
            : 'rgba(201,241,53,.85)'
          : palette.dark
            ? 'rgba(0,0,0,.6)'
            : palette.shadow
      }
      offset={pending ? 5 : 4}
    >
      <View style={styles.callCard}>
        <ScalePress
          to={0.98}
          accessibilityRole="button"
          onPress={onOpen}
          style={styles.gameRow0}
        >
          <Avatar
            id={call.person.id}
            name={call.person.name}
            image={call.person.image}
            size={44}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}>
              {notice.kind === 'call'
                ? `${first} te chamou pro jogo`
                : `${first} vai também`}
            </Text>
            <Text
              style={[text(12.5, 'Regular', 1.25), { color: palette.muted }]}
            >
              {callLine(call, now)}
            </Text>
          </View>
          <View style={styles.time}>
            {unread ? <View style={styles.dot} /> : null}
            <Text style={[styles.mono11, { color: palette.muted }]}>
              {noticeTime(notice.at, now)}
            </Text>
          </View>
        </ScalePress>
        {notice.kind === 'call' ? (
          <CallAnswer
            call={call}
            code={code}
            busy={busy}
            phase={phase}
            sent={sent}
            onAnswer={onAnswer}
            onCode={onCode}
          />
        ) : null}
      </View>
    </Card>
  )
}

/**
 * Os três estados de baixo do chamado; a troca entra com `SWAP`. O design diz
 * "o Gabriel foi avisado": sem saber o gênero de quem chamou, a frase vai sem
 * artigo nem particípio.
 */
function CallAnswer({
  call,
  code,
  busy,
  phase,
  sent,
  onAnswer,
  onCode
}: {
  call: CallNotice
  code: string | null
  busy: boolean
  phase: ActionPhase
  sent?: 'going' | 'not_now'
  onAnswer: (answer: 'going' | 'not_now') => void
  onCode: () => void
}) {
  const palette = usePalette()
  const going = usePress(3, 3)
  const later = usePressScale(0.97)
  const strip = usePressScale(0.98)
  const first = firstName(call.person.name)
  // Só o botão tocado conta a nova tentativa; o rótulo troca no lugar.
  const label = (answer: 'going' | 'not_now', idle: string) =>
    phaseLabel(sent === answer ? phase : 'idle', { idle, sending: idle })
  if (call.status === 'going')
    return (
      <Animated.View entering={SWAP} style={strip.style}>
        <Pressable
          accessibilityRole={code ? 'button' : undefined}
          accessibilityHint={code ? 'Abre o código do balcão' : undefined}
          disabled={!code}
          onPressIn={strip.onPressIn}
          onPressOut={strip.onPressOut}
          onPress={onCode}
          style={[
            styles.going,
            {
              backgroundColor: palette.dark
                ? 'rgba(201,241,53,.14)'
                : 'rgba(201,241,53,.4)'
            }
          ]}
        >
          <Icon name="check" size={15} color={palette.ink} />
          <Text
            style={[text(13, 'SemiBold', 1.3), { flex: 1, color: palette.ink }]}
          >
            Você vai · {first} recebeu o aviso
          </Text>
          {code ? (
            <Text style={[styles.callCode, { color: palette.ink }]}>
              {formatCode(code)}
            </Text>
          ) : null}
        </Pressable>
      </Animated.View>
    )
  if (call.status === 'not_now')
    return (
      <Animated.Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        entering={SWAP}
        style={[
          text(12.5, 'Regular', 1.4),
          styles.notNow,
          { color: palette.muted }
        ]}
      >
        Você respondeu “agora não”. {first} não recebe aviso disso.
      </Animated.Text>
    )
  return (
    <View style={styles.callAnswers}>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPressIn={going.onPressIn}
        onPressOut={going.onPressOut}
        onPress={() => onAnswer('going')}
        style={{ flex: 1.4 }}
      >
        <HardShadow color={palette.dark ? '#000' : INK} offset={3} radius={4} />
        <Animated.View style={[styles.answer, styles.goingButton, going.style]}>
          <Icon name="ticket" size={15} color={INK} accent={INK} />
          <ButtonLabel color={INK}>{label('going', 'Vou também')}</ButtonLabel>
        </Animated.View>
      </Pressable>
      <Animated.View style={[{ flex: 1 }, later.style]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPressIn={later.onPressIn}
          onPressOut={later.onPressOut}
          onPress={() => onAnswer('not_now')}
          style={[
            styles.answer,
            {
              borderWidth: 1,
              borderColor: palette.dark
                ? 'rgba(241,238,230,.22)'
                : 'rgba(18,18,15,.10)'
            }
          ]}
        >
          <ButtonLabel color={palette.ink}>
            {label('not_now', 'Agora não')}
          </ButtonLabel>
        </Pressable>
      </Animated.View>
    </View>
  )
}

/**
 * A pilha de iniciais do design (`stackAv`): no rodapé do jogo de hoje, os
 * amigos em acid e vermelho e o "+32"; nos amigos em comum, acid e pedra.
 */
function Stack({
  faces,
  more,
  size,
  ring,
  tones
}: {
  faces: string[]
  more: number
  size: number
  ring: string
  /** Amigos em comum: acid, pedra, acid. */
  tones?: boolean
}) {
  const items = [
    ...faces.map((label, index) => ({
      key: `face${index}`,
      label,
      bg: tones ? (index === 1 ? '#e7e3db' : ACID) : index ? LIVE : ACID,
      fg: tones || !index ? INK : PAPER
    })),
    ...(more > 0
      ? [
          {
            key: 'more',
            label: `+${more.toLocaleString('pt-BR')}`,
            bg: ring === INK ? PAPER : INK,
            fg: ring === INK ? INK : PAPER
          }
        ]
      : [])
  ]
  return (
    <View style={{ flexDirection: 'row' }}>
      {items.map(({ key, label, bg, fg }, index) => (
        <View
          key={key}
          style={{
            // "+1.282" cresce para o lado em vez de cortar.
            minWidth: size,
            height: size,
            paddingHorizontal: 3,
            borderRadius: size / 2,
            marginLeft: index ? -8 : 0,
            backgroundColor: bg,
            borderWidth: 2,
            borderColor: ring,
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Text
            style={[text(Math.round(size * 0.38), 'Bold', 1.1), { color: fg }]}
            maxFontSizeMultiplier={1}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flex: 1,
    fontFamily: 'Anton',
    fontSize: 38,
    textTransform: 'uppercase',
    letterSpacing: -0.76
  },
  todayShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    borderRadius: 7
  },
  today: { borderRadius: 7, overflow: 'hidden' },
  todayTop: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10
  },
  todayTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginTop: 2
  },
  countdown: { fontFamily: 'Anton', fontSize: 40 },
  cut: { height: 18, justifyContent: 'center' },
  hole: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9
  },
  dash: { marginHorizontal: 14 },
  todayFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 16
  },
  code: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 15,
    letterSpacing: 0.9
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4
  },
  tabs: { flexDirection: 'row', gap: 6 },
  tab: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 5,
    justifyContent: 'center'
  },
  tabOn: {
    backgroundColor: ACID,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: -4
  },
  section: { fontFamily: 'Anton', fontSize: 24, textTransform: 'uppercase' },
  time: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: SPARK },
  mono11: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 },
  stub: {
    width: 62,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stubCut: { position: 'absolute', top: 0, bottom: 0, right: -1 },
  offerBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8
  },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(18,18,15,.08)'
  },
  markText: { fontFamily: 'Anton', fontSize: 15 },
  friendCard: { padding: 14, gap: 12 },
  gameRow0: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mutual: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  answers: { flexDirection: 'row', gap: 8 },
  answer: {
    height: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  answered: { height: 40, justifyContent: 'center' },
  callCard: { padding: 14 },
  callAnswers: { flexDirection: 'row', gap: 8, marginTop: 12 },
  goingButton: { flexDirection: 'row', gap: 6, backgroundColor: ACID },
  going: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 5
  },
  callCode: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 0.52
  },
  notNow: { marginTop: 10 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  medalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14
  },
  medalName: {
    fontFamily: 'Anton',
    fontSize: 24,
    textTransform: 'uppercase',
    marginTop: 2
  },
  track: {
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 6,
    overflow: 'hidden'
  },
  fill: { height: 5, borderRadius: 3 },
  foot: { textAlign: 'center', marginTop: 8 }
})

/**
 * O rótulo dos botões de resposta: troca no lugar, subindo um pouco
 * ("Aceitar" → "Tentando de novo…"), e encolhe a fonte antes de cortar.
 */
function ButtonLabel({ color, children }: { color: string; children: string }) {
  return (
    <Animated.Text
      key={children}
      entering={LABEL_IN}
      maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[text(13.5, 'Bold'), { color, flexShrink: 1 }]}
    >
      {children}
    </Animated.Text>
  )
}
