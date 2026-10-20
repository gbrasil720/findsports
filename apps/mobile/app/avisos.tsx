import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line } from 'react-native-svg'
import { Card } from '@/components/card'
import { type Palette, usePalette } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { MedalImage } from '@/components/medal'
import { haptic, ScalePress } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACID,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
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
  type Notice,
  noticeSections,
  noticeTime,
  startsIn
} from '@/lib/notices'
import { type NearBar, sides } from '@/lib/search'
import { trpc } from '@/lib/trpc'

/*
 * Avisos (19c do design). No topo, o jogo marcado para hoje, com o código.
 * Embaixo, os avisos montados do que já existe (`lib/notices.ts`): oferta
 * liberada, jogo dos seus times perto e conquista desbloqueada. As abas são
 * Tudo, Jogos e Conquistas: amigos, ranking e comunidades do design ainda
 * não existem. "Lido" fica no aparelho.
 */

const READ_KEY = 'onside.avisos-lidos'
type Tab = 'all' | 'games' | 'medals'

export default function Notices() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  const state = useExploreState()
  useStatusBar('auto')
  const [tab, setTab] = useState<Tab>('all')
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
      sides
    },
    now
  )
  const shown = notices.filter((n) =>
    tab === 'all'
      ? true
      : tab === 'games'
        ? n.kind !== 'medal'
        : n.kind === 'medal'
  )
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
    else router.push({ pathname: '/busca', params: { q: notice.title } })
  }

  const pull = usePullRefresh(() =>
    Promise.all([mine.refetch(), medals.refetch(), teamBars.refetch()])
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
                ['medals', 'Conquistas']
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
              <Text style={[text(13, 'Bold'), { color: palette.live }]}>
                Ler tudo
              </Text>
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
                  <Text style={[styles.section, { color: palette.live }]}>
                    {section.title}
                  </Text>
                  {fresh.length ? (
                    <Text style={[text(12.5), { color: palette.muted }]}>
                      {fresh.length} {fresh.length === 1 ? 'novo' : 'novos'}
                    </Text>
                  ) : null}
                </View>
                {section.items.map((notice) => (
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
                ))}
              </View>
            )
          })
        ) : (
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            Nada por aqui ainda. Os avisos chegam quando um bar valida seu
            código, quando sai uma conquista ou quando um bar perto marca jogo
            dos seus times.
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
  const wait = startsIn(game.startsAt, now)
  const dark = palette.dark
  return (
    <View>
      <View style={[styles.todayShadow, { backgroundColor: ACID }]} />
      <View
        style={[styles.today, { backgroundColor: dark ? palette.card : INK }]}
      >
        <View style={styles.todayTop}>
          <View style={{ flex: 1 }}>
            <Text style={[text(12.5, 'Bold'), { color: ACID }]}>
              Seu jogo de hoje
            </Text>
            <Text style={styles.todayTitle} numberOfLines={2}>
              {gameTitle(game)}
            </Text>
            <Text style={[text(12.5), { color: '#aaa9a4' }]}>
              {game.barName} · {formatTime(game.startsAt)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[text(11.5), { color: '#aaa9a4' }]}>
              {wait ? 'começa em' : 'rolando'}
            </Text>
            <Text style={styles.countdown}>{wait ?? 'agora'}</Text>
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
              stroke="rgba(241,238,230,.16)"
              strokeWidth={1.5}
              strokeDasharray="5,5"
            />
          </Svg>
          <View
            style={[styles.hole, { right: -9, backgroundColor: palette.bg }]}
          />
        </View>
        <View style={styles.todayFoot}>
          <Text style={[text(12.5), { color: PAPER, flex: 1 }]}>
            {going.data
              ? `${going.data} ${going.data === 1 ? 'pessoa vai' : 'pessoas vão'}`
              : 'Você vai'}
          </Text>
          {game.code ? (
            <Text style={styles.code}>{formatCode(game.code)}</Text>
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
  now
}: {
  palette: Palette
  notice: Notice
  medals: Achievement[]
  unread: boolean
  now: number
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
            <Text style={[text(12, 'Bold'), { color: palette.live }]}>
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
    color: PAPER,
    textTransform: 'uppercase',
    marginTop: 2
  },
  countdown: { fontFamily: 'Anton', fontSize: 40, color: PAPER },
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
    letterSpacing: 0.9,
    color: PAPER
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
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE },
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
