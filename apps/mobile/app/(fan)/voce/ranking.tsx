import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, FilterChip } from '@/components/card'
import {
  type CityBoard,
  OffGlobal,
  PlaceRow,
  placeWidth,
  useCityBoard
} from '@/components/city-ranking'
import { FriendPage } from '@/components/friend-page'
import { Avatar, personLine } from '@/components/friends'
import { Glass } from '@/components/glass'
import { useLayout, useNavInsets } from '@/components/layout'
import { haptic, SWAP, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import { type Palette, usePalette } from '@/components/theme'
import {
  ACID,
  BlockButton,
  GlassRound,
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
import {
  chaseLabel,
  closesLabel,
  firstName,
  METRICS,
  type Metric,
  monthLabel,
  ordinal,
  RULES,
  TIE_RULE,
  topLabel,
  unit
} from '@/lib/ranking'
import { trpc } from '@/lib/trpc'

/*
 * Ranking do mês (13 do design: 10d com amigos, 11e sem). Você e os amigos
 * aceitos que deixam os amigos ver a atividade, pela métrica escolhida; a
 * conta, o empate e a virada no dia 1º são do servidor (`ranking.friends`).
 * A aba Global (10e, 27c; WEB-465) é a cidade do perfil (`ranking.city`): a
 * sua posição, o top e o "Ver todos" da lista inteira, ou o 27c para quem
 * não ligou "Aparecer no ranking global". As comunidades avisam "em breve".
 */

type Board = inferRouterOutputs<AppRouter>['ranking']['friends']
type Row = Board['rows'][number]
type Tab = 'friends' | 'global'

const PROFILE = '/voce/perfil' as Href
const CITY = '/voce/ranking-cidade' as Href

export default function Ranking() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const soon = useSoon()
  useStatusBar('auto')
  // `?aba=global` abre direto na cidade (navegador DEV, 27c).
  const { aba } = useLocalSearchParams<{ aba?: string }>()
  const [tab, setTab] = useState<Tab>(aba === 'global' ? 'global' : 'friends')
  const [metric, setMetric] = useState<Metric>('bars')
  const board = useQuery({
    ...trpc.ranking.friends.queryOptions({ metric }),
    placeholderData: keepPreviousData
  })
  const alone = board.data ? board.data.rows.length < 2 : false
  const layout = useLayout()
  const nav = useNavInsets()
  // Fora do celular a cidade aparece junto com os amigos.
  const phone = layout.kind === 'phone' || layout.kind === 'duoClosed'
  const city = useCityBoard('bars', tab === 'global' || alone || !phone)
  const head = city.data?.pages[0]
  // Fora do ranking global você não vê a sua posição (27c).
  const where =
    head === null
      ? null
      : head?.listed && head.position
        ? { city: head.city, position: head.position }
        : undefined
  const pull = usePullRefresh(() =>
    Promise.all([board.refetch(), city.isFetched ? city.refetch() : null])
  )
  const open = (row: Row) =>
    router.push(row.me ? PROFILE : (`/amigo/${row.id}` as Href))
  const newBars = () => router.push('/bares-pra-voce')
  const pick = (next: Tab | 'communities') => {
    if (next === 'communities')
      return soon.show('As comunidades chegam em breve')
    if (next === tab) return
    haptic.select()
    setTab(next)
  }

  const share = () => {
    const data = board.data
    const me = data?.rows.find((row) => row.me)
    if (!data || !me) return
    haptic.select()
    Share.share({
      message: `Estou em ${me.position}º no ranking de ${monthLabel(data.month).toLowerCase()} entre amigos na Onside, com ${me.value} ${unit(data.metric, me.value)}. https://onside.sh`
    })
  }

  const headButton =
    alone || tab === 'global' ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar amigos"
        hitSlop={8}
        onPress={() => router.push('/amigos')}
      >
        <GlassRound>
          <Icon name="userplus" size={18} color={palette.ink} />
        </GlassRound>
      </Pressable>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Compartilhar sua posição"
        hitSlop={8}
        onPress={share}
      >
        <GlassRound>
          <Icon name="share" size={18} color={palette.ink} />
        </GlassRound>
      </Pressable>
    )
  const ready = board.data && !alone ? board.data : null
  // Lado a lado, o amigo tocado abre na outra metade (A05: a lista numa
  // metade e a página tocada na outra). De início, o primeiro que não é você.
  const [chosen, setChosen] = useState<string | null>(null)
  const friend =
    ready?.rows.find((row) => row.id === chosen && !row.me) ??
    ready?.rows.find((row) => !row.me)
  const global = (
    <GlobalBody
      city={city}
      where={where}
      onAll={() => router.push(CITY)}
      onCity={() => router.push(where ? CITY : '/cidade')}
    />
  )
  const globalAlone = (
    <GlobalBody
      city={city}
      where={where}
      onAll={() => router.push(CITY)}
      onCity={() => router.push(where ? CITY : '/cidade')}
      top="none"
    />
  )
  const globalRows = (
    <GlobalBody
      city={city}
      where={where}
      onAll={() => router.push(CITY)}
      onCity={() => router.push(where ? CITY : '/cidade')}
      top="rows"
    />
  )
  const root = [
    styles.screen,
    {
      backgroundColor: palette.bg,
      paddingLeft: nav.left,
      paddingRight: nav.right
    }
  ]
  const refresh = <RefreshControl {...pull} tintColor={palette.muted} />

  // Tela de fora do Z Flip 8 (A05): a posição entre amigos e quanto falta.
  if (layout.kind === 'cover')
    return <Cover data={board.data} onNewBars={newBars} />

  // Na mesa (Duo em laptop, Flex Mode): o pódio e quanto falta em cima, o
  // resto da lista embaixo em duas colunas.
  if (layout.kind === 'table' && ready) {
    const below = ready.rows.filter((r) => r.position > 3)
    const half = Math.ceil(below.length / 2)
    const wide = layout.width > 800
    const tall = layout.split - insets.top > 400
    return (
      <View style={root}>
        <View
          style={[
            styles.tableTop,
            { height: layout.split, paddingTop: insets.top + 12 }
          ]}
        >
          <View
            style={[
              styles.tableLead,
              { justifyContent: tall ? 'center' : 'space-between' }
            ]}
          >
            <View style={{ gap: 8 }}>
              <Title lines={[['Ranking']]} size={30} color={palette.ink} />
              <Text style={[text(13), { color: palette.muted }]}>
                {monthLabel(ready.month)} · amigos ·{' '}
                {METRICS.find(
                  (m) => m.key === ready.metric
                )?.label.toLocaleLowerCase('pt-BR')}
              </Text>
            </View>
            <ChaseCard data={ready} onNewBars={newBars} />
          </View>
          <View style={{ width: tall ? 380 : wide ? 400 : 330 }}>
            <Podium
              rows={ready.rows}
              metric={ready.metric}
              onOpen={open}
              k={tall ? 1.22 : wide ? 1 : 0.88}
            />
          </View>
        </View>
        <View style={[styles.tableBottom, { marginTop: layout.gap }]}>
          <View style={styles.tableBar}>
            <View style={{ width: 360 }}>
              <Segments tab={tab} onPick={pick} />
            </View>
            <Text style={[text(12.5), { color: palette.muted }]}>
              {closesLabel(ready.closesInDays)}
            </Text>
          </View>
          <ScrollView
            contentContainerStyle={{ paddingBottom: tabBar + 24 }}
            refreshControl={refresh}
          >
            {tab === 'global' ? (
              global
            ) : (
              <View style={styles.tableRows}>
                {[below.slice(0, half), below.slice(half)].map((part) =>
                  part.length ? (
                    <View key={part[0]?.id} style={{ flex: 1, minWidth: 0 }}>
                      <Card soft>
                        <View style={styles.list}>
                          {part.map((row, index) => (
                            <ListRow
                              key={row.id}
                              row={row}
                              first={index === 0}
                              near
                              onPress={() => open(row)}
                            />
                          ))}
                        </View>
                      </Card>
                    </View>
                  ) : null
                )}
              </View>
            )}
          </ScrollView>
        </View>
        {soon.toast}
      </View>
    )
  }

  // Lado a lado. No 13″ e no Ultra deitados, Amigos, Comunidades e Global em
  // três colunas. No resto (tablet deitado, dobrável aberto), os amigos na
  // coluna da lista e Global ao lado, com o "em breve" das comunidades: no
  // design a lista é das comunidades e o lado, a comunidade tocada.
  if (layout.kind === 'split' && ready) {
    const friendsBoard = (
      <FriendsBoard
        data={ready}
        metric={metric}
        onMetric={setMetric}
        onOpen={open}
        onNewBars={newBars}
        bare={layout.wide}
      />
    )
    if (layout.wide)
      return (
        <View style={root}>
          <View style={[styles.wideTop, { paddingTop: insets.top + 24 }]}>
            <Title lines={[['Ranking']]} size={48} color={palette.ink} />
            <View style={styles.chipsRow}>
              <MetricChips metric={metric} onMetric={setMetric} />
            </View>
          </View>
          <View style={styles.wideColumns}>
            {(
              [
                [
                  'Amigos',
                  `${ready.rows.length - 1} · ${monthLabel(ready.month).toLocaleLowerCase('pt-BR')}`,
                  friendsBoard
                ],
                ['Comunidades', '', <SoonCard key="soon" />],
                ['Global', head?.listed ? head.city : '', globalRows]
              ] as const
            ).map(([title, sub, body]) => (
              <View key={title} style={styles.wideColumn}>
                <ColumnHead title={title} sub={sub} />
                <ScrollView
                  contentContainerStyle={[
                    styles.columnBody,
                    { paddingBottom: tabBar + 24 }
                  ]}
                  refreshControl={refresh}
                >
                  {body}
                </ScrollView>
              </View>
            ))}
          </View>
          {soon.toast}
        </View>
      )
    // Tablet deitado: a lista com 370 a 440 e a página no meio do resto,
    // com até 760; no dobrável, cada metade.
    const tablet =
      (Platform.OS === 'ios' && Platform.isPad) || layout.nav === 'rail'
    const list = layout.split - nav.left
    const page = layout.width - nav.left - nav.right - list - layout.gap
    const choose = (row: Row) => {
      if (row.me) return open(row)
      if (row.id === friend?.id) return
      haptic.select()
      setChosen(row.id)
    }
    return (
      <View style={[root, styles.row2]}>
        <ScrollView
          style={{ width: list, flexGrow: 0 }}
          contentContainerStyle={[
            styles.body,
            {
              paddingHorizontal: tablet ? 20 : 16,
              paddingTop: insets.top + (tablet ? 26 : 20),
              paddingBottom: tabBar + 24
            }
          ]}
          refreshControl={refresh}
        >
          <View style={styles.top}>
            <Title
              lines={[['Ranking']]}
              size={tablet ? 38 : 34}
              color={palette.ink}
            />
            {headButton}
          </View>
          <Segments tab={tab} onPick={pick} />
          {tab === 'global' ? (
            <Animated.View entering={SWAP} style={styles.stack}>
              {global}
            </Animated.View>
          ) : (
            <FriendsBoard
              data={ready}
              metric={metric}
              onMetric={setMetric}
              onOpen={choose}
              onNewBars={newBars}
              selected={friend?.id}
            />
          )}
        </ScrollView>
        <View
          style={[
            styles.page,
            {
              marginLeft: layout.gap,
              backgroundColor: palette.dark ? '#161613' : '#ebe8df'
            }
          ]}
        >
          {friend ? (
            <Animated.View
              key={friend.id}
              entering={SWAP}
              style={{
                flex: 1,
                width: tablet ? Math.min(760, page - 56) : '100%',
                alignSelf: 'center'
              }}
            >
              <FriendPage
                id={friend.id}
                via="search"
                pane={{ top: insets.top + 10, bottom: tabBar + 8 }}
              />
            </Animated.View>
          ) : null}
        </View>
        {soon.toast}
      </View>
    )
  }

  // Tablet em pé (A05): pódio largo com a meta ao lado; embaixo, a lista
  // inteira dos amigos e, ao lado, a posição na cidade.
  if (layout.kind === 'stack' && ready) {
    const content = layout.width - nav.left - nav.right - 56
    const big = content > 820
    return (
      <View style={root}>
        <ScrollView
          contentContainerStyle={[
            styles.stackBody,
            { paddingTop: insets.top + 28, paddingBottom: tabBar + 24 }
          ]}
          refreshControl={refresh}
        >
          <View style={styles.stackTop}>
            <Title lines={[['Ranking']]} size={52} color={palette.ink} />
            <View style={{ width: Math.min(440, content - 280) }}>
              <Segments tab={tab} onPick={pick} />
            </View>
          </View>
          {tab === 'global' ? (
            <Animated.View entering={SWAP} style={styles.stack}>
              {global}
            </Animated.View>
          ) : (
            <Animated.View entering={SWAP} style={{ gap: 16 }}>
              <View style={styles.stackMeta}>
                <View style={styles.chipsRow}>
                  <MetricChips metric={metric} onMetric={setMetric} />
                </View>
                <Text style={[text(12.5), { color: palette.muted }]}>
                  {monthLabel(ready.month)} ·{' '}
                  {closesLabel(ready.closesInDays).toLocaleLowerCase('pt-BR')}
                </Text>
              </View>
              <Animated.View key={ready.metric} entering={SWAP}>
                <Card
                  shadow={palette.dark ? 'rgba(201,241,53,.32)' : ACID}
                  offset={5}
                >
                  <View style={styles.hero}>
                    <View style={{ width: big ? 460 : 380 }}>
                      <Podium
                        rows={ready.rows}
                        metric={ready.metric}
                        onOpen={open}
                        k={big ? 1.2 : 1.05}
                      />
                    </View>
                    <Goal data={ready} onNewBars={newBars} />
                  </View>
                </Card>
              </Animated.View>
              <View style={styles.stackColumns}>
                <View style={{ flex: 56, gap: 12 }}>
                  <Section
                    title="Entre amigos"
                    sub={String(ready.rows.length - 1)}
                  />
                  <Card soft>
                    <View style={styles.list}>
                      {ready.rows.map((row, index) => (
                        <ListRow
                          key={row.id}
                          row={row}
                          first={index === 0}
                          near
                          mark={row.me}
                          onPress={() => open(row)}
                        />
                      ))}
                    </View>
                  </Card>
                  <RuleCard metric={ready.metric} />
                </View>
                <View style={{ flex: 44, gap: 12 }}>
                  <Section
                    title={head?.listed ? head.city : 'Global'}
                    sub="global"
                  />
                  {globalAlone}
                  <Section title="Comunidades" sub="" />
                  <SoonCard />
                  {/* O top da cidade não está no design em pé: vai no fim da
                      coluna dela, como no celular. */}
                  {head?.listed && head.rows.length ? (
                    <CityTop data={head} onAll={() => router.push(CITY)} />
                  ) : null}
                </View>
              </View>
            </Animated.View>
          )}
        </ScrollView>
        {soon.toast}
      </View>
    )
  }

  return (
    <View style={root}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 13, paddingBottom: tabBar + 24 },
          // Fora do celular, sem placar (carregando, erro, sem amigos): a
          // coluna do celular no meio da tela.
          !phone && styles.narrow
        ]}
        refreshControl={refresh}
      >
        <View style={styles.top}>
          <Title lines={[['Ranking']]} size={40} color={palette.ink} />
          {headButton}
        </View>

        <Segments tab={tab} onPick={pick} />

        {tab === 'global' ? (
          // Ligar o ranking global troca o 27c pela cidade no mesmo fade curto.
          <Animated.View
            key={head?.listed ? 'dentro' : 'fora'}
            entering={SWAP}
            style={styles.stack}
          >
            {city.isPending ? (
              <ActivityIndicator
                color={palette.ink}
                style={{ marginTop: 40 }}
              />
            ) : city.isError ? (
              <View style={styles.stack}>
                <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
                  Não deu para abrir o ranking.
                </Text>
                <PillButton
                  label="Tentar de novo"
                  onPress={() => city.refetch()}
                />
              </View>
            ) : head && !head.listed ? (
              <OffGlobal data={head} />
            ) : (
              <>
                <CityRow
                  data={where}
                  pending={false}
                  lead="Você está em"
                  // Sem cidade no perfil, o toque leva a escolher uma.
                  onPress={() => router.push(where ? CITY : '/cidade')}
                />
                {head?.listed && head.rows.length ? (
                  <CityTop data={head} onAll={() => router.push(CITY)} />
                ) : null}
                <Text
                  style={[text(13, 'Regular', 1.4), { color: palette.muted }]}
                >
                  {RULES.bars} {TIE_RULE}
                </Text>
              </>
            )}
          </Animated.View>
        ) : board.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : board.isError || !board.data ? (
          <View style={styles.stack}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir o ranking.
            </Text>
            <PillButton
              label="Tentar de novo"
              onPress={() => board.refetch()}
            />
          </View>
        ) : alone ? (
          <Animated.View entering={SWAP} style={styles.stack}>
            <EmptyPodium me={board.data.rows[0]} />
            <View style={{ gap: 8, marginTop: 4 }}>
              <Title
                lines={[['Sozinho no pódio'], ['', 'não tem graça.']]}
                size={32}
                color={palette.ink}
                accentColor={palette.hot}
              />
              <Text
                style={[text(15, 'Regular', 1.45), { color: palette.muted }]}
              >
                Adicione amigos para ver quem vai a mais bares no mês. O ranking
                fecha todo dia 1º.
              </Text>
            </View>
            <BlockButton
              label="Adicionar amigos"
              leading="userplus"
              leadingAccent={INK}
              onPress={() => router.push('/amigos')}
            />
            <OutlineButton
              label="Tenho um código de comunidade"
              onPress={() => soon.show('As comunidades chegam em breve')}
            />
            {where !== undefined || city.isPending ? (
              <CityRow
                data={where}
                pending={city.isPending}
                lead="Enquanto isso, você está em"
                onPress={() => setTab('global')}
              />
            ) : null}
          </Animated.View>
        ) : (
          <FriendsBoard
            data={board.data}
            metric={metric}
            onMetric={setMetric}
            onOpen={open}
            onNewBars={newBars}
          />
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

/** Amigos · Comunidades · Global, no vidro (o mesmo das abas de Seus bares). */
function Segments({
  tab,
  onPick
}: {
  tab: Tab
  onPick: (tab: Tab | 'communities') => void
}) {
  const palette = usePalette()
  const options: [Tab | 'communities', string][] = [
    ['friends', 'Amigos'],
    ['communities', 'Comunidades'],
    ['global', 'Global']
  ]
  return (
    <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.segments}>
      {options.map(([key, label]) => {
        const on = key === tab
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(key)}
            style={[
              styles.segment,
              on && [
                styles.segmentOn,
                {
                  backgroundColor: palette.dark
                    ? 'rgba(255,255,255,.14)'
                    : '#fff'
                }
              ]
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                text(14, on ? 'Bold' : 'Regular', 1.2),
                { color: on ? palette.ink : palette.muted }
              ]}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </Glass>
  )
}

function FriendsBoard({
  data,
  metric,
  onMetric,
  onOpen,
  onNewBars,
  bare,
  selected
}: {
  data: Board
  metric: Metric
  onMetric: (metric: Metric) => void
  onOpen: (row: Row) => void
  onNewBars: () => void
  /** Na coluna do 13″ deitado: as métricas e o mês ficam no cabeçalho. */
  bare?: boolean
  /** Lado a lado: o amigo aberto na outra metade, marcado na lista. */
  selected?: string
}) {
  const palette = usePalette()
  const friends = data.rows.length - 1
  const near = data.rows.filter((r) => r.position >= 4 && r.position <= 6)
  const rest = data.rows.filter((r) => r.position > 6)
  return (
    <View style={styles.stack}>
      {bare ? null : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
          >
            <MetricChips metric={metric} onMetric={onMetric} />
          </ScrollView>
          <View style={styles.meta}>
            <Text style={[text(12.5), { color: palette.muted }]}>
              {monthLabel(data.month)} · {friends}{' '}
              {friends === 1 ? 'amigo' : 'amigos'}
            </Text>
            <Text style={[text(12.5), { color: palette.muted }]}>
              {closesLabel(data.closesInDays)}
            </Text>
          </View>
        </>
      )}
      {/* Trocar de métrica troca o placar em fade curto, sem salto. */}
      <Animated.View key={data.metric} entering={SWAP} style={styles.stack}>
        <Podium
          rows={data.rows}
          metric={data.metric}
          onOpen={onOpen}
          selected={selected}
        />
        {data.chase ? (
          <View style={styles.chaseWrap}>
            <ChaseCard data={data} onNewBars={onNewBars} />
          </View>
        ) : null}
        {near.length ? (
          <Card soft>
            <View style={styles.list}>
              {near.map((row, index) => (
                <ListRow
                  key={row.id}
                  row={row}
                  first={index === 0}
                  near
                  mark={row.id === selected}
                  onPress={() => onOpen(row)}
                />
              ))}
            </View>
          </Card>
        ) : null}
        {rest.length ? (
          <Card soft>
            <View style={styles.list}>
              {rest.map((row, index) => (
                <ListRow
                  key={row.id}
                  row={row}
                  first={index === 0}
                  mark={row.id === selected}
                  onPress={() => onOpen(row)}
                />
              ))}
            </View>
          </Card>
        ) : null}
      </Animated.View>
      <RuleCard metric={data.metric} />
    </View>
  )
}

/** O que conta e o desempate (rodapé do 10d). */
function RuleCard({ metric }: { metric: Metric }) {
  const palette = usePalette()
  return (
    <Card soft>
      <View style={styles.rule}>
        <Icon name="ranking" size={24} color={palette.ink} />
        <Text
          style={[text(13, 'Regular', 1.4), { flex: 1, color: palette.muted }]}
        >
          {RULES[metric]} {TIE_RULE}
        </Text>
      </View>
    </Card>
  )
}

function MetricChips({
  metric,
  onMetric
}: {
  metric: Metric
  onMetric: (metric: Metric) => void
}) {
  return METRICS.map((m) => (
    <FilterChip
      key={m.key}
      label={m.label}
      raised
      on={metric === m.key}
      onPress={() => onMetric(m.key)}
    />
  ))
}

/** "Faltam 3 bares para passar Marina", a barra e "Bares novos" (10d). */
function ChaseCard({
  data,
  onNewBars
}: {
  data: Board
  onNewBars: () => void
}) {
  const palette = usePalette()
  if (!data.chase) return null
  return (
    <Card shadow={palette.liveShadow} offset={5} soft>
      <View style={styles.chase}>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={[text(14.5, 'Bold', 1.35), { color: palette.ink }]}>
            {chaseLabel(data.metric, data.chase.need, data.chase.name)}
          </Text>
          <View style={[styles.track, { backgroundColor: palette.mark }]}>
            <View
              style={[styles.fill, { width: `${chaseShare(data.chase)}%` }]}
            />
          </View>
        </View>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={onNewBars}
          style={styles.newBars}
        >
          <Text style={[text(13, 'Bold'), { color: palette.ink }]}>
            Bares novos
          </Text>
          <Icon name="next" size={12} color={palette.ink} />
        </Pressable>
      </View>
    </Card>
  )
}

const chaseShare = (chase: { mine: number; need: number }) =>
  Math.round((chase.mine / (chase.mine + chase.need)) * 100)

// O pódio do design: o 1º no meio, mais alto e em acid; você em tinta.
const STEP = { 1: 92, 2: 64, 3: 44 } as const

function Podium({
  rows,
  metric,
  onOpen,
  k = 1,
  selected
}: {
  rows: Row[]
  metric: Metric
  onOpen: (row: Row) => void
  /** Escala do pódio largo do tablet (A05): 1,05 a 1,22. */
  k?: number
  /** Lado a lado: o amigo aberto na outra metade. */
  selected?: string
}) {
  return (
    <View style={styles.podium}>
      {([2, 1, 3] as const).map((place) => {
        const row = rows.find((r) => r.position === place)
        return row ? (
          <Step
            key={place}
            row={row}
            place={place}
            metric={metric}
            k={k}
            on={row.id === selected}
            onPress={() => onOpen(row)}
          />
        ) : (
          <Ghost key={place} height={Math.round(STEP[place] * k) - 8} />
        )
      })}
    </View>
  )
}

function Step({
  row,
  place,
  metric,
  k,
  on,
  onPress
}: {
  row: Row
  place: 1 | 2 | 3
  metric: Metric
  k: number
  /** Aberto ao lado: o quadrinho ganha o contorno de tinta. */
  on?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePressScale()
  const first = place === 1
  const block = blockColors(palette, first, row.me)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place}º, ${row.me ? 'você' : row.name}, ${row.value} ${unit(metric, row.value)}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.column}
    >
      <Animated.View style={[styles.columnInner, press.style]}>
        <View
          style={
            on && [styles.stepOn, { borderColor: palette.dark ? PAPER : INK }]
          }
        >
          <Avatar
            id={row.id}
            name={row.name}
            image={row.image}
            me={row.me}
            size={Math.round((first ? 64 : 52) * k)}
          />
        </View>
        <Text
          numberOfLines={1}
          style={[
            text(Math.round(13.5 * Math.min(k, 1.15) * 2) / 2, 'Bold', 1.2),
            { color: palette.ink }
          ]}
        >
          {row.me ? 'Você' : firstName(row.name)}
        </Text>
        <Text
          style={[
            styles.value,
            { fontSize: Math.round((first ? 26 : 21) * k), color: palette.ink }
          ]}
        >
          {row.value}{' '}
          <Text style={[text(12, 'SemiBold', 1), { color: palette.muted }]}>
            {unit(metric, row.value)}
          </Text>
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: 2 }}>
          <View
            style={[
              styles.edge,
              { backgroundColor: first ? palette.edge : palette.line }
            ]}
          />
          <View
            style={[
              styles.block,
              { height: Math.round(STEP[place] * k), backgroundColor: block.bg }
            ]}
          >
            <Text
              style={[
                styles.place,
                { fontSize: Math.round(30 * k), color: block.fg }
              ]}
            >
              {place}
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  )
}

function blockColors(palette: Palette, first: boolean, me: boolean) {
  if (first) return { bg: ACID, fg: INK }
  if (me) return { bg: palette.ink, fg: palette.bg }
  return { bg: palette.mark, fg: palette.ink }
}

/** O lugar vazio do pódio: "?" e o degrau tracejados (11e). */
function Ghost({ height }: { height: number }) {
  const palette = usePalette()
  return (
    <View style={[styles.column, styles.columnInner, { gap: 8 }]}>
      <View style={[styles.ghostFace, { borderColor: palette.dash }]}>
        <Text style={[styles.ghostMark, { color: palette.dash }]}>?</Text>
      </View>
      <View style={[styles.ghostStep, { height, borderColor: palette.dash }]} />
    </View>
  )
}

/** Sozinho no pódio (11e): você no meio, em 1º, e dois lugares vazios. */
function EmptyPodium({ me }: { me: Row | undefined }) {
  return (
    <View style={[styles.podium, { paddingHorizontal: 18, paddingTop: 18 }]}>
      <Ghost height={56} />
      <View style={[styles.column, styles.columnInner, { gap: 8 }]}>
        <View style={styles.meRing}>
          <Avatar
            id={me?.id ?? 'me'}
            name={me?.name ?? ''}
            image={me?.image}
            me
            size={60}
          />
        </View>
        <View style={{ alignSelf: 'stretch' }}>
          <View style={[styles.edge, { backgroundColor: INK }]} />
          <View style={[styles.block, { height: 88, backgroundColor: ACID }]}>
            <Text style={[styles.place, { color: INK }]}>1</Text>
          </View>
        </View>
      </View>
      <Ghost height={40} />
    </View>
  )
}

function ListRow({
  row,
  first,
  near,
  mark,
  onPress
}: {
  row: Row
  first: boolean
  near?: boolean
  /** Você na lista inteira do tablet (A05): a linha em destaque. */
  mark?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.position}º, ${row.me ? 'você' : row.name}, ${row.value}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { gap: near ? 12 : 11 },
        !first && { borderTopWidth: 1, borderTopColor: palette.line },
        mark && [
          styles.mark,
          {
            backgroundColor: palette.dark ? '#262621' : '#fff',
            borderColor: palette.dark ? 'rgba(241,238,230,.6)' : INK,
            borderTopColor: palette.dark ? 'rgba(241,238,230,.6)' : INK
          }
        ],
        pressed && { opacity: 0.7 }
      ]}
    >
      {near ? (
        <Text style={[styles.nearPlace, { color: palette.muted }]}>
          {row.position}
        </Text>
      ) : (
        <Text style={[styles.restPlace, { color: palette.ink }]}>
          {row.position}
        </Text>
      )}
      <Avatar
        id={row.id}
        name={row.name}
        image={row.image}
        me={row.me}
        size={near ? 38 : 34}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}
        >
          {row.me ? 'Você' : row.name}
        </Text>
        {personLine(row) ? (
          <Text
            numberOfLines={1}
            style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
          >
            {personLine(row)}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.rowValue, { color: palette.ink }]}>{row.value}</Text>
      {near ? <Move move={row.move} /> : null}
    </Pressable>
  )
}

/** Subiu, ficou ou desceu desde uma semana atrás. */
function Move({ move }: { move: number | null }) {
  const palette = usePalette()
  if (move === null) return <View style={styles.moveBox} />
  if (move === 0)
    return (
      <View accessibilityLabel="Na mesma posição" style={styles.moveBox}>
        <View style={[styles.flat, { backgroundColor: palette.muted }]} />
      </View>
    )
  const up = move > 0
  return (
    <View accessibilityLabel={up ? 'Subiu' : 'Desceu'} style={styles.moveBox}>
      <View
        style={[
          styles.triangle,
          up
            ? { borderBottomColor: palette.dark ? ACID : '#4d7a00' }
            : {
                borderTopColor: LIVE,
                borderBottomWidth: 0,
                borderTopWidth: 7
              }
        ]}
      />
    </View>
  )
}

/** "Enquanto isso, você está em 1.284º em São Paulo" (11e). */
function CityRow({
  data,
  pending,
  lead,
  onPress
}: {
  data: { city: string; position: number } | null | undefined
  pending: boolean
  lead: string
  onPress?: () => void
}) {
  const palette = usePalette()
  if (pending) return null
  return (
    <Card soft>
      <Pressable
        accessibilityRole={onPress ? 'button' : 'text'}
        disabled={!onPress}
        onPress={onPress}
        style={({ pressed }) => [styles.rule, pressed && { opacity: 0.7 }]}
      >
        <Icon name="ranking" size={24} color={palette.ink} />
        <Text
          style={[text(13.5, 'Regular', 1.4), { flex: 1, color: palette.ink }]}
        >
          {data ? (
            <>
              {lead}{' '}
              <Text style={text(13.5, 'Bold', 1.4)}>
                {ordinal(data.position)}
              </Text>{' '}
              em {data.city}
            </>
          ) : (
            'Escolha sua cidade para ver sua posição nela.'
          )}
        </Text>
        {onPress ? <Icon name="next" size={12} color={palette.muted} /> : null}
      </Pressable>
    </Card>
  )
}

/** "Top de outubro · bares diferentes" e o "Ver todos" da lista (10e). */
function CityTop({ data, onAll }: { data: CityBoard; onAll: () => void }) {
  const palette = usePalette()
  const top = data.rows.slice(0, 5)
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.meta}>
        <Text style={[text(13.5), { color: palette.muted }]}>
          Top de {monthLabel(data.month).toLocaleLowerCase('pt-BR')} ·{' '}
          {data.metric === 'bars' ? 'bares diferentes' : 'jogos'}
        </Text>
        <Pressable
          accessibilityRole="link"
          hitSlop={10}
          onPress={() => {
            haptic.select()
            onAll()
          }}
          style={({ pressed }) => [styles.newBars, pressed && { opacity: 0.6 }]}
        >
          <Text style={[text(13.5, 'Bold'), { color: palette.ink }]}>
            Ver todos
          </Text>
          <Icon name="next" size={12} color={palette.ink} />
        </Pressable>
      </View>
      <Card soft>
        {top.map((row, index) => (
          <PlaceRow
            key={row.id}
            row={row}
            metric={data.metric}
            width={placeWidth(top)}
            first={index === 0}
          />
        ))}
      </Card>
    </View>
  )
}

function OutlineButton({
  label,
  onPress
}: {
  label: string
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[styles.outline, { borderColor: palette.ink }, press.style]}
      >
        <Icon name="qr" size={17} color={palette.ink} />
        <Text style={[text(14.5, 'Bold'), { color: palette.ink }]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

// --- Fora do celular (A05) ------------------------------------------------

/** "Entre amigos 12", o título de seção do tablet. */
function Section({ title, sub }: { title: string; sub: string }) {
  const palette = usePalette()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.hot }]}>{title}</Text>
      <Text style={[text(12.5), { color: palette.muted }]}>{sub}</Text>
    </View>
  )
}

/** O topo de cada coluna lado a lado: nome e o filete de tinta. */
function ColumnHead({ title, sub }: { title: string; sub: string }) {
  const palette = usePalette()
  return (
    <View style={[styles.columnHead, { borderBottomColor: palette.ink }]}>
      <Text style={[styles.columnTitle, { color: palette.ink }]}>{title}</Text>
      <Text style={[styles.columnSub, { color: palette.muted }]}>{sub}</Text>
    </View>
  )
}

/** Comunidades não existem: no lugar delas, o aviso do celular. */
function SoonCard() {
  const palette = usePalette()
  return (
    <Card soft>
      <View style={styles.rule}>
        <Icon name="people" size={24} color={palette.ink} />
        <Text
          style={[
            text(13.5, 'Regular', 1.4),
            { flex: 1, color: palette.muted }
          ]}
        >
          As comunidades chegam em breve
        </Text>
      </View>
    </Card>
  )
}

/** Ao lado do pódio largo: a sua posição e quanto falta para subir. */
function Goal({ data, onNewBars }: { data: Board; onNewBars: () => void }) {
  const palette = usePalette()
  const me = data.rows.find((row) => row.me)
  return (
    <View style={styles.goal}>
      {me ? (
        <Text style={[styles.kicker, { color: palette.hot }]}>
          VOCÊ ESTÁ EM {ordinal(me.position)}
        </Text>
      ) : null}
      {data.chase ? (
        <>
          <Text style={[text(20, 'Bold', 1.25), { color: palette.ink }]}>
            {chaseLabel(data.metric, data.chase.need, data.chase.name)}
          </Text>
          <View
            style={[styles.track, { height: 6, backgroundColor: palette.mark }]}
          >
            <View
              style={[styles.fill, { width: `${chaseShare(data.chase)}%` }]}
            />
          </View>
        </>
      ) : null}
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={onNewBars}
        style={({ pressed }) => [styles.newBars, pressed && { opacity: 0.6 }]}
      >
        <Text style={[text(13.5, 'Bold'), { color: palette.ink }]}>
          Ver bares novos perto
        </Text>
        <Icon name="next" size={12} color={palette.ink} />
      </Pressable>
    </View>
  )
}

/** A aba Global fora do celular: a sua posição em destaque e o top. */
function GlobalBody({
  city,
  where,
  onAll,
  onCity,
  top = 'list'
}: {
  city: ReturnType<typeof useCityBoard>
  where: { city: string; position: number } | null | undefined
  onAll: () => void
  onCity: () => void
  /**
   * Embaixo da posição: o top com "Ver todos" (aba Global), as linhas da
   * coluna Global do 13″ (`rows`) ou nada (coluna da cidade em pé).
   */
  top?: 'list' | 'rows' | 'none'
}) {
  const palette = usePalette()
  const head = city.data?.pages[0]
  if (city.isPending)
    return <ActivityIndicator color={palette.ink} style={{ marginTop: 24 }} />
  if (city.isError)
    return (
      <View style={styles.stack}>
        <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
          Não deu para abrir o ranking.
        </Text>
        <PillButton label="Tentar de novo" onPress={() => city.refetch()} />
      </View>
    )
  if (head && !head.listed) return <OffGlobal data={head} />
  return (
    <View style={styles.stack}>
      {head?.listed && head.position ? (
        <PosCard data={head} position={head.position} onPress={onAll} />
      ) : (
        <CityRow
          data={where}
          pending={false}
          lead="Você está em"
          onPress={onCity}
        />
      )}
      {!head?.listed || !head.rows.length || top === 'none' ? null : top ===
        'rows' ? (
        <GlobalRows rows={head.rows.slice(0, 6)} />
      ) : (
        <CityTop data={head} onAll={onAll} />
      )}
    </View>
  )
}

/** O top da cidade na coluna Global (A05): posição, quadrinho, nome e número. */
function GlobalRows({ rows }: { rows: CityBoard['rows'] }) {
  const palette = usePalette()
  return (
    <Card soft>
      <View style={styles.list}>
        {rows.map((row, index) => (
          <View
            key={row.id}
            accessible
            accessibilityLabel={`${row.position}º, ${row.me ? 'você' : row.name}, ${row.value}`}
            style={[
              styles.row,
              { gap: 12 },
              index > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
            ]}
          >
            <Text
              style={[
                styles.globalPlace,
                { color: index === 0 ? palette.hot : palette.ink }
              ]}
            >
              {row.position}
            </Text>
            <Avatar id={row.id} name={row.name} me={row.me} size={38} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}
              >
                {row.me ? 'Você' : row.name}
              </Text>
              {row.username ? (
                <Text
                  numberOfLines={1}
                  style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
                >
                  @{row.username}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.rowValue, { color: palette.ink }]}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

/** "Sua posição em São Paulo · 1.284º" (A05), no cartão de tinta. */
function PosCard({
  data,
  position,
  onPress
}: {
  data: CityBoard
  position: number
  /** A lista inteira da cidade (27a), o "Ver todos" do celular. */
  onPress: () => void
}) {
  const palette = usePalette()
  const me = data.around.find((row) => row.me)
  const move = data.weekMove
  return (
    <Card
      fill={palette.dark ? palette.card : INK}
      shadow={palette.dark ? 'rgba(201,241,53,.32)' : ACID}
      offset={5}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Abre a lista da cidade"
        onPress={() => {
          haptic.select()
          onPress()
        }}
        style={({ pressed }) => [styles.pos, pressed && { opacity: 0.8 }]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[text(12.5, 'SemiBold'), { color: '#aaa9a4' }]}>
            Sua posição em {data.city}
          </Text>
          <View style={styles.posLine}>
            <Text style={styles.posNumber}>
              {position.toLocaleString('pt-BR')}
            </Text>
            <Text style={styles.posMark}>º</Text>
          </View>
          <Text style={[text(13, 'Regular', 1.35), { color: '#d6d3cb' }]}>
            de {data.total.toLocaleString('pt-BR')}{' '}
            {data.total === 1 ? 'torcedor' : 'torcedores'}
            {me
              ? ` · ${me.value} ${unit(data.metric, me.value)} em ${monthLabel(data.month).toLocaleLowerCase('pt-BR')}`
              : ''}
          </Text>
        </View>
        <View style={styles.posSide}>
          <View style={styles.badge}>
            <Text style={[text(12, 'Bold'), { color: INK }]}>
              {topLabel(position, data.total)}
            </Text>
          </View>
          {move ? (
            <View style={styles.posMove}>
              <View
                style={[
                  styles.triangle,
                  move > 0
                    ? { borderBottomColor: ACID }
                    : {
                        borderTopColor: LIVE,
                        borderBottomWidth: 0,
                        borderTopWidth: 7
                      }
                ]}
              />
              <Text
                style={[text(12.5, 'Bold'), { color: move > 0 ? ACID : LIVE }]}
              >
                {Math.abs(move).toLocaleString('pt-BR')} na semana
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Card>
  )
}

/**
 * A tela de fora do Z Flip 8 (A05): a sua posição entre amigos e quanto
 * falta para passar quem está na frente. Sempre no escuro, como o design.
 */
function Cover({
  data,
  onNewBars
}: {
  data: Board | undefined
  onNewBars: () => void
}) {
  const insets = useSafeAreaInsets()
  const me = data?.rows.find((row) => row.me)
  const friends = (data?.rows.length ?? 1) - 1
  // Quem está logo acima, ou logo abaixo de quem lidera.
  const other =
    data?.rows.find(
      (row) => !row.me && me && row.position === Math.max(1, me.position - 1)
    ) ?? data?.rows.find((row) => !row.me)
  return (
    <View style={[styles.cover, { paddingTop: insets.top + 20 }]}>
      {!data || !me ? (
        <ActivityIndicator color={PAPER} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Text style={[styles.kicker, { color: ACID }]}>
            RANKING · {monthLabel(data.month).toLocaleUpperCase('pt-BR')}
          </Text>
          <View style={styles.coverRank}>
            <Text style={styles.coverPlace}>{ordinal(me.position)}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text(15, 'Bold', 1.3), { color: PAPER }]}>
                entre {friends} {friends === 1 ? 'amigo' : 'amigos'}
              </Text>
              <Text
                numberOfLines={2}
                style={[text(12.5, 'Regular', 1.35), { color: '#aaa9a4' }]}
              >
                {me.value} {unit(data.metric, me.value)}
                {other ? ` · ${firstName(other.name)} tem ${other.value}` : ''}
              </Text>
            </View>
          </View>
          {data.chase ? (
            <>
              <View style={[styles.track, styles.coverTrack]}>
                <View
                  style={[styles.fill, { width: `${chaseShare(data.chase)}%` }]}
                />
              </View>
              <Text style={[text(13, 'Regular', 1.4), { color: '#d6d3cb' }]}>
                {chaseLabel(data.metric, data.chase.need, data.chase.name)}.
              </Text>
            </>
          ) : null}
          <View style={[styles.coverPill, { bottom: insets.bottom + 26 }]}>
            <PillButton
              label="Bares novos"
              height={50}
              edge="#000"
              onPress={onNewBars}
            />
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 12 },
  narrow: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  // Fora do celular (A05).
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  sectionTitle: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginVertical: -5
  },
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
  chipsRow: { flexDirection: 'row', gap: 6 },
  wideTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 20,
    paddingHorizontal: 24,
    paddingBottom: 22
  },
  wideColumns: {
    flex: 1,
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 24
  },
  wideColumn: { flex: 1, minWidth: 0, gap: 12 },
  columnBody: { gap: 12, paddingTop: 2 },
  row2: { flexDirection: 'row' },
  page: { flex: 1, overflow: 'hidden' },
  stackBody: { paddingHorizontal: 28, gap: 16 },
  stackTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 20
  },
  stackMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 28,
    paddingTop: 18,
    paddingHorizontal: 20
  },
  goal: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'center',
    gap: 12,
    paddingBottom: 16
  },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66
  },
  stackColumns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  pos: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  posLine: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  posNumber: {
    fontFamily: 'Anton',
    fontSize: 52,
    color: ACID,
    marginVertical: -12
  },
  posMark: { fontFamily: 'Archivo-Bold', fontSize: 22, color: ACID },
  posSide: { alignItems: 'flex-end', gap: 8 },
  posMove: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  globalPlace: { width: 26, fontFamily: 'Anton', fontSize: 20 },
  badge: {
    backgroundColor: ACID,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  tableTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 24,
    paddingHorizontal: 24,
    overflow: 'hidden'
  },
  tableLead: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    gap: 18,
    paddingBottom: 16
  },
  tableBottom: { flex: 1, paddingTop: 14, paddingHorizontal: 20, gap: 12 },
  tableBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16
  },
  tableRows: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cover: { flex: 1, backgroundColor: INK, paddingHorizontal: 22, gap: 12 },
  coverRank: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  coverPlace: {
    fontFamily: 'Anton',
    fontSize: 72,
    color: ACID,
    marginVertical: -16
  },
  coverTrack: { height: 6, backgroundColor: '#2c2c27' },
  coverPill: { position: 'absolute', right: 22, width: 160 },

  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  stack: { gap: 12 },
  segments: { flexDirection: 'row', padding: 4, borderRadius: 24 },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  segmentOn: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  chipsScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 6, paddingHorizontal: 16, paddingRight: 20 },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: -2
  },
  podium: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 4
  },
  column: { flex: 1, minWidth: 0 },
  columnInner: { alignItems: 'center', gap: 6 },
  value: { fontFamily: 'Anton' },
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 4,
    right: -4,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6
  },
  block: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    alignItems: 'center',
    paddingTop: 8
  },
  place: { fontFamily: 'Anton', fontSize: 30 },
  ghostFace: {
    width: 48,
    height: 48,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center'
  },
  ghostMark: { fontFamily: 'Anton', fontSize: 20 },
  ghostStep: {
    alignSelf: 'stretch',
    borderWidth: 2,
    borderBottomWidth: 0,
    borderStyle: 'dashed',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6
  },
  stepOn: { borderRadius: 9, borderWidth: 2, margin: -4, padding: 2 },
  meRing: { borderRadius: 9, borderWidth: 2.5, borderColor: ACID },
  chaseWrap: { marginTop: -12 },
  chase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14
  },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: LIVE },
  newBars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  list: { paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  nearPlace: { width: 20, fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  restPlace: { width: 44, fontFamily: 'Anton', fontSize: 20 },
  rowValue: { fontFamily: 'Anton', fontSize: 20 },
  // A sua linha na lista inteira (A05): papel, contorno e a sombra acid.
  mark: {
    borderWidth: 1.5,
    borderTopWidth: 1.5,
    borderRadius: 6,
    marginHorizontal: -6,
    marginVertical: 4,
    paddingHorizontal: 8.5,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  moveBox: { width: 12, alignItems: 'center', justifyContent: 'center' },
  flat: { width: 10, height: 2, borderRadius: 1 },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent'
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  outline: {
    height: 50,
    borderRadius: 6,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  }
})
