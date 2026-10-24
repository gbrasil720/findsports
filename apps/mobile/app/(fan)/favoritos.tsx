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
  Text,
  TextInput,
  View
} from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { G, Path } from 'react-native-svg'
import { Card, FilterChip } from '@/components/card'
import { type Palette, Photo, usePalette } from '@/components/explore'
import { useExploreState, useShotSource } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import {
  EASE,
  haptic,
  POP_FAST,
  SWAP,
  usePressScale
} from '@/components/motion'
import { useTabBarSpace } from '@/components/tab-bar'
import {
  ACCENT,
  ACID,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PillButton,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { distanceKm, formatKm, searchCenter } from '@/lib/explore'
import { useFavorites } from '@/lib/favorites'
import { trpc } from '@/lib/trpc'
import {
  type BarSort,
  barGroups,
  byMonth,
  dayMonth,
  gameWhen,
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
type VisitRow = Outputs['attendance']['visits'][number]
type SavedRow = Outputs['pubs']['getFavorites'][number]
type Tab = 'visits' | 'saved' | 'bars'

export default function YourBars() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
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
  const query =
    tab === 'visits'
      ? visits
      : tab === 'saved'
        ? saved
        : visits.isPending || visits.isError
          ? visits
          : saved

  const pull = usePullRefresh(() =>
    Promise.all([visits.refetch(), saved.refetch()])
  )

  return (
    <View
      ref={shotSource.ref}
      collapsable={false}
      style={[styles.screen, { backgroundColor: palette.bg }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        onScrollEndDrag={shotSource.again}
        onMomentumScrollEnd={shotSource.again}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 4, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        {/* O título com a lupa ao lado, na altura das outras telas. O
            voltar do design não entra: aqui a tela é a raiz da aba. */}
        <View style={styles.top}>
          <Title lines={[['Seus bares']]} size={42} color={palette.ink} />
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
        </View>

        {search !== null ? (
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
        ) : null}

        <Segments
          palette={palette}
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

        {query.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : query.isError ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir seus bares.
            </Text>
            <PillButton
              label="Tentar de novo"
              onPress={() => query.refetch()}
            />
          </View>
        ) : (
          // Trocar de aba troca o conteúdo em fade curto, sem salto.
          <Animated.View key={tab} entering={SWAP} style={styles.stack}>
            {tab === 'bars' ? (
              <Bars
                palette={palette}
                all={mine}
                rows={barRows}
                searching={Boolean(term)}
                onOpen={openBar}
                onToggle={toggleSaved}
              />
            ) : tab === 'visits' ? (
              <Visits
                palette={palette}
                now={now}
                all={visits.data ?? []}
                rows={visitRows}
                searching={Boolean(term)}
                isSaved={(id) => favorites.ids.has(id)}
                onOpen={openBar}
                onToggle={toggleSaved}
              />
            ) : (
              <Saved
                palette={palette}
                now={now}
                rows={savedRows}
                searching={Boolean(term)}
                onOpen={openBar}
                onToggle={toggleSaved}
                onExplore={() => router.navigate('/explore')}
              />
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  )
}

/** "Já fui 9", "Salvos 6", "Bares 8": as três abas no vidro, com o número num selo. */
function Segments({
  palette,
  tab,
  visits,
  saved,
  bars,
  onPick
}: {
  palette: Palette
  tab: Tab
  visits: number
  saved: number
  bars: number
  onPick: (tab: Tab) => void
}) {
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
  palette,
  now,
  all,
  rows,
  searching,
  isSaved,
  onOpen,
  onToggle
}: {
  palette: Palette
  now: number
  all: VisitRow[]
  rows: VisitRow[]
  searching: boolean
  isSaved: (barId: string) => boolean
  onOpen: (barId: string) => void
  onToggle: (barId: string) => void
}) {
  const t = tones(palette)
  const grid = visitGrid(all, now)
  return (
    <>
      <Card palette={palette} shadow={t.glow} offset={5}>
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
        <View style={styles.empty}>
          <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
            Nenhum jogo com código validado ainda.
          </Text>
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            Nos bares Elite, “Vou assistir aqui” dá um código que vale a oferta
            da casa no balcão. Validado, o jogo entra aqui.
          </Text>
        </View>
      ) : !rows.length && searching ? (
        <NoMatch palette={palette} />
      ) : (
        byMonth(rows).map((group) => (
          <View key={group.key}>
            <Text style={[styles.heading, { color: t.heading }]}>
              {group.label}
            </Text>
            {group.rows.map((visit, i) => {
              const date = dayMonth(visit.startsAt)
              return (
                <Row
                  key={visit.eventId}
                  palette={palette}
                  first={i === 0}
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
                    visit.barActive ? () => onOpen(visit.barId) : undefined
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

function Saved({
  palette,
  now,
  rows,
  searching,
  onOpen,
  onToggle,
  onExplore
}: {
  palette: Palette
  now: number
  rows: SavedRow[]
  searching: boolean
  onOpen: (barId: string) => void
  onToggle: (barId: string) => void
  onExplore: () => void
}) {
  const t = tones(palette)
  const week = savedWeek(rows, now)
  return (
    <>
      <Card palette={palette} shadow={t.glow} offset={5}>
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
        <NoMatch palette={palette} />
      ) : (
        <>
          {week.groups.map((group) => (
            <View key={group.key}>
              <Header
                palette={palette}
                label={group.label}
                count={`${group.games.length} ${group.games.length === 1 ? 'jogo' : 'jogos'}`}
              />
              {group.games.map(({ saved: s, game }, i) => {
                const when = gameWhen(game, now)
                return (
                  <Row
                    key={game.id}
                    palette={palette}
                    first={i === 0}
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
                    onOpen={() => onOpen(s.barId)}
                    onToggle={() => onToggle(s.barId)}
                  />
                )
              })}
            </View>
          ))}
          {week.idle.length ? (
            <View>
              <Header
                palette={palette}
                label="Sem jogo"
                count={`${week.idle.length} ${week.idle.length === 1 ? 'bar' : 'bares'}`}
              />
              {week.idle.map((s, i) => {
                return (
                  <Row
                    key={s.barId}
                    palette={palette}
                    first={i === 0}
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
                    onOpen={() => onOpen(s.barId)}
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
  palette,
  all,
  rows,
  searching,
  onOpen,
  onToggle
}: {
  palette: Palette
  all: ReturnType<typeof yourBars>
  rows: YourBar[]
  searching: boolean
  onOpen: (barId: string) => void
  onToggle: (barId: string) => void
}) {
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
      <Card palette={palette} shadow={t.glow} offset={5}>
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
              palette={palette}
              label={label}
              on={sort === key}
              raised
              onPress={() => setSort(key)}
            />
          ))}
        </View>
      </View>
      {!rows.length && searching ? (
        <NoMatch palette={palette} />
      ) : (
        barGroups(rows, all.neighborhoods, sort)
          .filter((group) => group.bars.length)
          .map((group) => (
            <View key={group.key}>
              {group.label ? (
                <Header
                  palette={palette}
                  label={group.label}
                  count={`${group.bars.length} ${group.bars.length === 1 ? 'bar' : 'bares'}`}
                />
              ) : null}
              {group.bars.map((b, i) => (
                <Row
                  key={b.barId}
                  palette={palette}
                  first={i === 0}
                  gap={13}
                  pad={11}
                  side={
                    <Photo
                      uri={b.photoUrl}
                      name={b.name}
                      palette={palette}
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
                  onOpen={b.active ? () => onOpen(b.barId) : undefined}
                  onToggle={() => onToggle(b.barId)}
                />
              ))}
            </View>
          ))
      )}
    </>
  )
}

function Header({
  palette,
  label,
  count
}: {
  palette: Palette
  label: string
  count: string
}) {
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

function NoMatch({ palette }: { palette: Palette }) {
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
  palette,
  first,
  side,
  name,
  line,
  saved,
  onOpen,
  onToggle,
  extra,
  gap = 14,
  pad = 12
}: {
  palette: Palette
  first: boolean
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
      >
        <Animated.View
          style={[
            styles.row,
            { gap, paddingVertical: pad },
            !first && { borderTopWidth: 1, borderTopColor: palette.line },
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
              <SavedHeart on={saved} palette={palette} />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  )
}

/** O coração do design: vermelho cheio salvo, apagado quando não. */
function SavedHeart({ on, palette }: { on: boolean; palette: Palette }) {
  const color = on ? palette.live : palette.muted
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <G opacity={on ? 1 : 0.25}>
        <Path
          d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z"
          fill={color}
        />
      </G>
      <Path
        d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z"
        fill={color}
      />
      <Path
        d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"
        fill={on ? palette.ink : palette.muted}
      />
    </Svg>
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
