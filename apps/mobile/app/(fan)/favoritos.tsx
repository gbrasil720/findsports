import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, FilterChip } from '@/components/card'
import { HardShadow, Photo } from '@/components/explore'
import { useExploreState, useShotSource } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { useLayout, useNavInsets } from '@/components/layout'
import {
  EASE,
  haptic,
  POP_FAST,
  SWAP,
  usePressScale
} from '@/components/motion'
import { useTabBarSpace } from '@/components/tab-bar'
import { type Palette, usePalette } from '@/components/theme'
import {
  ACCENT,
  ACID,
  ErrorState,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PillButton,
  Text,
  TextInput,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import {
  BarMemory,
  LastBar,
  MonthsCard,
  SavedHeart,
  VisitCard,
  type VisitRow,
  VisitsMap
} from '@/components/your-bars'
import { distanceKm, formatKm, searchCenter } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import { trpc } from '@/lib/trpc'
import {
  type BarSort,
  barGroups,
  byMonth,
  dayKey,
  dayMonth,
  gameWhen,
  type MemoryBar,
  memoryBar,
  savedWeek,
  visitGrid,
  WEEK_COLUMNS,
  WEEK_LETTERS,
  type YourBar,
  yourBars
} from '@/lib/your-bars'

/*
 * Seus bares (17b, 17d e 17e do design), na aba Favoritos: os bares onde o
 * torcedor já assistiu a um jogo pela Onside e os que ele salvou com o
 * coração.
 * - "Já fui": o calendário das últimas quatro semanas (cada quadrado acid é
 *   um jogo com código validado) e as visitas por mês (`attendance.visits`).
 * - "Salvos": a semana com os jogos dos salvos, agrupados por dia, e no fim
 *   os bares sem jogo nesta semana (`pubs.getFavorites`).
 * - "Bares" (17e): só os salvos, por bairro, perto ou A–Z, com quantas vezes
 *   você foi a cada um.
 * A lupa filtra as três por nome, bairro ou jogo. No design a tela abre com
 * voltar (vem do menu); aqui ela é a raiz da aba.
 */

type Outputs = inferRouterOutputs<AppRouter>
type SavedRow = Outputs['pubs']['getFavorites'][number]
type Tab = 'visits' | 'saved' | 'bars'

export default function YourBars() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const layout = useLayout()
  const nav = useNavInsets()
  useStatusBar('auto')
  const visits = useQuery(trpc.attendance.visits.queryOptions())
  const saved = useQuery(trpc.pubs.getFavorites.queryOptions())
  const favorites = useFavorites()
  // "Ver os 3 que você curtiu" (23j) abre direto nos salvos.
  const { aba } = useLocalSearchParams<{ aba?: Tab }>()
  const [picked, setPicked] = useState<Tab | null>(aba ?? null)
  useEffect(() => {
    if (aba) setPicked(aba)
  }, [aba])
  const [search, setSearch] = useState<string | null>(null)
  // Abre em "Já fui" quando há visita; senão nos salvos.
  const tab: Tab = picked ?? (visits.data?.length ? 'visits' : 'saved')
  const now = Date.now()

  const term = search?.trim().toLocaleLowerCase('pt-BR') ?? ''
  const hit = (...values: (string | null | undefined)[]) =>
    !term || values.some((v) => v?.toLocaleLowerCase('pt-BR').includes(term))
  const visitRows = (visits.data ?? []).filter((v) =>
    hit(v.barName, v.neighborhood, gameTitle(v))
  )
  const savedRows = (saved.data ?? []).filter((s) =>
    hit(
      s.bar.name,
      s.bar.neighborhood,
      ...s.bar.events.map((game) => gameTitle(game))
    )
  )
  const openBar = (barId: string) => router.push(`/bar/${barId}` as Href)
  const toggleSaved = (barId: string) => {
    haptic.select()
    favorites.toggle(barId)
  }
  const { device } = useExploreState()
  // A aba "Você" mostra esta tela sob o menu quando se vem daqui.
  const shotSource = useShotSource('bars')
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const from = searchCenter(device, city.data)
  const mine = yourBars(visits.data ?? [], saved.data ?? [], from, distanceKm)
  const barRows = mine.bars.filter((b) => hit(b.name, b.neighborhood))
  // "Bares" junta as duas leituras; as outras abas dependem de uma só.
  const queryOf = (which: Tab) =>
    which === 'visits'
      ? visits
      : which === 'saved'
        ? saved
        : visits.isPending || visits.isError
          ? visits
          : saved

  const pull = usePullRefresh(() =>
    Promise.all([visits.refetch(), saved.refetch()])
  )

  // Fora do celular (A04): tablet em pé é o mês inteiro e cards; deitado,
  // "Já fui" e a lembrança do bar tocado (no dobrável) ou o mapa de onde você
  // foi (no tablet); 13″ e Ultra deitados, as três abas em colunas.
  const columns = layout.kind === 'split' && layout.wide
  const aside = layout.kind === 'split' && !layout.wide
  const fold =
    aside &&
    (layout.nav === 'duoRail' ||
      layout.gap > 0 ||
      layout.split === Math.round(layout.width / 2))
  const content = layout.width - nav.left - nav.right - 56
  const board =
    layout.kind === 'stack'
      ? { columns: content > 820 ? 3 : 2, cell: content > 820 ? 44 : 38 }
      : undefined
  // No lado a lado, tocar numa linha de qualquer aba escolhe o bar dela
  // (`key` é a linha, para só ela ganhar o contorno); de início, a visita
  // mais recente.
  const [chosen, setChosen] = useState<{ barId: string; key: string } | null>(
    null
  )
  const all = visits.data ?? []
  const pick =
    chosen ?? (all[0] ? { barId: all[0].barId, key: all[0].eventId } : null)
  const memory = pick ? memoryBar(pick.barId, all, saved.data ?? []) : null
  const here = memory ? all.filter((v) => v.barId === memory.barId) : []
  const choose = aside
    ? (barId: string, key: string) => {
        haptic.select()
        setChosen({ barId, key })
      }
    : undefined
  // Tocar numa gota escolhe a visita mais recente daquele bar.
  const chooseOnMap = (barId: string) => {
    haptic.select()
    setChosen({
      barId,
      key: all.find((v) => v.barId === barId)?.eventId ?? `bar:${barId}`
    })
  }
  const kmTo = (b: MemoryBar) =>
    b.latitude === null || b.longitude === null
      ? null
      : distanceKm(from, { lat: Number(b.latitude), lng: Number(b.longitude) })
  // A semana de quadrados fora do celular termina na visita mais recente: o
  // design a mostra sempre com jogos, não quatro semanas vazias.
  const lastVisit = all[0] ? new Date(all[0].startsAt).getTime() : now
  const gridEnd = layout.kind === 'phone' ? now : Math.min(now, lastVisit)

  const body = (which: Tab) => {
    const query = queryOf(which)
    return query.isPending ? (
      <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
    ) : query.isError ? (
      <ErrorState
        style={styles.empty}
        title="Não deu para abrir seus bares."
        error={query.error}
        onRetry={query.refetch}
        retrying={query.isFetching}
      />
    ) : (
      // Trocar de aba troca o conteúdo em fade curto, sem salto.
      <Animated.View key={which} entering={SWAP} style={styles.stack}>
        {which === 'bars' ? (
          <Bars
            all={mine}
            rows={barRows}
            searching={Boolean(term)}
            onOpen={openBar}
            onToggle={toggleSaved}
            selected={aside ? pick?.key : undefined}
            onSelect={choose}
          />
        ) : which === 'visits' ? (
          <Visits
            now={now}
            all={all}
            rows={visitRows}
            searching={Boolean(term)}
            isSaved={(id) => favorites.ids.has(id)}
            onOpen={openBar}
            onToggle={toggleSaved}
            board={board}
            gridEnd={gridEnd}
            wide={layout.kind !== 'phone'}
            selected={aside ? pick?.key : undefined}
            onSelect={choose}
          />
        ) : (
          <Saved
            now={now}
            rows={savedRows}
            searching={Boolean(term)}
            onOpen={openBar}
            onToggle={toggleSaved}
            onExplore={() => router.navigate('/explore')}
            selected={aside ? pick?.key : undefined}
            onSelect={choose}
          />
        )}
      </Animated.View>
    )
  }

  const segments = (
    <Segments
      tab={tab}
      visits={visits.data?.length ?? 0}
      saved={saved.data?.length ?? 0}
      bars={mine.bars.length}
      onPick={(next) => {
        if (next === tab) return
        haptic.select()
        setPicked(next)
      }}
    />
  )
  const searchButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={search === null ? 'Buscar' : 'Fechar busca'}
      hitSlop={8}
      onPress={() => setSearch(search === null ? '' : null)}
    >
      <GlassRound>
        <Icon
          name={search === null ? 'search' : 'close'}
          size={18}
          color={palette.ink}
        />
      </GlassRound>
    </Pressable>
  )
  const searchField =
    search !== null ? (
      <Animated.View entering={SWAP}>
        <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.search}>
          <Icon name="search" size={16} color={palette.muted} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por nome, bairro ou jogo"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            style={[text(14.5), styles.searchInput, { color: palette.ink }]}
          />
        </Glass>
      </Animated.View>
    ) : null
  // Tablet em pé e três colunas: a busca fica sempre à vista.
  const openSearch = (
    <Glass
      tone={palette.dark ? 'dark' : 'light'}
      style={[styles.search, styles.searchOpen]}
    >
      <Icon
        name="search"
        size={18}
        color={palette.muted}
        accent={palette.dark ? ACID : LIVE}
      />
      <TextInput
        value={search ?? ''}
        onChangeText={setSearch}
        placeholder="Qual era aquele bar?"
        placeholderTextColor={palette.muted}
        returnKeyType="search"
        style={[text(15), styles.searchInput, { color: palette.ink }]}
      />
    </Glass>
  )
  const refresh = <RefreshControl {...pull} tintColor={palette.muted} />
  const root = [
    styles.screen,
    {
      backgroundColor: palette.bg,
      paddingLeft: nav.left,
      paddingRight: nav.right
    }
  ]

  // Tela de fora do Z Flip 8: o último bar onde você foi e "Voltar lá".
  if (layout.kind === 'cover')
    return (
      <View
        ref={shotSource.ref}
        collapsable={false}
        style={[styles.cover, { paddingTop: insets.top + 30 }]}
      >
        {all[0] ? <LastBar visit={all[0]} onOpen={openBar} /> : null}
      </View>
    )

  // Na mesa (Duo em laptop, Flex Mode): o mapa de onde você foi em cima, as
  // visitas em cards embaixo, com a rolagem de lado.
  if (layout.kind === 'table')
    return (
      <View ref={shotSource.ref} collapsable={false} style={root}>
        <View style={{ height: layout.split }}>
          <VisitsMap
            visits={all}
            selected={memory}
            onSelect={chooseOnMap}
            top={insets.top + 12}
            center={{ latitude: from.lat, longitude: from.lng }}
            padding={{ top: insets.top + 120, left: 60, right: 60, bottom: 30 }}
          />
        </View>
        <View
          style={[
            styles.tableBottom,
            { marginTop: layout.gap, backgroundColor: palette.bg }
          ]}
        >
          <View style={styles.tableTop}>
            <Title lines={[['Seus bares']]} size={28} color={palette.ink} />
            <View style={{ width: 280 }}>{segments}</View>
          </View>
          {tab === 'visits' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tableCards}
              contentContainerStyle={styles.tableCardsBody}
            >
              {all.map((visit) => (
                <View
                  key={visit.eventId}
                  style={{ width: layout.width > 800 ? 250 : 230 }}
                >
                  <VisitCard
                    visit={visit}
                    saved={favorites.ids.has(visit.barId)}
                    onOpen={
                      visit.barActive ? () => openBar(visit.barId) : undefined
                    }
                    onToggle={() => toggleSaved(visit.barId)}
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={[
                styles.columnBody,
                { paddingHorizontal: 20, paddingBottom: tabBar + 24 }
              ]}
            >
              {body(tab)}
            </ScrollView>
          )}
        </View>
      </View>
    )

  if (columns)
    return (
      <View ref={shotSource.ref} collapsable={false} style={root}>
        <View style={[styles.wideTop, { paddingTop: insets.top + 28 }]}>
          <Title lines={[['Seus bares']]} size={48} color={palette.ink} />
          <View style={styles.wideSearch}>{openSearch}</View>
        </View>
        <View style={styles.wideColumns}>
          {(
            [
              [
                'visits',
                'Já fui',
                `${new Set(all.map((v) => v.barId)).size} bares`
              ],
              ['saved', 'Salvos', `${saved.data?.length ?? 0} bares`],
              ['bars', 'Bares', `${mine.bars.length} no total`]
            ] as const
          ).map(([which, title, sub]) => (
            <View key={which} style={styles.wideColumn}>
              <View
                style={[styles.columnHead, { borderBottomColor: palette.ink }]}
              >
                <Text style={[styles.columnTitle, { color: palette.ink }]}>
                  {title}
                </Text>
                <Text style={[styles.columnSub, { color: palette.muted }]}>
                  {sub}
                </Text>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                  styles.columnBody,
                  { paddingBottom: tabBar + 24 }
                ]}
                refreshControl={refresh}
              >
                {body(which)}
              </ScrollView>
            </View>
          ))}
        </View>
      </View>
    )

  if (aside)
    return (
      <View ref={shotSource.ref} collapsable={false} style={root}>
        <View style={styles.sideBySide}>
          <ScrollView
            style={{ width: fold ? layout.split : 400, flexGrow: 0 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.body,
              {
                paddingTop: insets.top + (fold ? 22 : 26),
                paddingBottom: tabBar + 24
              },
              !fold && { paddingHorizontal: 20 }
            ]}
            refreshControl={refresh}
          >
            {/* O título embaixo da lupa, como no design do lado a lado. */}
            <View style={styles.sideTop}>{searchButton}</View>
            <Title
              lines={[['Seus bares']]}
              size={fold ? 36 : 40}
              color={palette.ink}
            />
            {searchField}
            {segments}
            {body(tab)}
          </ScrollView>
          {fold ? (
            <ScrollView
              style={{
                marginLeft: layout.gap,
                backgroundColor: palette.dark ? '#161613' : '#ebe8df'
              }}
              contentContainerStyle={{
                paddingTop: insets.top + 74,
                paddingHorizontal: 18,
                paddingBottom: tabBar + 24
              }}
            >
              {memory ? (
                <BarMemory
                  bar={memory}
                  here={here}
                  km={kmTo(memory)}
                  saved={favorites.ids.has(memory.barId)}
                  onToggle={() => toggleSaved(memory.barId)}
                  photoHeight={
                    layout.width - layout.split - layout.gap - nav.right < 400
                      ? 170
                      : 210
                  }
                />
              ) : null}
            </ScrollView>
          ) : (
            <View style={styles.grow}>
              <VisitsMap
                visits={all}
                selected={memory}
                onSelect={chooseOnMap}
                top={insets.top + 38}
                center={{ latitude: from.lat, longitude: from.lng }}
                padding={{
                  top: insets.top + 130,
                  left: 40,
                  right: memory ? 470 : 60,
                  bottom: tabBar + 40
                }}
              />
              {memory ? (
                <ScrollView
                  style={[
                    styles.floating,
                    {
                      top: insets.top + 32,
                      maxHeight: layout.height - insets.top - 32 - tabBar - 16,
                      backgroundColor: palette.dark
                        ? 'rgba(22,22,19,.92)'
                        : 'rgba(241,238,230,.94)'
                    }
                  ]}
                  contentContainerStyle={styles.floatingBody}
                >
                  <BarMemory
                    bar={memory}
                    here={here}
                    km={kmTo(memory)}
                    saved={favorites.ids.has(memory.barId)}
                    onToggle={() => toggleSaved(memory.barId)}
                    photoHeight={170}
                  />
                </ScrollView>
              ) : null}
            </View>
          )}
        </View>
      </View>
    )

  return (
    <View ref={shotSource.ref} collapsable={false} style={root}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        onScrollEndDrag={shotSource.again}
        onMomentumScrollEnd={shotSource.again}
        contentContainerStyle={[
          styles.body,
          board ? styles.boardBody : null,
          {
            paddingTop: insets.top + (board ? 28 : 4),
            paddingBottom: tabBar + 24
          }
        ]}
        refreshControl={refresh}
      >
        {board ? (
          <>
            {/* Tablet em pé: as abas ao lado do título, a busca aberta. */}
            <View style={styles.boardTop}>
              <Title lines={[['Seus bares']]} size={52} color={palette.ink} />
              <View
                style={{ width: Math.min(420, content - 280), flexShrink: 0 }}
              >
                {segments}
              </View>
            </View>
            {openSearch}
          </>
        ) : (
          <>
            {/* O título com a lupa ao lado, na altura das outras telas. O
                voltar do design não entra: aqui a tela é a raiz da aba. */}
            <View style={styles.top}>
              <Title lines={[['Seus bares']]} size={42} color={palette.ink} />
              {searchButton}
            </View>
            {searchField}
            {segments}
          </>
        )}
        {body(tab)}
      </ScrollView>
    </View>
  )
}

/** "Já fui 9", "Salvos 6", "Bares 8": as três abas no vidro, com o número num selo. */
function Segments({
  tab,
  visits,
  saved,
  bars,
  onPick
}: {
  tab: Tab
  visits: number
  saved: number
  bars: number
  onPick: (tab: Tab) => void
}) {
  const palette = usePalette()
  const options: [Tab, string, number][] = [
    ['visits', 'Já fui', visits],
    ['saved', 'Salvos', saved],
    ['bars', 'Bares', bars]
  ]
  return (
    <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.segments}>
      {options.map(([key, label, count]) => {
        const on = key === tab
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}, ${count}`}
            onPress={() => onPick(key)}
            style={[
              styles.segment,
              on && [
                styles.segmentOn,
                {
                  backgroundColor: palette.dark
                    ? 'rgba(255,255,255,.14)'
                    : 'rgba(255,255,255,.9)'
                }
              ]
            ]}
          >
            <Text
              style={[
                text(14, on ? 'Bold' : 'Regular', 1.2),
                { color: on ? palette.ink : palette.muted }
              ]}
            >
              {label}
            </Text>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: on
                    ? ACID
                    : palette.dark
                      ? 'rgba(241,238,230,.1)'
                      : 'rgba(18,18,15,.08)'
                }
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: on ? INK : palette.dark ? palette.ink : palette.muted
                  }
                ]}
              >
                {count}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </Glass>
  )
}

/** As cores que mudam com o tema: acid no escuro, tinta e vermelho no claro. */
function tones(palette: Palette) {
  return {
    glow: palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)',
    off: palette.dark ? '#262621' : palette.mark,
    // Acid em texto some no papel: no claro, o vermelho do app.
    heading: palette.dark ? ACID : ACCENT,
    mark: palette.dark ? ACID : INK
  }
}

function Visits({
  now,
  all,
  rows,
  searching,
  isSaved,
  onOpen,
  onToggle,
  board,
  gridEnd,
  wide,
  selected,
  onSelect
}: {
  now: number
  all: VisitRow[]
  rows: VisitRow[]
  searching: boolean
  isSaved: (barId: string) => boolean
  onOpen: (barId: string) => void
  onToggle: (barId: string) => void
  /** Tablet em pé: o mês inteiro e as visitas em cards. */
  board?: { columns: number; cell: number }
  /** Onde termina a semana de quadrados (fora do celular, na última visita). */
  gridEnd: number
  /** Fora do celular: o mês com a contagem ao lado. */
  wide: boolean
  /** Lado a lado: a linha tocada, cujo bar a lembrança ao lado mostra. */
  selected?: string | null
  onSelect?: (barId: string, key: string) => void
}) {
  const palette = usePalette()
  const t = tones(palette)
  const grid = visitGrid(all, gridEnd)
  if (board) {
    const cards = Array.from(
      { length: Math.ceil(rows.length / board.columns) },
      (_, r) => rows.slice(r * board.columns, (r + 1) * board.columns)
    )
    return (
      <>
        <MonthsCard
          visits={all}
          now={now}
          selected={all[0] ? dayKey(all[0].startsAt) : null}
          cell={board.cell}
        />
        {!all.length ? (
          <NoVisits />
        ) : (
          <>
            <Header
              label="Onde você foi"
              count={`${new Set(all.map((v) => v.barId)).size} bares · ${all.length} ${all.length === 1 ? 'jogo' : 'jogos'}`}
            />
            {!rows.length && searching ? <NoMatch /> : null}
            {cards.map((line) => (
              <View key={line[0]?.eventId} style={styles.cardRow}>
                {Array.from({ length: board.columns }, (_, i) => {
                  const visit = line[i]
                  return visit ? (
                    <VisitCard
                      key={visit.eventId}
                      visit={visit}
                      saved={isSaved(visit.barId)}
                      onOpen={
                        visit.barActive ? () => onOpen(visit.barId) : undefined
                      }
                      onToggle={() => onToggle(visit.barId)}
                    />
                  ) : (
                    // biome-ignore lint/suspicious/noArrayIndexKey: lugar vazio no fim da linha
                    <View key={i} style={styles.grow} />
                  )
                })}
              </View>
            ))}
          </>
        )}
      </>
    )
  }
  return (
    <>
      <Card shadow={t.glow} offset={5}>
        <View style={styles.panel}>
          {WEEK_COLUMNS.map((column, col) => (
            <View key={column.key} style={styles.column}>
              <Text style={[styles.letter, { color: palette.muted }]}>
                {column.letter}
              </Text>
              {grid.map((week) => {
                const day = week[col]
                return (
                  <View
                    key={day?.key}
                    style={[
                      styles.square,
                      { backgroundColor: day?.on ? ACID : t.off }
                    ]}
                  />
                )
              })}
            </View>
          ))}
        </View>
      </Card>
      <Text style={[text(12.5), styles.caption, { color: palette.muted }]}>
        Cada quadrado verde é um jogo assistido com código validado.
      </Text>

      {!all.length ? (
        <NoVisits />
      ) : !rows.length && searching ? (
        <NoMatch />
      ) : (
        byMonth(rows).map((group) => (
          <View key={group.key}>
            {/* Fora do celular o mês leva a contagem, como no design (A04). */}
            {!wide ? (
              <Text style={[styles.heading, { color: t.heading }]}>
                {group.label}
              </Text>
            ) : (
              <Header
                label={group.label}
                count={`${group.rows.length} ${group.rows.length === 1 ? 'jogo' : 'jogos'}`}
              />
            )}
            {group.rows.map((visit, i) => {
              const date = dayMonth(visit.startsAt)
              return (
                <Row
                  key={visit.eventId}
                  first={i === 0 || group.rows[i - 1]?.eventId === selected}
                  selected={visit.eventId === selected}
                  side={
                    <View style={styles.dateCol}>
                      <Text style={[styles.day, { color: palette.ink }]}>
                        {date.day}
                      </Text>
                      <Text style={[styles.mono, { color: palette.muted }]}>
                        {date.month}
                      </Text>
                    </View>
                  }
                  name={visit.barName}
                  line={gameTitle(visit)}
                  saved={isSaved(visit.barId)}
                  onOpen={
                    onSelect
                      ? () => onSelect(visit.barId, visit.eventId)
                      : visit.barActive
                        ? () => onOpen(visit.barId)
                        : undefined
                  }
                  onToggle={() => onToggle(visit.barId)}
                />
              )
            })}
          </View>
        ))
      )}
    </>
  )
}

function NoVisits() {
  const palette = usePalette()
  return (
    <View style={styles.empty}>
      <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
        Nenhum jogo com código validado ainda.
      </Text>
      <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
        Nos bares Elite, “Vou assistir aqui” dá um código que vale a oferta da
        casa no balcão. Validado, o jogo entra aqui.
      </Text>
    </View>
  )
}

function Saved({
  now,
  rows,
  searching,
  onOpen,
  onToggle,
  onExplore,
  selected,
  onSelect
}: {
  now: number
  rows: SavedRow[]
  searching: boolean
  onOpen: (barId: string) => void
  onToggle: (barId: string) => void
  onExplore: () => void
  /** Lado a lado: a linha tocada abre o bar na lembrança, como em "Já fui". */
  selected?: string | null
  onSelect?: (barId: string, key: string) => void
}) {
  const open = (barId: string, key: string) =>
    onSelect ? () => onSelect(barId, key) : () => onOpen(barId)
  const palette = usePalette()
  const t = tones(palette)
  const week = savedWeek(rows, now)
  return (
    <>
      <Card shadow={t.glow} offset={5}>
        <View style={styles.panel}>
          {week.days.map((day, i) => (
            <View key={day.key} style={styles.column}>
              <Text style={[styles.letter, { color: palette.muted }]}>
                {WEEK_LETTERS[i]}
              </Text>
              <View
                style={[
                  styles.date,
                  { backgroundColor: day.today ? ACID : t.off },
                  !day.today &&
                    day.count > 0 && { borderWidth: 1.5, borderColor: t.mark }
                ]}
              >
                <Text
                  style={[
                    styles.dateText,
                    {
                      color: day.today
                        ? INK
                        : day.count
                          ? palette.ink
                          : palette.muted
                    }
                  ]}
                >
                  {Number(day.key.slice(8))}
                </Text>
              </View>
              {/* Um ponto por jogo, até três: vermelho hoje, acid no resto. */}
              <View style={styles.dots}>
                {['a', 'b', 'c'].slice(0, day.count).map((k) => (
                  <View
                    key={k}
                    style={[
                      styles.dotSmall,
                      { backgroundColor: day.today ? LIVE : t.mark }
                    ]}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </Card>
      <Text style={[text(12.5), styles.caption, { color: palette.muted }]}>
        {week.groups.length
          ? `Jogos nos seus salvos esta semana.${week.today ? ` Hoje tem ${week.today}.` : ''}`
          : 'Nenhum jogo nos seus salvos esta semana.'}
      </Text>

      {!rows.length && !searching ? (
        <View style={styles.empty}>
          <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
            Nenhum bar salvo ainda.
          </Text>
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            Toque no coração de um bar, no mapa ou na página dele, para ver aqui
            os jogos da semana de lá.
          </Text>
          <PillButton label="Procurar bares" onPress={onExplore} />
        </View>
      ) : !rows.length ? (
        <NoMatch />
      ) : (
        <>
          {week.groups.map((group) => (
            <View key={group.key}>
              <Header
                label={group.label}
                count={`${group.games.length} ${group.games.length === 1 ? 'jogo' : 'jogos'}`}
              />
              {group.games.map(({ saved: s, game }, i) => {
                const when = gameWhen(game, now)
                return (
                  <Row
                    key={game.id}
                    first={i === 0 || group.games[i - 1]?.game.id === selected}
                    selected={game.id === selected}
                    side={
                      <View style={styles.timeCol}>
                        {when.live ? (
                          <Text style={[styles.now, { color: palette.live }]}>
                            {when.time}
                          </Text>
                        ) : (
                          <>
                            <Text style={[styles.time, { color: palette.ink }]}>
                              {when.time}
                            </Text>
                            <Text
                              style={[
                                styles.mono,
                                { color: palette.muted, marginTop: 3 }
                              ]}
                            >
                              {when.day}
                            </Text>
                          </>
                        )}
                      </View>
                    }
                    name={s.bar.name}
                    line={gameTitle(game)}
                    saved
                    onOpen={open(s.barId, game.id)}
                    onToggle={() => onToggle(s.barId)}
                  />
                )
              })}
            </View>
          ))}
          {week.idle.length ? (
            <View>
              <Header
                label="Sem jogo"
                count={`${week.idle.length} ${week.idle.length === 1 ? 'bar' : 'bares'}`}
              />
              {week.idle.map((s, i) => {
                return (
                  <Row
                    key={s.barId}
                    first={
                      i === 0 || `idle:${week.idle[i - 1]?.barId}` === selected
                    }
                    selected={`idle:${s.barId}` === selected}
                    side={
                      <View style={styles.timeCol}>
                        <View
                          style={[
                            styles.dash,
                            { backgroundColor: palette.muted }
                          ]}
                        />
                      </View>
                    }
                    name={s.bar.name}
                    line={`${s.bar.neighborhood} · ${
                      s.bar.events.length
                        ? 'sem jogo esta semana'
                        : 'sem jogo publicado'
                    }`}
                    saved
                    onOpen={open(s.barId, `idle:${s.barId}`)}
                    onToggle={() => onToggle(s.barId)}
                  />
                )
              })}
            </View>
          ) : null}
        </>
      )}
    </>
  )
}

/** A barra do resumo: acid o bairro com mais bares, papel o segundo, cinza o resto. */
const segmentColor = (palette: Palette, i: number) =>
  i === 0 ? ACID : i === 1 ? palette.ink : palette.dark ? '#55554f' : '#c9c5bc'

function Bars({
  all,
  rows,
  searching,
  onOpen,
  onToggle,
  selected,
  onSelect
}: {
  all: ReturnType<typeof yourBars>
  rows: YourBar[]
  searching: boolean
  onOpen: (barId: string) => void
  onToggle: (barId: string) => void
  /** Lado a lado: a linha tocada abre o bar na lembrança, como em "Já fui". */
  selected?: string | null
  onSelect?: (barId: string, key: string) => void
}) {
  const palette = usePalette()
  const t = tones(palette)
  const [sort, setSort] = useState<BarSort>('bairro')
  const sorts: [BarSort, string][] = [
    ['bairro', 'Bairro'],
    ['perto', 'Perto'],
    ['az', 'A–Z']
  ]
  if (!all.bars.length)
    return (
      <View style={styles.empty}>
        <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
          Nenhum bar salvo ainda.
        </Text>
        <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
          Toque no coração de um bar, no mapa ou na página dele, para guardar
          aqui, por bairro.
        </Text>
      </View>
    )
  return (
    <>
      <Card shadow={t.glow} offset={5}>
        <View style={styles.summary}>
          <View style={styles.summaryTop}>
            <Text style={[text(14, 'Bold'), { color: palette.ink }]}>
              {all.bars.length} {all.bars.length === 1 ? 'bar' : 'bares'} em{' '}
              {all.neighborhoods.length}{' '}
              {all.neighborhoods.length === 1 ? 'bairro' : 'bairros'}
            </Text>
            {all.nearest !== null ? (
              <Text style={[text(12), { color: palette.muted }]}>
                Mais perto: {formatKm(all.nearest)}
              </Text>
            ) : null}
          </View>
          <View style={styles.split}>
            {all.neighborhoods.map((n, i) => (
              <View
                key={n.name}
                style={[
                  styles.splitPart,
                  { flex: n.count, backgroundColor: segmentColor(palette, i) }
                ]}
              />
            ))}
          </View>
          <View style={styles.legend}>
            {all.neighborhoods.map((n, i) => (
              <View key={n.name} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: segmentColor(palette, i) }
                  ]}
                />
                <Text
                  style={[text(12.5, 'Regular', 1.2), { color: palette.ink }]}
                >
                  {n.name}
                </Text>
                <Text style={[styles.legendCount, { color: palette.ink }]}>
                  {n.count}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>
      <View style={styles.sortRow}>
        <Text style={[text(12.5), { color: palette.muted }]}>
          {sort === 'bairro'
            ? 'Por bairro'
            : sort === 'perto'
              ? 'Mais perto primeiro'
              : 'De A a Z'}
        </Text>
        <View style={styles.sorts}>
          {sorts.map(([key, label]) => (
            <FilterChip
              key={key}
              label={label}
              on={sort === key}
              raised
              onPress={() => setSort(key)}
            />
          ))}
        </View>
      </View>
      {!rows.length && searching ? (
        <NoMatch />
      ) : (
        barGroups(rows, all.neighborhoods, sort)
          .filter((group) => group.bars.length)
          .map((group) => (
            <View key={group.key}>
              {group.label ? (
                <Header
                  label={group.label}
                  count={`${group.bars.length} ${group.bars.length === 1 ? 'bar' : 'bares'}`}
                />
              ) : null}
              {group.bars.map((b, i) => (
                <Row
                  key={b.barId}
                  first={
                    i === 0 || `bar:${group.bars[i - 1]?.barId}` === selected
                  }
                  selected={`bar:${b.barId}` === selected}
                  gap={13}
                  pad={11}
                  side={
                    <Photo
                      uri={b.photoUrl}
                      name={b.name}
                      style={styles.thumb}
                    />
                  }
                  name={b.name}
                  line={
                    sort === 'bairro' || b.km === null
                      ? b.km === null
                        ? b.neighborhood
                        : formatKm(b.km)
                      : `${b.neighborhood} · ${formatKm(b.km)}`
                  }
                  extra={
                    <View style={styles.times}>
                      {b.visits ? (
                        <>
                          <Text
                            style={[styles.timesNumber, { color: palette.ink }]}
                          >
                            {b.visits}×
                          </Text>
                          <Text
                            style={[
                              styles.timesLabel,
                              { color: palette.muted }
                            ]}
                          >
                            FOI
                          </Text>
                        </>
                      ) : (
                        <Text style={[styles.never, { color: palette.muted }]}>
                          {'NUNCA\nFOI'}
                        </Text>
                      )}
                    </View>
                  }
                  saved={b.saved}
                  onOpen={
                    onSelect
                      ? () => onSelect(b.barId, `bar:${b.barId}`)
                      : b.active
                        ? () => onOpen(b.barId)
                        : undefined
                  }
                  onToggle={() => onToggle(b.barId)}
                />
              ))}
            </View>
          ))
      )}
    </>
  )
}

function Header({ label, count }: { label: string; count: string }) {
  const palette = usePalette()
  return (
    <View style={styles.headerRow}>
      <Text
        style={[
          styles.heading,
          styles.flush,
          { color: tones(palette).heading }
        ]}
      >
        {label}
      </Text>
      <Text style={[text(12.5), { color: palette.muted }]}>{count}</Text>
    </View>
  )
}

function NoMatch() {
  const palette = usePalette()
  return (
    <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
      Nada com esse nome, bairro ou jogo.
    </Text>
  )
}

const ROW_OUT = FadeOut.duration(160)
const ROW_MOVE = LinearTransition.duration(220).easing(EASE)

/** Uma linha das duas listas: a coluna da data ou da hora, o bar e o coração. */
function Row({
  first,
  side,
  name,
  line,
  saved,
  onOpen,
  onToggle,
  extra,
  selected,
  gap = 14,
  pad = 12
}: {
  first: boolean
  /** A visita tocada no lado a lado: cartão com contorno e sombra acid. */
  selected?: boolean
  side: ReactNode
  name: string
  line: string
  saved: boolean
  /** Antes do coração: "2× FOI" na aba Bares. */
  extra?: ReactNode
  gap?: number
  pad?: number
  /** Sem ela (bar fora do ar), a linha não abre nada. */
  onOpen?: () => void
  onToggle: () => void
}) {
  const palette = usePalette()
  const press = usePressScale(0.98)
  return (
    // Tirar dos salvos: a linha sai em fade e as de baixo sobem.
    <Animated.View exiting={ROW_OUT} layout={ROW_MOVE}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${line}`}
        disabled={!onOpen}
        onPress={onOpen}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={selected && styles.pickedSlot}
      >
        {selected ? <HardShadow color={ACID} offset={3} radius={6} /> : null}
        <Animated.View
          style={[
            styles.row,
            { gap, paddingVertical: pad },
            !first &&
              !selected && { borderTopWidth: 1, borderTopColor: palette.line },
            selected && [
              styles.picked,
              {
                backgroundColor: palette.dark ? '#262621' : '#fff',
                borderColor: palette.dark ? 'rgba(241,238,230,.6)' : INK
              }
            ],
            press.style
          ]}
        >
          {side}
          <View style={styles.rowText}>
            <Text
              style={[text(15.5, 'Bold', 1.3), { color: palette.ink }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text
              style={[text(12.5), { color: palette.muted }]}
              numberOfLines={1}
            >
              {line}
            </Text>
          </View>
          {extra}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Tirar dos salvos' : 'Salvar bar'}
            accessibilityState={{ selected: saved }}
            hitSlop={12}
            onPress={onToggle}
          >
            {/* O coração estala ao mudar: a troca é a resposta do toque. */}
            <Animated.View key={String(saved)} entering={POP_FAST}>
              <SavedHeart on={saved} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  stack: { gap: 14 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  search: {
    height: 46,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16
  },
  searchInput: { flex: 1, height: 46, paddingVertical: 0 },
  segments: { flexDirection: 'row', padding: 4, borderRadius: 24 },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  badge: { paddingVertical: 3, paddingHorizontal: 5, borderRadius: 4 },
  badgeText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    lineHeight: 13
  },
  segmentOn: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  panel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  column: { alignItems: 'center', gap: 6 },
  letter: { fontFamily: 'GeistMono-SemiBold', fontSize: 10 },
  square: { width: 22, height: 22, borderRadius: 4 },
  date: {
    width: 34,
    height: 40,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dateText: { fontFamily: 'Anton', fontSize: 18 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dotSmall: { width: 5, height: 5, borderRadius: 2.5 },
  caption: { marginTop: -6 },
  empty: { gap: 16, marginTop: 10 },
  heading: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginTop: 6,
    marginBottom: 4
  },
  flush: { marginTop: 0, marginBottom: 0 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: 4
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  pickedSlot: { marginTop: 4, marginRight: 6, marginBottom: 7 },
  picked: {
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1.5
  },
  grow: { flex: 1, minWidth: 0 },
  cardRow: { flexDirection: 'row', gap: 12 },
  boardBody: { paddingHorizontal: 28, gap: 16 },
  boardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 20
  },
  searchOpen: { height: 50, borderRadius: 25 },
  sideBySide: { flex: 1, flexDirection: 'row' },
  sideTop: { flexDirection: 'row', justifyContent: 'flex-end' },
  floating: {
    position: 'absolute',
    right: 20,
    width: 368,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 20 }
  },
  floatingBody: { padding: 14 },
  cover: { flex: 1, backgroundColor: INK, paddingHorizontal: 22 },
  tableBottom: { flex: 1, paddingTop: 14, gap: 12 },
  tableTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20
  },
  tableCards: { flexGrow: 0 },
  tableCardsBody: { gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  wideTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 24
  },
  wideSearch: { width: 420 },
  wideColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 24,
    marginTop: 12
  },
  wideColumn: { flex: 1, minWidth: 0 },
  columnHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 10,
    borderBottomWidth: 2
  },
  columnTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginVertical: -6
  },
  columnSub: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  columnBody: { gap: 14, paddingTop: 14 },
  thumb: { width: 50, height: 50, borderRadius: 3 },
  times: { width: 40, alignItems: 'flex-end' },
  timesNumber: { fontFamily: 'Anton', fontSize: 20, marginVertical: -4 },
  timesLabel: { fontFamily: 'GeistMono-SemiBold', fontSize: 9.5, marginTop: 2 },
  never: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'right'
  },
  summary: { padding: 14, gap: 12 },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  split: { flexDirection: 'row', gap: 3, height: 12 },
  splitPart: { borderRadius: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, columnGap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendCount: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -2
  },
  sorts: { flexDirection: 'row', gap: 6 },
  rowText: { flex: 1, minWidth: 0 },
  dateCol: { width: 44, alignItems: 'center' },
  timeCol: { width: 52, alignItems: 'center' },
  day: { fontFamily: 'Anton', fontSize: 26, marginVertical: -5 },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 10, marginTop: 2 },
  now: { fontFamily: 'Anton', fontSize: 20 },
  time: { fontFamily: 'Anton', fontSize: 22, marginVertical: -5 },
  dash: { width: 12, height: 1.5, opacity: 0.6 }
})
