import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { type ReactNode, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line } from 'react-native-svg'
import { Card } from '@/components/card'
import { type Palette, usePalette } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import {
  AddButton,
  Avatar,
  useFriendActions,
  useKept
} from '@/components/friends'
import { MedalImage } from '@/components/medal'
import { haptic, ScalePress, SWAP, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACID,
  GlassRound,
  HOT,
  Icon,
  INK,
  LIVE,
  MUTED,
  PAPER,
  SPARK,
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
import { formatTime, searchCenter, teamMark } from '@/lib/explore'
import { formatCode, gameTitle } from '@/lib/my-games'
import {
  buildNotices,
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
 * pedido aceito. As abas são as do design, Tudo, Jogos e Amigos; conquista
 * fica em Tudo. Ranking e comunidades ainda não existem. "Lido" fica no
 * aparelho.
 */

const READ_KEY = 'onside.avisos-lidos'
type Answered = 'friends' | 'declined'

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

  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const medals = useQuery(trpc.achievements.mine.queryOptions())
  const teams = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const friendNotices = useQuery({
    ...trpc.friends.notices.queryOptions(),
    meta: { errorToast: false }
  })
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
  const center = searchCenter(state.device, city.data)
  const teamIds = (teams.data ?? []).map((t) => t.id)
  const teamBars = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm: 10,
      teamIds,
      limit: 50
    }),
    enabled: teamIds.length > 0,
    meta: { errorToast: false }
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
        accepted: friendNotices.data?.accepted ?? []
      }
    },
    now
  )
  const shown = notices.filter((n) => inTab(n, tab))
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
    .filter(
      (g) =>
        !g.ended &&
        new Date(g.startsAt).toLocaleDateString('en-CA', {
          timeZone: 'America/Sao_Paulo'
        }) ===
          new Date(now).toLocaleDateString('en-CA', {
            timeZone: 'America/Sao_Paulo'
          })
    )
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
    else router.push({ pathname: '/busca', params: { q: notice.title } })
  }

  const pull = usePullRefresh(() =>
    Promise.all([
      mine.refetch(),
      medals.refetch(),
      teamBars.refetch(),
      friendNotices.refetch()
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
            <TodayCard palette={palette} game={today} now={now} />
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
                  // O pedido tem dois botões dentro: o cartão não vira um
                  // botão só (o leitor de tela não chegaria a eles); a linha
                  // de cima abre o perfil.
                  notice.kind === 'friend-request' ? (
                    <NoticeCard
                      key={notice.id}
                      palette={palette}
                      notice={notice}
                      medals={list}
                      unread={!read.includes(notice.id)}
                      now={now}
                      onOpen={() => open(notice)}
                      answer={
                        <RequestAnswer
                          palette={palette}
                          answered={answered[notice.person.id]}
                          busy={actions.busy}
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
                        palette={palette}
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
        ) : (
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            {tab === 'friends'
              ? 'Nada dos amigos por aqui. Pedidos de amizade e pedidos aceitos aparecem aqui.'
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
  palette,
  game,
  now
}: {
  palette: Palette
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
  const going = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: game.barId }),
    meta: { errorToast: false },
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
              numberOfLines={1}
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
  palette,
  notice,
  medals,
  unread,
  now,
  answer,
  onOpen
}: {
  palette: Palette
  notice: Notice
  medals: Achievement[]
  unread: boolean
  now: number
  /** Aceitar e Recusar, só no pedido recebido. */
  answer?: ReactNode
  /** O pedido abre o perfil pela linha de cima (os botões ficam fora). */
  onOpen?: () => void
}) {
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
      <Card palette={palette} soft>
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
      <Card palette={palette} soft>
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
      <Card palette={palette} soft>
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
              palette={palette}
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
  const medal = medals.find((a) => a.id === notice.medalId)
  if (!medal) return null
  const next = nextInSeries(medals, medal)
  return (
    <Card
      palette={palette}
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
  palette,
  answered,
  busy,
  onAnswer
}: {
  palette: Palette
  answered?: Answered
  busy: boolean
  onAnswer: (accept: boolean) => void
}) {
  const accept = usePressScale(0.97)
  const decline = usePressScale(0.97)
  if (answered)
    return (
      <Animated.View entering={SWAP} style={styles.answered}>
        {answered === 'friends' ? (
          <AddButton relation="friends" palette={palette} onPress={() => {}} />
        ) : (
          <Text style={[text(13, 'Bold'), { color: palette.muted }]}>
            Recusado
          </Text>
        )}
      </Animated.View>
    )
  return (
    <View style={styles.answers}>
      <Animated.View style={[{ flex: 1 }, accept.style]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPressIn={accept.onPressIn}
          onPressOut={accept.onPressOut}
          onPress={() => onAnswer(true)}
          style={[
            styles.answer,
            {
              backgroundColor: ACID,
              shadowColor: palette.dark ? '#000' : INK
            },
            styles.answerShadow
          ]}
        >
          <Text style={[text(13.5, 'Bold'), { color: INK }]}>Aceitar</Text>
        </Pressable>
      </Animated.View>
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
          <Text style={[text(13.5, 'Bold'), { color: palette.ink }]}>
            Recusar
          </Text>
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
  answerShadow: {
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  answered: { height: 40, justifyContent: 'center' },
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
