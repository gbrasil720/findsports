import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { useDeferredValue, useEffect, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native'
import MapView, { Circle, Marker } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import {
  dayLabel,
  type Palette,
  Photo,
  PinTag,
  usePalette
} from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { haptic } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import {
  formatKm,
  formatTime,
  isLive,
  searchCenter,
  teamMark
} from '@/lib/explore'
import { dayKey, TELAO, toggleAmenity } from '@/lib/filters'
import { MAP_STYLE } from '@/lib/map-style'
import {
  type Hood,
  highlight,
  hoods,
  liveNow,
  matchName,
  matchQuery,
  type NearBar,
  rememberSearch,
  sides,
  tonight
} from '@/lib/search'
import { trpc } from '@/lib/trpc'

/*
 * Busca (19a e 19b do design). Sem texto: buscas recentes, o jogo rolando
 * agora, a noite em pôsteres e os bairros em recortes de mapa. Digitando:
 * sugestões, o bairro como melhor resultado e os bares. Bar, bairro e jogo
 * casam no aparelho, sobre os bares perto; time e campeonato vão também ao
 * servidor (`pubs.search` com `championship`, que casa nome do bar, times e
 * campeonato). "Pedido mais específico?" é a busca com IA (WEB-400).
 */

const RECENT_KEY = 'onside.buscas-recentes'
const NEAR_KM = 10

export default function Search() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  const state = useExploreState()
  useStatusBar('auto')
  // Um aviso de jogo (19c) abre a busca já com o jogo digitado.
  const params = useLocalSearchParams<{ q?: string }>()
  const [query, setQuery] = useState(params.q ?? '')
  const deferred = useDeferredValue(query.trim())
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    SecureStore.getItemAsync(RECENT_KEY)
      .then((raw) => raw && setRecent(JSON.parse(raw)))
      .catch(() => {})
  }, [])
  const remember = (value: string) => {
    const next = rememberSearch(recent, value)
    setRecent(next)
    SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next)).catch(() => {})
  }

  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const center = searchCenter(state.device, city.data)
  const near = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm: NEAR_KM,
      limit: 50
    }),
    meta: { errorToast: false }
  })
  // Time e campeonato também no servidor, num raio maior.
  const remote = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm: 50,
      championship: deferred,
      limit: 20
    }),
    enabled: deferred.length >= 2,
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
  })
  const now = Date.now()
  const bars = (near.data?.bars ?? []) as (NearBar & { id: string })[]

  const close = () => router.back()
  const openBar = (id: string) => {
    if (query.trim()) remember(query)
    router.push(`/bar/${id}` as Href)
  }
  const showOnMap = (
    hood: Hood<NearBar>,
    apply?: 'hoje' | 'telao' | 'live'
  ) => {
    remember(hood.name)
    const lat = avg(hood.bars.map((b) => Number(b.latitude)))
    const lng = avg(hood.bars.map((b) => Number(b.longitude)))
    state.setFocus({ lat, lng, km: 1.6 })
    if (apply === 'hoje')
      state.setFilters({ ...state.filters, date: dayKey(now) })
    if (apply === 'telao' && !state.filters.amenities.includes(TELAO))
      state.setFilters(toggleAmenity(state.filters, TELAO))
    if (apply === 'live') state.setLiveOnly(true)
    close()
  }

  const typing = query.trim().length > 0
  const local = matchQuery(bars, deferred, now)
  const results = typing
    ? dedupe([...local.bars, ...((remote.data?.bars ?? []) as typeof bars)])
    : []

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          tint={palette.dark ? undefined : 'rgba(255,255,255,.62)'}
          style={[styles.field, { borderColor: palette.ink }]}
        >
          <Icon name="search" size={18} color={palette.ink} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Bar, bairro, time ou jogo"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            onSubmitEditing={() => remember(query)}
            selectionColor={LIVE}
            style={[
              text(16, 'Regular', 1.2),
              styles.input,
              { color: palette.ink }
            ]}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apagar"
              hitSlop={8}
              onPress={() => setQuery('')}
              style={[styles.clear, { backgroundColor: palette.mark }]}
            >
              <Icon name="close" size={12} color={palette.ink} />
            </Pressable>
          ) : null}
        </Glass>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={close}>
          <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
            Cancelar
          </Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 32 }
        ]}
      >
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          style={styles.bleed}
          contentContainerStyle={styles.chips}
        >
          {typing && local.hood
            ? (
                [
                  ['hoje', `${local.hood.name} hoje`],
                  ['telao', `${local.hood.name} com telão`],
                  ['live', `${local.hood.name} ao vivo`]
                ] as const
              ).map(([kind, label]) => (
                <SearchChip
                  key={kind}
                  palette={palette}
                  label={label}
                  query={deferred}
                  onPress={() =>
                    local.hood && showOnMap(local.hood as Hood<NearBar>, kind)
                  }
                />
              ))
            : typing
              ? null
              : recent.map((item) => (
                  <SearchChip
                    key={item}
                    palette={palette}
                    label={item}
                    onPress={() => setQuery(item)}
                  />
                ))}
        </ScrollView>

        {typing ? (
          <>
            {local.hood ? (
              <HoodCard
                palette={palette}
                hood={local.hood as Hood<NearBar>}
                query={deferred}
                now={now}
                onMap={() => showOnMap(local.hood as Hood<NearBar>)}
              />
            ) : null}
            <View style={styles.heading}>
              <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                {local.hood ? `Bares em ${local.hood.name}` : 'Bares e jogos'}
              </Text>
              <Text style={[text(12.5, 'SemiBold'), { color: palette.muted }]}>
                {results.length}
              </Text>
            </View>
            {results.length ? (
              <Card palette={palette} soft>
                <View style={{ paddingHorizontal: 14 }}>
                  {results.slice(0, 20).map((bar, i) => (
                    <ResultRow
                      key={bar.id}
                      palette={palette}
                      bar={bar}
                      query={deferred}
                      now={now}
                      first={i === 0}
                      onPress={() => openBar(bar.id)}
                    />
                  ))}
                </View>
              </Card>
            ) : (
              <Text
                style={[text(14, 'Regular', 1.45), { color: palette.muted }]}
              >
                {remote.isFetching
                  ? 'Buscando…'
                  : `Nada perto com “${query.trim()}”. Tente o nome do bar, o bairro ou um time.`}
              </Text>
            )}
          </>
        ) : (
          <OpenState
            palette={palette}
            bars={bars}
            now={now}
            onLive={() => {
              state.setLiveOnly(true)
              close()
            }}
            onGame={(name) => setQuery(name)}
            onAgenda={() => {
              state.setFilters({ ...state.filters, date: dayKey(now) })
              close()
            }}
            onHood={(hood) => setQuery(hood.name)}
            onAi={() => soon.show('A busca com IA chega em breve')}
          />
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

const avg = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1)

function dedupe<B extends { id: string }>(list: B[]) {
  const seen = new Set<string>()
  return list.filter((b) => !seen.has(b.id) && seen.add(b.id))
}

/** Texto com o trecho da busca marcado em acid. */
function Hl({
  value,
  query,
  style
}: {
  value: string
  query: string
  style: object
}) {
  return (
    <Text style={style}>
      {highlight(value, query).map((part, i) =>
        part.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: partes fixas do texto
          <Text key={i} style={styles.hit}>
            {part.text}
          </Text>
        ) : (
          part.text
        )
      )}
    </Text>
  )
}

function SearchChip({
  palette,
  label,
  query = '',
  onPress
}: {
  palette: Palette
  label: string
  query?: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptic.select()
        onPress()
      }}
    >
      <View
        style={[
          styles.chip,
          { backgroundColor: palette.card, borderColor: palette.ring }
        ]}
      >
        <Icon name="search" size={13} color={palette.muted} />
        <Hl
          value={label}
          query={query}
          style={[text(14, 'SemiBold', 1.2), { color: palette.ink }]}
        />
      </View>
    </Pressable>
  )
}

function OpenState({
  palette,
  bars,
  now,
  onLive,
  onGame,
  onAgenda,
  onHood,
  onAi
}: {
  palette: Palette
  bars: NearBar[]
  now: number
  onLive: () => void
  onGame: (name: string) => void
  onAgenda: () => void
  onHood: (hood: Hood<NearBar>) => void
  onAi: () => void
}) {
  const { width } = useWindowDimensions()
  const live = liveNow(bars, now)
  const night = tonight(bars, now)
  const near = hoods(bars, now).slice(0, 4)
  const dark = palette.dark
  return (
    <>
      {live ? (
        <Pressable accessibilityRole="button" onPress={onLive}>
          <Card
            palette={palette}
            shadow={dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'}
            offset={5}
            style={{ backgroundColor: dark ? palette.card : INK }}
          >
            <View style={styles.liveHead}>
              <View style={styles.liveTag}>
                <View style={styles.liveDot} />
                <Text style={[text(12, 'Bold', 1.2), { color: '#f3421d' }]}>
                  Rolando agora
                </Text>
              </View>
              <Text style={[styles.mono11, { color: '#aaa9a4' }]}>
                {live.game.championship.toLocaleUpperCase('pt-BR')}
              </Text>
            </View>
            <Teams game={live.game} />
            <View style={styles.liveFoot}>
              <View style={{ flexDirection: 'row' }}>
                {live.bars.slice(0, 3).map((b, i) => (
                  <Photo
                    key={b.id}
                    uri={b.photo_url}
                    name={b.name}
                    palette={palette}
                    big
                    style={{ ...styles.stackPhoto, marginLeft: i ? -8 : 0 }}
                  />
                ))}
              </View>
              <Text
                style={[text(13.5, 'Regular', 1.35), { color: PAPER, flex: 1 }]}
              >
                <Text style={text(13.5, 'Bold', 1.35)}>
                  {live.bars.length}{' '}
                  {live.bars.length === 1 ? 'bar perto' : 'bares perto'}
                </Text>
                <Text style={{ color: '#aaa9a4' }}>
                  {' '}
                  · o mais perto a {formatKm(live.bars[0]?.distance_km ?? 0)}
                </Text>
              </Text>
              <Icon name="next" size={14} color={ACID} />
            </View>
          </Card>
        </Pressable>
      ) : null}

      {night.length ? (
        <>
          <View style={styles.heading}>
            <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
              {/* "à noite" só quando é: de dia o design mentiria. */}
              {night.every(
                (g) => Number(formatTime(g.game.startsAt).slice(0, 2)) >= 18
              )
                ? 'Hoje à noite'
                : 'Mais tarde, hoje'}
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onAgenda}
            >
              <Text style={[text(12.5, 'SemiBold'), { color: palette.muted }]}>
                Ver agenda
              </Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}
          >
            {night.map((g) => {
              const two = sides(g.game)
              return (
                <Pressable
                  key={g.key}
                  accessibilityRole="button"
                  onPress={() => onGame(matchName(g.game))}
                  style={styles.poster}
                >
                  <Photo
                    uri={g.bars[0]?.photo_url ?? null}
                    name={g.bars[0]?.name ?? ''}
                    palette={palette}
                    big
                    style={StyleSheet.absoluteFill}
                  />
                  <LinearGradient
                    colors={[
                      'rgba(18,18,15,.55)',
                      'rgba(18,18,15,.1)',
                      'rgba(18,18,15,.92)'
                    ]}
                    locations={[0, 0.4, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={styles.posterTime}>
                    {formatTime(g.game.startsAt)}
                  </Text>
                  <View style={styles.posterFoot}>
                    {two ? (
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        {two.map((name) => (
                          <View key={name} style={styles.markSmall}>
                            <Text style={styles.markText13}>
                              {teamMark(name)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    <Text
                      style={[text(14, 'Bold', 1.2), { color: PAPER }]}
                      numberOfLines={2}
                    >
                      {matchName(g.game)}
                    </Text>
                    <Text style={[text(11.5, 'Bold', 1.2), { color: ACID }]}>
                      {g.bars.length} {g.bars.length === 1 ? 'bar' : 'bares'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        </>
      ) : null}

      {near.length ? (
        <>
          <View style={styles.heading}>
            <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
              Por bairro
            </Text>
            <Text style={[text(12.5, 'SemiBold'), { color: palette.muted }]}>
              {near.length} perto
            </Text>
          </View>
          <View style={styles.hoods}>
            {near.map((hood) => (
              <Pressable
                key={hood.name}
                accessibilityRole="button"
                accessibilityLabel={`${hood.name}, ${hood.bars.length} bares`}
                onPress={() => onHood(hood)}
                style={[
                  styles.hood,
                  { width: (width - 32 - 10) / 2, borderColor: palette.ring }
                ]}
              >
                <HoodMap palette={palette} hood={hood} now={now} />
                <LinearGradient
                  colors={
                    dark
                      ? ['rgba(18,18,15,0)', 'rgba(18,18,15,.88)']
                      : ['rgba(241,238,230,0)', 'rgba(241,238,230,.88)']
                  }
                  locations={[0.3, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.hoodFoot} pointerEvents="none">
                  <Text
                    style={[styles.hoodName, { color: palette.ink }]}
                    numberOfLines={1}
                  >
                    {hood.name}
                  </Text>
                  <Text style={[styles.mono115, { color: palette.ink }]}>
                    {hood.bars.length}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Pressable accessibilityRole="button" onPress={onAi}>
        <Card palette={palette} shadow={INK} offset={5} style={styles.ai}>
          <View style={styles.aiHead}>
            <Icon name="sparkle" size={26} color={INK} accent={LIVE} />
            <Text style={[text(17, 'Bold', 1.25), { color: INK, flex: 1 }]}>
              Pedido mais específico?
            </Text>
            <Icon name="next" size={14} color={INK} />
          </View>
          {[
            '“Telão e chopp barato perto do metrô”',
            '“Onde passa F1 domingo cedo”'
          ].map((example) => (
            <View key={example} style={styles.aiExample}>
              <Text style={[text(14, 'SemiBold', 1.3), { color: INK }]}>
                {example}
              </Text>
            </View>
          ))}
        </Card>
      </Pressable>
    </>
  )
}

/** Os dois times grandes do jogo ao vivo, com a sigla no círculo. */
function Teams({ game }: { game: NonNullable<NearBar['nextEvent']> }) {
  const two = sides(game)
  if (!two)
    return (
      <Text style={[styles.teamName, { paddingHorizontal: 16 }]}>
        {matchName(game)}
      </Text>
    )
  return (
    <View style={styles.teams}>
      <View style={{ flex: 1, gap: 8, alignItems: 'flex-start' }}>
        <View style={styles.mark}>
          <Text style={styles.markText}>{teamMark(two[0])}</Text>
        </View>
        <Text style={styles.teamName} numberOfLines={1} adjustsFontSizeToFit>
          {two[0]}
        </Text>
      </View>
      <Text style={[text(20, 'Bold', 1), { color: ACID }]}>×</Text>
      <View style={{ flex: 1, gap: 8, alignItems: 'flex-end' }}>
        <View style={styles.mark}>
          <Text style={styles.markText}>{teamMark(two[1])}</Text>
        </View>
        <Text style={styles.teamName} numberOfLines={1} adjustsFontSizeToFit>
          {two[1]}
        </Text>
      </View>
    </View>
  )
}

/** Recorte do mapa do bairro, com os bares em quadradinhos (vermelho: ao vivo). */
function HoodMap({
  palette,
  hood,
  now,
  big
}: {
  palette: Palette
  hood: Hood<NearBar>
  now: number
  big?: boolean
}) {
  const lats = hood.bars.map((b) => Number(b.latitude))
  const lngs = hood.bars.map((b) => Number(b.longitude))
  const span = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs),
    0.006
  )
  const center = { latitude: avg(lats), longitude: avg(lngs) }
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={{
        ...center,
        latitudeDelta: span * 1.8,
        longitudeDelta: span * 1.8
      }}
      mapType="mutedStandard"
      customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
      userInterfaceStyle={palette.dark ? 'dark' : 'light'}
      showsPointsOfInterests={false}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      pointerEvents="none"
    >
      {big ? (
        <Circle
          center={center}
          radius={span * 111_000 * 0.7}
          strokeWidth={2}
          strokeColor={palette.dark ? ACID : INK}
          fillColor="rgba(201,241,53,.2)"
        />
      ) : null}
      {hood.bars.slice(0, big ? 4 : 8).map((bar) => {
        const live = bar.nextEvent ? isLive(bar.nextEvent, now) : false
        return (
          <Marker
            key={bar.id}
            coordinate={{
              latitude: Number(bar.latitude),
              longitude: Number(bar.longitude)
            }}
            anchor={big ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            {big ? (
              <PinTag label={bar.name} kind={live ? 'live' : 'idle'} />
            ) : (
              <View
                style={[styles.square, { backgroundColor: live ? LIVE : ACID }]}
              />
            )}
          </Marker>
        )
      })}
    </MapView>
  )
}

function HoodCard({
  palette,
  hood,
  query,
  now,
  onMap
}: {
  palette: Palette
  hood: Hood<NearBar>
  query: string
  now: number
  onMap: () => void
}) {
  return (
    <Card
      palette={palette}
      shadow={palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'}
      offset={5}
    >
      <View style={styles.hoodMap}>
        <HoodMap palette={palette} hood={hood} now={now} big />
        <View style={styles.hoodBadge}>
          <Glass
            tone={palette.dark ? 'dark' : 'light'}
            style={styles.badgeGlass}
          >
            <Text style={[styles.mono11, { color: palette.ink }]}>BAIRRO</Text>
          </Glass>
        </View>
      </View>
      <View style={styles.hoodBody}>
        <View style={{ flex: 1 }}>
          <Hl
            value={hood.name}
            query={query}
            style={[styles.hoodTitle, { color: palette.ink }]}
          />
          <Text style={[text(12.5), { color: palette.muted }]}>
            {hood.bars.length} {hood.bars.length === 1 ? 'bar' : 'bares'}
            {hood.live ? (
              <Text style={[text(12.5, 'Bold'), { color: palette.live }]}>
                {' '}
                · {hood.live} com jogo agora
              </Text>
            ) : null}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onMap}
          style={[styles.mapButton, palette.dark && { backgroundColor: ACID }]}
        >
          <Text
            style={[
              text(13.5, 'Bold', 1.2),
              { color: palette.dark ? INK : PAPER }
            ]}
          >
            Ver no mapa
          </Text>
        </Pressable>
      </View>
    </Card>
  )
}

function ResultRow({
  palette,
  bar,
  query,
  now,
  first,
  onPress
}: {
  palette: Palette
  bar: NearBar
  query: string
  now: number
  first: boolean
  onPress: () => void
}) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bar.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.result,
        !first && { borderTopWidth: 1, borderTopColor: palette.line },
        pressed && { opacity: 0.6 }
      ]}
    >
      <Photo
        uri={bar.photo_url}
        name={bar.name}
        palette={palette}
        big
        style={styles.resultPhoto}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Hl
          value={bar.name}
          query={query}
          style={[text(15, 'Bold', 1.25), { color: palette.ink }]}
        />
        <Text style={[text(12.5), { color: palette.muted }]}>
          {formatKm(bar.distance_km)}
          {bar.neighborhood ? ` · ${bar.neighborhood}` : ''}
        </Text>
      </View>
      {game ? (
        <View style={{ alignItems: 'flex-end', maxWidth: 140 }}>
          {live ? (
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text style={[text(12, 'Bold', 1.2), { color: palette.live }]}>
                Agora
              </Text>
            </View>
          ) : (
            <Text style={[styles.time, { color: palette.ink }]}>
              {formatTime(game.startsAt)}
            </Text>
          )}
          <Text
            style={[text(11.5, 'Regular', 1.3), { color: palette.muted }]}
            numberOfLines={1}
          >
            {live || dayLabel(game.startsAt, now) === 'Hoje'
              ? matchName(game)
              : `${dayLabel(game.startsAt, now)} · ${matchName(game)}`}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  field: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
    overflow: 'hidden'
  },
  input: { flex: 1, height: 48 },
  clear: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  body: { paddingHorizontal: 16, gap: 16, paddingTop: 8 },
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1
  },
  hit: {
    backgroundColor: 'rgba(201,241,53,.8)',
    color: INK
  },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: -4
  },
  liveHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12
  },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: LIVE,
    shadowColor: LIVE,
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 }
  },
  mono11: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 },
  mono115: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  teams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2a2a25',
    borderWidth: 2,
    borderColor: 'rgba(241,238,230,.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  markText: { fontFamily: 'Anton', fontSize: 15, color: PAPER },
  markSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2a2a25',
    borderWidth: 2,
    borderColor: 'rgba(241,238,230,.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  markText13: { fontFamily: 'Anton', fontSize: 11, color: PAPER },
  teamName: {
    fontFamily: 'Anton',
    fontSize: 24,
    color: PAPER,
    textTransform: 'uppercase'
  },
  liveFoot: {
    marginTop: 14,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  stackPhoto: {
    width: 30,
    height: 30,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: INK
  },
  poster: {
    width: 148,
    height: 196,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#2a2a25'
  },
  posterTime: {
    position: 'absolute',
    left: 12,
    top: 6,
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER
  },
  posterFoot: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 7 },
  hoods: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hood: {
    height: 104,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1
  },
  hoodFoot: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  hoodName: {
    fontFamily: 'Anton',
    fontSize: 19,
    textTransform: 'uppercase',
    flex: 1
  },
  square: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 2,
    borderColor: PAPER
  },
  ai: { backgroundColor: ACID, padding: 16, gap: 10 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiExample: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,.45)',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  hoodMap: { height: 118 },
  hoodBadge: { position: 'absolute', left: 10, top: 10 },
  badgeGlass: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  hoodBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  hoodTitle: {
    fontFamily: 'Anton',
    fontSize: 30,
    textTransform: 'uppercase'
  },
  mapButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: INK
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10
  },
  resultPhoto: { width: 52, height: 52, borderRadius: 3 },
  time: { fontFamily: 'Anton', fontSize: 20 }
})
