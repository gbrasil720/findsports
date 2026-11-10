import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import * as Calendar from 'expo-calendar/legacy'
import { type Href, useRouter } from 'expo-router'
import { Fragment, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckInCard } from '@/components/check-in'
import { MyGamesEmpty } from '@/components/empty-states'
import { BarRow, dayLabel } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import {
  GameLine,
  GroupLabel,
  LineList,
  LineState
} from '@/components/game-line'
import { useLayout, useNavInsets } from '@/components/layout'
import { haptic } from '@/components/motion'
import { Segmented } from '@/components/segmented'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import {
  ACID,
  ErrorState,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime, searchCenter } from '@/lib/explore'
import { dayKey, NO_FILTERS, searchInput } from '@/lib/filters'
import {
  calendarEvent,
  dayShort,
  formatCode,
  type MyGame,
  monthsLabel,
  showsCheckIn,
  todayHeadline,
  weekOffset
} from '@/lib/my-games'
import { trpc } from '@/lib/trpc'

/*
 * "Meus jogos" (3e do design): onde o torcedor marcou "Vou assistir aqui".
 * O próximo jogo vem grande, com o código do balcão (bar Elite); os outros
 * próximos, compactos; os que passaram, numa lista com o desfecho ou
 * "Avaliar". O código abre em tela cheia (3f), a avaliação no pós-jogo (3g).
 *
 * No dia do jogo, o "Estou aqui" (check-in, WEB-408) da página do bar vem
 * logo abaixo do jogo; o design da 08 não o desenha. O jogo que acabou há
 * menos de 3 h já está em "Anteriores", e o card vai acima da lista.
 */

export default function MyGames() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const soon = useSoon()
  useStatusBar('auto')
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const postGame = useQuery(trpc.postGame.pending.queryOptions())
  const now = Date.now()
  const games = mine.data ?? []
  // O servidor manda do mais recente ao mais antigo; os próximos vão do mais
  // perto ao mais longe.
  const upcoming = games.filter((game) => !game.ended).reverse()
  const past = games.filter((game) => game.ended)
  const toRate = new Set(postGame.data?.map((item) => item.eventId))
  const [first, ...rest] = upcoming

  const [tab, setTab] = useState<'next' | 'past'>('next')
  // Anteriores: o que falta avaliar primeiro, o resto pelo mês.
  const toRateList = past.filter((game) => toRate.has(game.eventId))
  const done = past.filter((game) => !toRate.has(game.eventId))

  const openCode = (game: MyGame) => router.push(`/codigo/${game.eventId}`)
  // Agenda do celular (WEB-406): o formulário de evento do próprio iOS, já
  // preenchido. Não pede permissão de calendário e a pessoa confirma lá.
  const addToCalendar = (game: MyGame) =>
    Calendar.createEventInCalendarAsync(calendarEvent(game))
      .then(({ action }) => {
        if (action === 'saved') haptic.success()
      })
      .catch(() => soon.show('Não deu para abrir a agenda'))
  const openBar = (game: MyGame) =>
    game.barActive ? router.push(`/bar/${game.barId}` as Href) : undefined
  const checkIn = (game: MyGame) =>
    showsCheckIn(game, now) ? (
      <CheckInCard
        key={`check-in-${game.eventId}`}
        barId={game.barId}
        barName={game.barName}
        eventId={game.eventId}
        done={game.visited}
      />
    ) : null

  const pull = usePullRefresh(() =>
    Promise.all([mine.refetch(), postGame.refetch()])
  )
  const layout = useLayout()
  // A tela de fora do Flip, sem jogo hoje: uma frase e um botão (regra 04
  // do Adaptativo 10).
  const markedToday = upcoming.some(
    (game) => dayLabel(game.startsAt, now) === 'Hoje'
  )
  const nav = useNavInsets()
  if (layout.kind === 'cover' && mine.isSuccess && !markedToday)
    return <CoverEmpty />

  // Fora do celular a lista fica numa coluna; vazia na tela larga, os jogos
  // de hoje perto vão ao lado, para marcar um (Adaptativo 10, regra 01).
  const usable = layout.width - nav.left - nav.right
  const aside = layout.kind === 'split' && mine.isSuccess && !games.length
  const listWidth = aside
    ? layout.gap
      ? layout.split
      : Math.round(usable * 0.46)
    : usable
  const column =
    layout.kind === 'phone' || layout.kind === 'duoClosed'
      ? listWidth
      : Math.min(listWidth, aside ? 430 : 560)
  const pad = (listWidth - column) / 2

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg },
        (nav.left > 0 || nav.right > 0) && {
          paddingLeft: nav.left,
          paddingRight: nav.right
        },
        aside && { flexDirection: 'row', gap: layout.gap }
      ]}
    >
      <ScrollView
        style={aside ? { width: listWidth, flexGrow: 0 } : undefined}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: tabBar + 24 },
          pad > 0 && { paddingHorizontal: 16 + pad }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.ink }]}
        >
          MEUS JOGOS
        </Text>

        {mine.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : mine.isError ? (
          <ErrorState
            style={styles.empty}
            title="Não deu para abrir seus jogos."
            error={mine.error}
            onRetry={mine.refetch}
            retrying={mine.isFetching}
          />
        ) : !games.length ? (
          <View style={styles.empty}>
            {/* O vazio da Rodada 14 é do tablet (Adaptativo 10); no
                celular, o de sempre. */}
            {layout.kind === 'phone' ? (
              <>
                <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
                  Você ainda não marcou nenhum jogo.
                </Text>
                <Text
                  style={[text(14, 'Regular', 1.45), { color: palette.muted }]}
                >
                  Na página de um bar, toque em “Vou assistir aqui”. Nos bares
                  Elite o código sai na hora e vale a oferta da casa no balcão.
                </Text>
                <PillButton
                  label="Procurar bares"
                  onPress={() => router.navigate('/explore')}
                />
              </>
            ) : (
              <WeekEmpty />
            )}
          </View>
        ) : (
          <>
            <Segmented
              items={[
                { key: 'next', label: 'Próximos' },
                { key: 'past', label: 'Anteriores' }
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'next' ? (
              <>
                {first ? (
                  <>
                    <MiniTicket
                      game={first}
                      now={now}
                      onCode={() => openCode(first)}
                      onBar={() => openBar(first)}
                      onCalendar={() => addToCalendar(first)}
                    />
                    {first.code ? null : checkIn(first)}
                  </>
                ) : (
                  <Text style={[text(14), { color: palette.muted }]}>
                    Nenhum jogo marcado daqui para a frente.
                  </Text>
                )}
                {WEEKS.map(({ label, test }) => {
                  const group = rest.filter((game) =>
                    test(weekOffset(game.startsAt, now))
                  )
                  if (!group.length) return null
                  return (
                    <Fragment key={label}>
                      <GroupLabel>{label}</GroupLabel>
                      <LineList>
                        {group.map((game, index) => (
                          <GameLine
                            key={game.eventId}
                            first={index === 0}
                            time={formatTime(game.startsAt)}
                            day={dayShort(game.startsAt, now)}
                            title={gameTitle(game)}
                            sub={
                              game.code
                                ? `${game.barName} · código ${formatCode(game.code)}`
                                : game.barName
                            }
                            onPress={() =>
                              game.code ? openCode(game) : openBar(game)
                            }
                          />
                        ))}
                      </LineList>
                    </Fragment>
                  )
                })}
              </>
            ) : (
              <>
                {past.map(checkIn)}
                {toRateList.length ? (
                  <>
                    <GroupLabel>Falta avaliar</GroupLabel>
                    <LineList>
                      {toRateList.map((game, index) => (
                        <PastLine
                          key={game.eventId}
                          game={game}
                          now={now}
                          first={index === 0}
                          rate
                          onPress={() =>
                            router.push(`/pos-jogo/${game.eventId}`)
                          }
                        />
                      ))}
                    </LineList>
                  </>
                ) : null}
                {done.length ? (
                  <>
                    <GroupLabel>{monthsLabel(done)}</GroupLabel>
                    <LineList>
                      {done.map((game, index) => (
                        <PastLine
                          key={game.eventId}
                          game={game}
                          now={now}
                          first={index === 0}
                          onPress={() => openBar(game)}
                        />
                      ))}
                    </LineList>
                  </>
                ) : null}
                {!past.length ? (
                  <Text style={[text(14), { color: palette.muted }]}>
                    Os jogos que você marcou e já passaram aparecem aqui.
                  </Text>
                ) : null}
                <RankingFoot />
              </>
            )}
          </>
        )}
      </ScrollView>
      {aside ? <TodayNear /> : null}
      {soon.toast}
    </View>
  )
}

/**
 * Os bares perto com jogo: a busca do Explorar (o cache é o dele), de hoje
 * ou, sem dia, com o próximo jogo de cada bar.
 */
function useGamesNear(date?: string) {
  const session = authClient.useSession()
  const { device } = useExploreState()
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const search = useQuery({
    ...trpc.pubs.search.queryOptions(
      searchInput(
        { ...NO_FILTERS, date: date ?? null },
        searchCenter(device, city.data),
        session.data?.user.searchRadiusKm ?? 3
      )
    ),
    enabled: device !== null || !city.isPending
  })
  return {
    search,
    bars: (search.data?.bars ?? []).filter((bar) => bar.nextEvent)
  }
}

const WEEKDAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
/** "QUA": o dia da semana em Brasília (UTC-3, sem horário de verão). */
const weekday = (iso: string) =>
  WEEKDAYS[new Date(Date.parse(iso) - 3 * 3600_000).getUTCDay()]

/**
 * O vazio de Meus jogos (`eRes`), com os jogos desta semana perto: o
 * próximo jogo de cada bar, dos que caem nos próximos 7 dias.
 */
function WeekEmpty() {
  const router = useRouter()
  const { bars } = useGamesNear()
  const now = Date.now()
  const week = bars
    .filter((bar) => {
      const at = Date.parse(bar.nextEvent?.startsAt ?? '')
      return at - now < 7 * 24 * 3600_000
    })
    .sort((a, b) =>
      (a.nextEvent?.startsAt ?? '').localeCompare(b.nextEvent?.startsAt ?? '')
    )
    .slice(0, 2)
    .map((bar) => {
      const game = bar.nextEvent as NonNullable<typeof bar.nextEvent>
      return {
        key: bar.id,
        day: weekday(game.startsAt),
        title: gameTitle(game),
        detail: bar.goingCount
          ? `${bar.name} · ${bar.goingCount} vão`
          : bar.name,
        onPress: () =>
          router.push({
            pathname: '/vou/[barId]',
            params: { barId: bar.id, eventId: game.id }
          } as Href)
      }
    })
  return <MyGamesEmpty week={week} />
}

/** A tela de fora do Flip sem jogo marcado hoje (`flip10`). */
function CoverEmpty() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const now = Date.now()
  const { bars } = useGamesNear(dayKey(now))
  const top = todayHeadline(
    bars.map((bar) => {
      const game = bar.nextEvent as NonNullable<typeof bar.nextEvent>
      return { title: gameTitle(game), startsAt: game.startsAt }
    })
  )
  return (
    <View style={[styles.cover, { paddingTop: Math.max(insets.top, 40) }]}>
      <Text style={styles.coverKicker}>MEUS JOGOS</Text>
      <Title
        lines={[['Nenhum jogo'], ['marcado hoje']]}
        size={26}
        color={PAPER}
      />
      {top ? (
        <Text style={[text(12.5, 'Regular', 1.4), { color: '#aaa9a4' }]}>
          {top.title} às {formatTime(top.startsAt)} em {top.bars}{' '}
          {top.bars === 1 ? 'bar perto' : 'bares perto'}.
        </Text>
      ) : null}
      <View style={{ alignSelf: 'flex-end', width: 170, marginTop: 6 }}>
        <PillButton
          label="Ver bares"
          height={48}
          edge="#000"
          onPress={() => router.navigate('/explore')}
        />
      </View>
    </View>
  )
}

/** Ao lado da lista vazia: os bares perto com jogo hoje, para marcar um. */
function TodayNear() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const now = Date.now()
  const { search, bars } = useGamesNear(dayKey(now))
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.dark ? '#161613' : '#ebe8df' }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: tabBar + 24,
        gap: 12
      }}
    >
      <Text style={[styles.aside, { color: palette.dark ? ACID : '#c92b0c' }]}>
        Jogos hoje perto
      </Text>
      <Text style={[text(13), { color: palette.muted, marginTop: -6 }]}>
        Marque um e ele aparece em Meus jogos.
      </Text>
      {search.isPending ? (
        <ActivityIndicator color={palette.ink} style={{ marginTop: 24 }} />
      ) : bars.length ? (
        bars
          .slice(0, 8)
          .map((bar) => (
            <BarRow
              key={bar.id}
              bar={bar}
              now={now}
              compact
              onPress={() => router.push(`/bar/${bar.id}` as Href)}
            />
          ))
      ) : (
        <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
          Nenhum bar perto com jogo publicado hoje.
        </Text>
      )}
    </ScrollView>
  )
}

/** Os grupos dos próximos, pela semana do jogo (domingo a sábado). */
const WEEKS = [
  { label: 'Esta semana', test: (week: number) => week <= 0 },
  { label: 'Próxima semana', test: (week: number) => week === 1 },
  { label: 'Mais pra frente', test: (week: number) => week >= 2 }
]

/**
 * O próximo jogo como mini ingresso (`.mini3`): o dia e a hora, "começa
 * em" no de hoje, o jogo em Anton, o bar e a ação do momento: "Ver código"
 * no Elite, senão o bar; e "Agenda", o formulário do iOS.
 */
function MiniTicket({
  game,
  now,
  onCode,
  onBar,
  onCalendar
}: {
  game: MyGame
  now: number
  onCode: () => void
  onBar: () => void
  onCalendar: () => void
}) {
  const palette = usePalette()
  const day = dayShort(game.startsAt, now)
  const minutes = Math.round((Date.parse(game.startsAt) - now) / 60_000)
  const live = minutes <= 0 && !game.ended
  const chip = live
    ? 'ao vivo'
    : day === 'hoje'
      ? `começa em ${minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`}`
      : null
  const sides = gameTitle(game).split(' × ')
  return (
    <View
      style={[
        styles.mini,
        palette.dark && {
          backgroundColor: '#1c1c18',
          borderWidth: 1,
          borderColor: 'rgba(241,238,230,.08)'
        }
      ]}
    >
      <View style={styles.miniHead}>
        <Text style={styles.miniWhen}>
          {`${day} · ${formatTime(game.startsAt)}`.toLocaleUpperCase('pt-BR')}
        </Text>
        {chip ? (
          <View
            style={[styles.miniChip, live && { backgroundColor: '#e8320c' }]}
          >
            <Text style={styles.miniChipText}>
              {chip.toLocaleUpperCase('pt-BR')}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={styles.miniTitle}
      >
        {sides.length === 2 ? (
          <>
            {sides[0]?.toLocaleUpperCase('pt-BR')}
            <Text style={{ color: ACID, fontSize: 22.5 }}> × </Text>
            {sides[1]?.toLocaleUpperCase('pt-BR')}
          </>
        ) : (
          gameTitle(game).toLocaleUpperCase('pt-BR')
        )}
      </Text>
      <Text
        numberOfLines={1}
        style={[text(13.5, 'Regular', 1.35), styles.miniLine]}
      >
        {[
          game.barName,
          game.neighborhood,
          game.goingCount ? `${game.goingCount} vão` : null
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {!game.barActive ? (
        <Text style={[text(13, 'SemiBold', 1.4), { color: '#f3421d' }]}>
          Este bar não está mais na Onside.
          {game.code && !game.validated
            ? ' Seu código continua valendo: mostre no balcão.'
            : ''}
        </Text>
      ) : null}
      <View style={styles.miniActions}>
        <Pressable
          accessibilityRole="button"
          onPress={game.code ? onCode : onBar}
          style={[styles.miniButton, styles.miniAcid]}
        >
          <Icon
            name={game.code ? 'qr' : 'pin'}
            size={18}
            color={INK}
            accent={INK}
          />
          <Text style={[text(14.5, 'Bold', 1.2), { color: INK }]}>
            {game.code ? 'Ver código' : 'Ver o bar'}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pôr na agenda do celular"
          onPress={onCalendar}
          style={[styles.miniButton, styles.miniGhost]}
        >
          <Icon name="calendar" size={18} color={PAPER} accent={LIVE} />
          <Text style={[text(14.5, 'Bold', 1.2), { color: PAPER }]}>
            Agenda
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

/** Uma linha dos anteriores: o estado à direita (Avaliar, ★ 4, Não fui). */
function PastLine({
  game,
  now,
  first,
  rate,
  onPress
}: {
  game: MyGame
  now: number
  first: boolean
  rate?: boolean
  onPress: () => void
}) {
  const how = game.validated
    ? 'código validado'
    : game.checkedIn
      ? 'check-in'
      : null
  const no = game.attended === false
  return (
    <GameLine
      first={first}
      dim={no && !rate}
      time={formatTime(game.startsAt)}
      day={dayShort(game.startsAt, now)}
      title={gameTitle(game)}
      sub={how ? `${game.barName} · ${how}` : game.barName}
      onPress={onPress}
      right={
        rate ? (
          <LineState kind="rate" label="Avaliar" />
        ) : game.myStars ? (
          <LineState kind="done" label={`★ ${game.myStars}`} />
        ) : no ? (
          <LineState kind="no" label="Não fui" />
        ) : null
      }
    />
  )
}

/** O rodapé do ranking do mês (WEB-409): "3º entre os amigos em novembro". */
function RankingFoot() {
  const router = useRouter()
  const palette = usePalette()
  const ranking = useQuery(
    trpc.ranking.friends.queryOptions({ metric: 'bars' })
  )
  const rows = ranking.data?.rows ?? []
  const me = rows.find((row) => row.me)
  // Sozinho no ranking não tem posição para contar.
  if (!me || rows.length < 2) return null
  const month = new Date().toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: 'America/Sao_Paulo'
  })
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.navigate('/voce/ranking')}
      style={[styles.rank, { backgroundColor: palette.mark }]}
    >
      <Text style={[styles.rankNumber, { color: palette.ink }]}>
        {me.position}º
      </Text>
      <Text
        style={[text(14, 'Regular', 1.35), { color: palette.ink, flex: 1 }]}
      >
        entre os amigos em {month} ·{' '}
        <Text style={{ textDecorationLine: 'underline' }}>Ver ranking</Text>
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // `.pg h3`: Anton 44 sem o entrelinha curto (margem negativa).
  title: { fontFamily: 'Anton', fontSize: 44, marginVertical: -10.7 },
  mini: {
    backgroundColor: INK,
    borderRadius: 24,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  miniHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  miniWhen: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    color: '#aaa9a4',
    marginVertical: -1.6
  },
  miniChip: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: ACID
  },
  miniChipText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: INK,
    marginVertical: -1.6
  },
  miniTitle: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    marginVertical: -7.3
  },
  miniLine: { color: '#c9c7c0' },
  miniActions: { flexDirection: 'row', gap: 8 },
  miniButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  miniAcid: {
    backgroundColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  miniGhost: { borderWidth: 1.5, borderColor: 'rgba(241,238,230,.3)' },
  rank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20
  },
  rankNumber: { fontFamily: 'Anton', fontSize: 30, marginVertical: -7.3 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4
  },
  empty: { gap: 14, marginTop: 24 },
  cover: {
    flex: 1,
    backgroundColor: INK,
    paddingHorizontal: 22,
    gap: 10
  },
  coverKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: ACID
  },
  // Anton 22 do design, sem `lineHeight` (corta no iOS): margem negativa.
  aside: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginVertical: -0.2425 * 22
  },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1
  },
  // Altura 38 do design; os cantos de cima são dele, já que o card do
  // ingresso não recorta (o furo do picote passa por cima da sombra).
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    marginTop: -1,
    marginHorizontal: -1,
    paddingHorizontal: 15,
    backgroundColor: ACID,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6
  },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 4
  },
  photo: { width: 54, height: 54, borderRadius: 3 },
  offAir: { color: '#c92b0c', paddingHorizontal: 14, paddingBottom: 12 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 14
  },
  // Anton 40 do design, sem `lineHeight` (corta no iOS): margem negativa.
  code: {
    fontFamily: 'Anton',
    fontSize: 40,
    letterSpacing: 3.2,
    marginVertical: -6
  },
  show: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 21,
    overflow: 'hidden'
  },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 12
  },
  list: { paddingHorizontal: 14 },
  note: { paddingHorizontal: 4 },
  past: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12
  },
  rate: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: INK
  },
  badge: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 }
})
