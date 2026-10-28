import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
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
import { Avatar, personLine } from '@/components/friends'
import { Glass } from '@/components/glass'
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
  const city = useCityBoard('bars', tab === 'global' || alone)
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

  const share = () => {
    const data = board.data
    const me = data?.rows.find((row) => row.me)
    if (!data || !me) return
    haptic.select()
    Share.share({
      message: `Estou em ${me.position}º no ranking de ${monthLabel(data.month).toLowerCase()} entre amigos na Onside, com ${me.value} ${unit(data.metric, me.value)}. https://onside.sh`
    })
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 13, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <View style={styles.top}>
          <Title lines={[['Ranking']]} size={40} color={palette.ink} />
          {alone || tab === 'global' ? (
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
          )}
        </View>

        <Segments
          tab={tab}
          onPick={(next) => {
            if (next === 'communities')
              return soon.show('As comunidades chegam em breve')
            if (next === tab) return
            haptic.select()
            setTab(next)
          }}
        />

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
            onNewBars={() => router.push('/bares-pra-voce')}
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
  onNewBars
}: {
  data: Board
  metric: Metric
  onMetric: (metric: Metric) => void
  onOpen: (row: Row) => void
  onNewBars: () => void
}) {
  const palette = usePalette()
  const friends = data.rows.length - 1
  const near = data.rows.filter((r) => r.position >= 4 && r.position <= 6)
  const rest = data.rows.filter((r) => r.position > 6)
  return (
    <View style={styles.stack}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chips}
      >
        {METRICS.map((m) => (
          <FilterChip
            key={m.key}
            label={m.label}
            raised
            on={metric === m.key}
            onPress={() => onMetric(m.key)}
          />
        ))}
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
      {/* Trocar de métrica troca o placar em fade curto, sem salto. */}
      <Animated.View key={data.metric} entering={SWAP} style={styles.stack}>
        <Podium rows={data.rows} metric={data.metric} onOpen={onOpen} />
        {data.chase ? (
          <View style={styles.chaseWrap}>
            <Card shadow={palette.liveShadow} offset={5} soft>
              <View style={styles.chase}>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text
                    style={[text(14.5, 'Bold', 1.35), { color: palette.ink }]}
                  >
                    {chaseLabel(data.metric, data.chase.need, data.chase.name)}
                  </Text>
                  <View
                    style={[styles.track, { backgroundColor: palette.mark }]}
                  >
                    <View
                      style={[
                        styles.fill,
                        {
                          width: `${Math.round((data.chase.mine / (data.chase.mine + data.chase.need)) * 100)}%`
                        }
                      ]}
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
                  onPress={() => onOpen(row)}
                />
              ))}
            </View>
          </Card>
        ) : null}
      </Animated.View>
      <Card soft>
        <View style={styles.rule}>
          <Icon name="ranking" size={24} color={palette.ink} />
          <Text
            style={[
              text(13, 'Regular', 1.4),
              { flex: 1, color: palette.muted }
            ]}
          >
            {RULES[data.metric]} {TIE_RULE}
          </Text>
        </View>
      </Card>
    </View>
  )
}

// O pódio do design: o 1º no meio, mais alto e em acid; você em tinta.
const STEP = { 1: 92, 2: 64, 3: 44 } as const

function Podium({
  rows,
  metric,
  onOpen
}: {
  rows: Row[]
  metric: Metric
  onOpen: (row: Row) => void
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
            onPress={() => onOpen(row)}
          />
        ) : (
          <Ghost key={place} height={STEP[place] - 8} />
        )
      })}
    </View>
  )
}

function Step({
  row,
  place,
  metric,
  onPress
}: {
  row: Row
  place: 1 | 2 | 3
  metric: Metric
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
        <Avatar
          id={row.id}
          name={row.name}
          image={row.image}
          me={row.me}
          size={first ? 64 : 52}
        />
        <Text
          numberOfLines={1}
          style={[text(13.5, 'Bold', 1.2), { color: palette.ink }]}
        >
          {row.me ? 'Você' : firstName(row.name)}
        </Text>
        <Text
          style={[
            styles.value,
            { fontSize: first ? 26 : 21, color: palette.ink }
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
              { height: STEP[place], backgroundColor: block.bg }
            ]}
          >
            <Text style={[styles.place, { color: block.fg }]}>{place}</Text>
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
  onPress
}: {
  row: Row
  first: boolean
  near?: boolean
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 12 },
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
