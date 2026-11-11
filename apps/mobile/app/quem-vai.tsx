import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  LinearTransition,
  useReducedMotion
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle } from 'react-native-svg'
import {
  DayBoard,
  OwnerCard,
  OwnerRow,
  ownerText
} from '@/components/bar-owner'
import { HardShadow } from '@/components/explore'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  ErrorState,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { arrivalsByHour, gameState, sinceLabel } from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'

/*
 * Quem vai (rodada 10, tela 3, 2s): o placar do jogo de agora em tinta, com o
 * anel de quantos chegaram, chegaram / a caminho / 1ª vez aqui e as chegadas
 * por hora; os filtros Todos, Chegaram e A caminho; cada pessoa com quando
 * marcou ou validou e se é primeira vez ou frequente.
 *
 * Só no Elite (a lista é do código do balcão). Movimento: a pílula do filtro
 * em 200 ms, a lista troca seco; números trocam seco.
 */

type Filter = 'all' | 'in' | 'way'
const PILL = LinearTransition.duration(200).easing(EASE)

export default function QuemVai() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    enabled: owner.elite,
    refetchInterval: 30_000
  })
  const [chosen, setChosen] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const now = Date.now()
  const games = going.data ?? []
  // O jogo de agora: o ao vivo, senão o próximo.
  const live = games.find(
    (g) =>
      gameState({ ...g, endsAt: null, publishedAt: g.startsAt }, now) === 'live'
  )
  const game =
    games.find((g) => g.id === chosen) ??
    live ??
    games.find((g) => new Date(g.startsAt).getTime() > now) ??
    games[0]
  const people = game?.people ?? []
  const arrived = people.filter((p) => p.validatedAt)
  const first = arrived.filter((p) => p.arrival?.firstVisit).length
  const shown =
    filter === 'in'
      ? arrived
      : filter === 'way'
        ? people.filter((p) => !p.validatedAt)
        : people
  const bars = game
    ? arrivalsByHour(
        arrived.map((p) => p.validatedAt as string),
        game.startsAt
      )
    : []
  const isLive = game ? game.id === live?.id : false

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          gap: 14
        }}
      >
        <BackButton />
        <View>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            {[
              game
                ? brasiliaDay(game.startsAt) === brasiliaDay(now)
                  ? 'HOJE'
                  : formatTime(game.startsAt)
                : null,
              game?.houseOffer
                ? `OFERTA: ${game.houseOffer.toLocaleUpperCase('pt-BR')}`
                : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: palette.ink }]}
          >
            Quem vai
          </Text>
        </View>

        {!owner.elite ? (
          <OwnerCard>
            <Text
              style={[
                text(15, 'Regular', 1.45),
                { color: palette.muted, paddingVertical: 16 }
              ]}
            >
              A lista de quem vai vem com o código do balcão, do plano Elite. No
              Starter e no Pro, a página do bar mostra quantos vão.
            </Text>
          </OwnerCard>
        ) : going.isError ? (
          <ErrorState
            title="Não deu para carregar quem vai."
            error={going.error}
            onRetry={() => going.refetch()}
            retrying={going.isFetching}
          />
        ) : !game ? (
          <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
            {going.isPending
              ? 'Carregando…'
              : 'Ninguém marcou presença nos próximos jogos ainda.'}
          </Text>
        ) : (
          <>
            {games.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {games.map((g) => {
                  const on = g.id === game.id
                  return (
                    <Pressable
                      key={g.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        haptic.select()
                        setChosen(g.id)
                      }}
                      style={[
                        styles.gameChip,
                        { backgroundColor: on ? palette.ink : palette.mark }
                      ]}
                    >
                      <Text
                        style={[
                          text(13.5, 'SemiBold', 1.2),
                          { color: on ? palette.bg : palette.ink }
                        ]}
                      >
                        {`${formatTime(g.startsAt)} · ${shortTitle(gameTitle(g))}`}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            ) : null}
            <DayBoard
              kicker={`${formatTime(game.startsAt)}${isLive ? ' · AO VIVO' : ''}`}
              hot={isLive}
              aside={game.championship.toLocaleUpperCase('pt-BR')}
            >
              <View style={{ flex: 1, gap: 14 }}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={styles.boardTitle}
                >
                  {gameTitle(game)}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'center'
                  }}
                >
                  <Ring value={arrived.length} total={people.length} />
                  <Cell value={arrived.length} label="chegaram" />
                  <Cell
                    value={people.length - arrived.length}
                    label="a caminho"
                  />
                  <Cell value={first} label="1ª vez aqui" />
                </View>
                {arrived.length ? <Hours bars={bars} /> : null}
              </View>
            </DayBoard>

            <View style={[styles.filters, { backgroundColor: palette.mark }]}>
              {(
                [
                  ['all', `Todos · ${people.length}`],
                  ['in', `Chegaram · ${arrived.length}`],
                  ['way', `A caminho · ${people.length - arrived.length}`]
                ] as const
              ).map(([key, label]) => {
                const on = filter === key
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      haptic.select()
                      setFilter(key)
                    }}
                    style={styles.filter}
                  >
                    {on ? (
                      <Animated.View
                        layout={reduced ? undefined : PILL}
                        style={[
                          styles.filterPill,
                          { backgroundColor: palette.ink }
                        ]}
                      />
                    ) : null}
                    <Text
                      style={[
                        text(14.5, 'SemiBold', 1.2),
                        { color: on ? palette.bg : palette.ink }
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <OwnerCard>
              {shown.length ? (
                shown.map((person, index) => (
                  <OwnerRow
                    // A lista não traz id de pessoa (o bar não vê): nome e
                    // horários repetem em contas de teste, e a posição desempata.
                    // biome-ignore lint/suspicious/noArrayIndexKey: sem id estável
                    key={`${index}-${person.name}`}
                    first={index === 0}
                  >
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: person.validatedAt
                            ? index % 2 === 0
                              ? ACID
                              : palette.dark
                                ? '#2a2a24'
                                : INK
                            : palette.mark
                        }
                      ]}
                    >
                      <Text
                        style={[
                          text(16, 'Bold', 1.1),
                          {
                            color: person.validatedAt
                              ? index % 2 === 0
                                ? INK
                                : ACID
                              : palette.ink
                          }
                        ]}
                      >
                        {person.name.trim().charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[ownerText.name, { color: palette.ink }]}
                      >
                        {person.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[ownerText.line, { color: palette.muted }]}
                      >
                        {person.validatedAt
                          ? `validou ${formatTime(person.validatedAt)}`
                          : `marcou ${sinceLabel(person.markedAt, now)}`}
                        {person.arrival ? (
                          <Text
                            style={[
                              text(14.5, 'Bold', 1.35),
                              { color: palette.ink }
                            ]}
                          >
                            {person.arrival.firstVisit
                              ? ' · 1ª vez'
                              : ` · ${person.arrival.visitsThisMonth}ª no mês`}
                          </Text>
                        ) : null}
                      </Text>
                    </View>
                    {person.validatedAt ? (
                      <View style={styles.ok}>
                        <Icon name="check" size={16} color={INK} />
                      </View>
                    ) : (
                      <View
                        style={[styles.way, { backgroundColor: palette.mark }]}
                      >
                        <Icon name="pin" size={16} color={palette.ink} />
                      </View>
                    )}
                  </OwnerRow>
                ))
              ) : (
                <Text
                  style={[
                    text(14.5, 'Regular', 1.45),
                    { color: palette.muted, paddingVertical: 16 }
                  ]}
                >
                  {filter === 'in'
                    ? 'Ninguém chegou ainda.'
                    : 'Ninguém a caminho.'}
                </Text>
              )}
            </OwnerCard>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/validar-codigo')}
              style={[styles.validate]}
            >
              <HardShadow color="#7f9a12" offset={4} radius={999} />
              <View style={styles.validateFace}>
                <Icon name="qr" size={20} color={INK} accent={INK} />
                <Text style={[text(17, 'Bold', 1.2), { color: INK }]}>
                  Validar código
                </Text>
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  )
}

/** O anel de quantos chegaram ("9 de 24"). */
function Ring({ value, total }: { value: number; total: number }) {
  const size = 92
  const stroke = 9
  const r = (size - stroke) / 2
  const length = 2 * Math.PI * r
  const share = total ? Math.min(1, value / total) : 0
  return (
    <View
      accessible
      accessibilityLabel={`${value} de ${total} chegaram`}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(241,238,230,.12)"
          strokeWidth={stroke}
          fill="none"
        />
        {share > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={ACID}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${length * share} ${length}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Text style={styles.ringValue}>{value}</Text>
      <Text style={styles.ringTotal}>{`de ${total}`}</Text>
    </View>
  )
}

function Cell({ value, label }: { value: number; label: string }) {
  return (
    <View
      style={styles.cell}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.cellValue}>
        {value}
      </Text>
      <Text
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={styles.cellLabel}
      >
        {label}
      </Text>
    </View>
  )
}

/** As chegadas por hora: a hora de mais gente em acid. */
function Hours({ bars }: { bars: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...bars.map((b) => b.count))
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.hoursLabel}>CHEGADAS</Text>
      <View style={styles.hours}>
        {bars.map((b) => (
          <View
            key={b.hour}
            style={[
              styles.hour,
              {
                height: Math.max(4, (b.count / max) * 56),
                backgroundColor:
                  b.count === max ? ACID : 'rgba(241,238,230,.14)'
              }
            ]}
          />
        ))}
      </View>
      <View style={styles.hoursAxis}>
        {/* O primeiro, o do meio e o último: mais que isso se encavala. */}
        {[...new Set([bars[0], bars[Math.floor(bars.length / 2)], bars.at(-1)])]
          .filter((b): b is { hour: number; count: number } => Boolean(b))
          .map((b) => (
            <Text key={b.hour} style={styles.hoursLabel}>{`${b.hour}h`}</Text>
          ))}
      </View>
    </View>
  )
}

function shortTitle(title: string) {
  const sides = title.split(' × ')
  return sides.length === 2
    ? sides.map((s) => s.slice(0, 3)).join(' × ')
    : title
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 8
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 46,
    textTransform: 'uppercase',
    marginVertical: -11
  },
  gameChip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    justifyContent: 'center'
  },
  boardTitle: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    textTransform: 'uppercase',
    marginVertical: -7.3
  },
  ringValue: {
    fontFamily: 'Anton',
    fontSize: 34,
    color: PAPER,
    marginVertical: -8.2
  },
  ringTotal: {
    marginTop: 8,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: '#aaa9a4'
  },
  cell: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 14,
    backgroundColor: 'rgba(241,238,230,.06)',
    paddingVertical: 10,
    paddingHorizontal: 7,
    gap: 2
  },
  cellValue: {
    fontFamily: 'Anton',
    fontSize: 28,
    color: PAPER,
    marginVertical: -6.8
  },
  cellLabel: {
    marginTop: 8,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    color: '#aaa9a4'
  },
  hoursLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: '#aaa9a4',
    letterSpacing: 0.8
  },
  hours: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 60 },
  hour: { flex: 1, borderRadius: 4 },
  hoursAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  filters: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  filter: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 999
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ok: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  way: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  validate: { height: 58, marginTop: 4 },
  validateFace: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  }
})
