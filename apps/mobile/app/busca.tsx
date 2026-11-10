import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { type ReactNode, useDeferredValue, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SearchEmpty } from '@/components/empty-states'
import { Photo } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { GroupLabel, LineList } from '@/components/game-line'
import { useLayout, useNavInsets } from '@/components/layout'
import { haptic, ScalePress } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  TextInput,
  text,
  useStatusBar
} from '@/components/ui'
import { formatKm, formatTime, searchCenter } from '@/lib/explore'
import { gameRow, type RowGame } from '@/lib/explore-board'
import { dayKey } from '@/lib/filters'
import {
  type Hood,
  highlight,
  hoods,
  matchGames,
  matchQuery,
  matchTeams,
  type NearBar,
  rememberSearch
} from '@/lib/search'
import { trpc } from '@/lib/trpc'

/*
 * Busca (Tela 1 da rodada 5, 19a e 19b). Sem texto: as buscas recentes em
 * chips, os jogos de agora em linhas de placar e os bairros perto. Digitando:
 * Times, Jogos, Bares e Bairros, nessa ordem, com a parte digitada em negrito.
 * Os jogos vêm da régua do Explorar (`pubs.gameBoard`): jogo e time abrem o
 * Explorar já no jogo (`setGame`). Bar e bairro casam no aparelho sobre os
 * bares perto; nome do bar e campeonato vão também ao servidor
 * (`pubs.search` com `championship`). No fim, o convite para a IA (2h).
 * Os resultados trocam a cada letra sem animação (decisão da rodada 5).
 */

const RECENT_KEY = 'onside.buscas-recentes'
const NEAR_KM = 10

// Constantes de módulo: o Reanimated recomeça a animação quando o objeto muda.
const CHIP_LAYOUT = LinearTransition.duration(180)
const CHIP_OUT = FadeOut.duration(150)

export default function Search() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
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
  const saveRecent = (next: string[]) => {
    setRecent(next)
    SecureStore.setItemAsync(RECENT_KEY, JSON.stringify(next)).catch(() => {})
  }
  const remember = (value: string) => saveRecent(rememberSearch(recent, value))

  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const center = searchCenter(state.device, city.data)
  const now = Date.now()
  const today = dayKey(now)
  const board = useQuery({
    ...trpc.pubs.gameBoard.queryOptions({
      ...center,
      radiusKm: NEAR_KM,
      day: today
    }),
    placeholderData: keepPreviousData
  })
  const near = useQuery(
    trpc.pubs.search.queryOptions({ ...center, radiusKm: NEAR_KM, limit: 50 })
  )
  // Nome do bar e campeonato também no servidor, num raio maior.
  const remote = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm: 50,
      championship: deferred,
      limit: 20
    }),
    enabled: deferred.length >= 2,
    placeholderData: keepPreviousData
  })
  const row = gameRow(board.data?.games ?? [], null, now)
  const bars = (near.data?.bars ?? []) as (NearBar & { id: string })[]

  // Aberta por link (aviso, DEV) não há tela embaixo: volta ao Explorar.
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/explore' as Href)
  const finish = () => {
    if (query.trim()) remember(query)
  }
  const openGame = (game: RowGame) => {
    finish()
    state.setFilters({ ...state.filters, date: today })
    state.setLiveOnly(false)
    state.setGame(game.key)
    close()
  }
  const openBar = (id: string) => {
    finish()
    router.push(`/bar/${id}` as Href)
  }
  const showOnMap = (hood: Hood<NearBar>) => {
    remember(hood.name)
    const lat = avg(hood.bars.map((b) => Number(b.latitude)))
    const lng = avg(hood.bars.map((b) => Number(b.longitude)))
    state.setFocus({ lat, lng, kmTall: 1.6, kmWide: 1.6 })
    close()
  }

  const typing = deferred.length > 0
  const teams = typing ? matchTeams(row, deferred) : []
  const games = typing ? matchGames(row, deferred) : []
  const local = matchQuery(bars, deferred, now)
  // Bares pelo nome: o jogo e o bairro já têm a seção deles.
  const foundBars = typing
    ? dedupe([
        ...local.bars,
        ...((remote.data?.bars ?? []) as typeof bars)
      ]).filter((bar) => highlight(bar.name, deferred).some((p) => p.hit))
    : []
  const foundHoods = typing
    ? hoods(bars, now).filter((hood) =>
        highlight(hood.name, deferred).some((p) => p.hit)
      )
    : []
  const empty =
    typing &&
    !teams.length &&
    !games.length &&
    !foundBars.length &&
    !foundHoods.length

  // Fora do celular a busca fica numa coluna de até 560 no meio (Adaptativo
  // 10), fora da faixa do Duo.
  const layout = useLayout()
  const strip = useNavInsets().right
  const pad =
    layout.kind === 'phone' || layout.kind === 'duoClosed'
      ? 0
      : (layout.width - strip - Math.min(560, layout.width - strip - 80)) / 2
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg },
        (pad > 0 || strip > 0) && {
          paddingLeft: pad,
          paddingRight: pad + strip
        }
      ]}
    >
      <View style={[styles.top, { paddingTop: insets.top + 11 }]}>
        <View
          style={[
            styles.field,
            { backgroundColor: palette.card, borderColor: palette.ink }
          ]}
        >
          <Icon name="search" size={20} color={palette.ink} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Time, bar ou bairro"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            onSubmitEditing={finish}
            selectionColor={palette.dark ? ACID : '#5b6d0c'}
            style={[
              text(16, 'SemiBold', 1.2),
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
        </View>
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
        {typing ? (
          <>
            {teams.length ? (
              <Section label="Times">
                {teams.map((team, i) => (
                  <Row
                    key={team.name}
                    first={i === 0}
                    lead={
                      <View
                        style={[styles.lead, { backgroundColor: palette.mark }]}
                      >
                        <Icon name="fan" size={20} color={palette.ink} />
                      </View>
                    }
                    title={<Hl value={team.name} query={deferred} />}
                    sub={`${team.game.live ? 'agora' : `hoje ${formatTime(team.game.startsAt)}`} × ${team.rival} · ${bareCount(team.game.bars.length)}`}
                    onPress={() => openGame(team.game)}
                  />
                ))}
              </Section>
            ) : null}
            {games.length ? (
              <Section label="Jogos">
                {games.map((game, i) => (
                  <GameRow
                    key={game.key}
                    game={game}
                    first={i === 0}
                    query={deferred}
                    onPress={() => openGame(game)}
                  />
                ))}
              </Section>
            ) : null}
            {foundBars.length ? (
              <Section label="Bares">
                {foundBars.slice(0, 12).map((bar, i) => (
                  <Row
                    key={bar.id}
                    first={i === 0}
                    lead={
                      <Photo
                        uri={bar.photo_url}
                        name={bar.name}
                        style={styles.lead}
                      />
                    }
                    title={<Hl value={bar.name} query={deferred} />}
                    sub={[bar.neighborhood, formatKm(bar.distance_km)]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() => openBar(bar.id)}
                  />
                ))}
              </Section>
            ) : null}
            {foundHoods.length ? (
              <Section label="Bairros">
                {foundHoods.slice(0, 4).map((hood, i) => (
                  <Row
                    key={hood.name}
                    first={i === 0}
                    lead={
                      <View
                        style={[styles.lead, { backgroundColor: palette.mark }]}
                      >
                        <Icon name="pin" size={20} color={palette.ink} />
                      </View>
                    }
                    title={<Hl value={hood.name} query={deferred} />}
                    sub={`${bareCount(hood.bars.length)} · ver no mapa`}
                    onPress={() => showOnMap(hood)}
                  />
                ))}
              </Section>
            ) : null}
            {empty ? (
              layout.kind !== 'phone' && !remote.isFetching ? (
                // O vazio do design (Rodada 14) só fora do celular.
                <SearchEmpty
                  query={query.trim()}
                  onAi={() => router.push('/busca-ia')}
                />
              ) : (
                <Text
                  style={[text(14, 'Regular', 1.45), { color: palette.muted }]}
                >
                  {remote.isFetching
                    ? 'Buscando…'
                    : `Nada perto com “${query.trim()}”. Tente o nome do bar, o bairro ou um time.`}
                </Text>
              )
            ) : null}
            <AskAi onPress={() => router.push('/busca-ia')} />
          </>
        ) : (
          <>
            {recent.length ? (
              <>
                <GroupLabel>Recentes</GroupLabel>
                <View style={styles.chips}>
                  {recent.map((item) => (
                    <Animated.View
                      key={item}
                      layout={CHIP_LAYOUT}
                      exiting={CHIP_OUT}
                    >
                      <Chip
                        label={item}
                        onPress={() => setQuery(item)}
                        onRemove={() =>
                          saveRecent(recent.filter((r) => r !== item))
                        }
                      />
                    </Animated.View>
                  ))}
                </View>
              </>
            ) : null}
            {row.length ? (
              <Section label="Jogos de agora">
                {row.slice(0, 3).map((game, i) => (
                  <GameRow
                    key={game.key}
                    game={game}
                    first={i === 0}
                    onPress={() => openGame(game)}
                  />
                ))}
              </Section>
            ) : null}
            {bars.length ? (
              <>
                <GroupLabel>Bairros perto</GroupLabel>
                <View style={styles.chips}>
                  {hoods(bars, now)
                    .slice(0, 3)
                    .map((hood) => (
                      <Chip
                        key={hood.name}
                        icon="pin"
                        label={`${hood.name} · ${hood.bars.length}`}
                        onPress={() => showOnMap(hood)}
                      />
                    ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const avg = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1)

const bareCount = (n: number) => `${n} ${n === 1 ? 'bar' : 'bares'}`

function dedupe<B extends { id: string }>(list: B[]) {
  const seen = new Set<string>()
  return list.filter((b) => !seen.has(b.id) && seen.add(b.id))
}

/** O texto com a parte digitada em negrito. */
function Hl({ value, query }: { value: string; query: string }) {
  return highlight(value, query).map((part, i) =>
    part.hit ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: partes fixas do texto
      <Text key={i} style={styles.hit}>
        {part.text}
      </Text>
    ) : (
      part.text
    )
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <GroupLabel>{label}</GroupLabel>
      <LineList>{children}</LineList>
    </>
  )
}

/** A linha `.rw`: o que vem na frente, o nome, a linha de baixo e a seta. */
function Row({
  lead,
  title,
  sub,
  first,
  onPress
}: {
  lead: ReactNode
  title: ReactNode
  sub: string
  first: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: palette.line },
        pressed && { opacity: 0.6 }
      ]}
    >
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(15, 'Regular', 1.2), { color: palette.ink }]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[text(12.5, 'Regular', 1.35), { color: palette.muted }]}
        >
          {sub}
        </Text>
      </View>
      <Icon name="next" size={16} color={palette.muted} />
    </Pressable>
  )
}

/** O jogo em linha de placar: a hora em mono (vermelha ao vivo) e o dia. */
function GameRow({
  game,
  first,
  query = '',
  onPress
}: {
  game: RowGame
  first: boolean
  query?: string
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Row
      first={first}
      lead={
        <View style={styles.time}>
          <Text
            style={[
              styles.timeText,
              { color: game.live ? palette.live : palette.ink }
            ]}
          >
            {formatTime(game.startsAt)}
          </Text>
          <Text style={[styles.day, { color: palette.muted }]}>
            {game.live ? 'AO VIVO' : 'HOJE'}
          </Text>
        </View>
      }
      title={<Hl value={game.title} query={query} />}
      sub={`${game.championship} · ${bareCount(game.bars.length)}`}
      onPress={onPress}
    />
  )
}

function Chip({
  label,
  icon,
  onPress,
  onRemove
}: {
  label: string
  icon?: 'pin'
  onPress: () => void
  onRemove?: () => void
}) {
  const palette = usePalette()
  return (
    <ScalePress
      accessibilityRole="button"
      onPress={() => {
        haptic.select()
        onPress()
      }}
    >
      <View style={[styles.chip, { backgroundColor: palette.mark }]}>
        {icon ? <Icon name={icon} size={14} color={palette.ink} /> : null}
        <Text style={[text(13.5, 'SemiBold', 1.2), { color: palette.ink }]}>
          {label}
        </Text>
        {onRemove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Tirar ${label} das recentes`}
            hitSlop={10}
            onPress={() => {
              haptic.select()
              onRemove()
            }}
          >
            <Text
              style={[text(13.5, 'Regular', 1.2), { color: palette.muted }]}
            >
              ×
            </Text>
          </Pressable>
        ) : null}
      </View>
    </ScalePress>
  )
}

/** "Pedido mais específico?": tinta no claro, cinza no escuro. */
function AskAi({ onPress }: { onPress: () => void }) {
  const palette = usePalette()
  return (
    <ScalePress accessibilityRole="button" to={0.985} onPress={onPress}>
      <View
        style={[styles.ask, palette.dark && { backgroundColor: palette.mark }]}
      >
        <Icon name="sparkle" size={24} color={ACID} accent={ACID} />
        <View style={{ flex: 1 }}>
          <Text style={[text(15, 'Bold', 1.25), { color: PAPER }]}>
            Pedido mais específico?
          </Text>
          <Text style={[text(13, 'Regular', 1.3), { color: '#aaa9a4' }]}>
            Pergunte do seu jeito à busca com IA.
          </Text>
        </View>
      </View>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  field: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 9
  },
  input: { flex: 1, height: 44 },
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  body: { paddingHorizontal: 16, gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17
  },
  hit: { fontFamily: 'Archivo-Bold' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  lead: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  time: { minWidth: 54 },
  // Mono 17/1: margem negativa no lugar do entrelinha curto.
  timeText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    marginVertical: -2.5
  },
  day: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4
  },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    backgroundColor: INK,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  }
})
