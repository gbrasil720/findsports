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
import {
  OwnerCard,
  OwnerLabel,
  OwnerRow,
  ownerText
} from '@/components/bar-owner'
import { HardShadow } from '@/components/explore'
import { useNavInsets } from '@/components/layout'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  ErrorState,
  Icon,
  INK,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import {
  dayKicker,
  type GameState,
  gameState,
  LOTANDO,
  weekDays
} from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'

/*
 * Jogos (rodada 10, tela 3, 3j): a semana em sete dias com os pontos dos
 * jogos (o dia lotando em acid), as abas Próximos, Rascunhos e Como foi, e
 * cada jogo com a barra de procura (quantos vão), o estado e o que vem junto
 * (telão, oferta). "Novo jogo" fica fixo embaixo. Tocar num jogo abre a
 * edição; num dia, mostra só aquele dia.
 *
 * Movimento: as abas trocam a pílula em 200 ms e o conteúdo seco; a barra
 * de procura anda quando alguém marca (300 ms, EASE).
 */

type Tab = 'next' | 'drafts' | 'past'
const PILL = LinearTransition.duration(200).easing(EASE)
const BAR = LinearTransition.duration(300).easing(EASE)

export default function Jogos() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const nav = useNavInsets()
  const reduced = useReducedMotion()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    enabled: owner.elite
  })
  const [tab, setTab] = useState<Tab>('next')
  const [day, setDay] = useState<string | null>(null)
  const now = Date.now()
  const all = events.data ?? []
  const goingOf = new Map(
    (going.data ?? []).map((g) => [g.id, g.people.length])
  )
  const count = (id: string) => goingOf.get(id) ?? 0
  const upcoming = all.filter((g) => {
    const state = gameState(g, now)
    return state === 'live' || state === 'upcoming'
  })
  const drafts = all.filter((g) => gameState(g, now) === 'draft')
  const past = all
    .filter((g) => gameState(g, now) === 'ended')
    .reverse()
    .slice(0, 20)
  const week = weekDays(now)
  const inWeek = upcoming.filter((g) => week.includes(brasiliaDay(g.startsAt)))
  const weekGoing = inWeek.reduce((sum, g) => sum + count(g.id), 0)
  const shown = (
    tab === 'next' ? upcoming : tab === 'drafts' ? drafts : past
  ).filter((g) => !day || tab !== 'next' || brasiliaDay(g.startsAt) === day)
  const groups = new Map<string, typeof shown>()
  for (const game of shown) {
    const key = brasiliaDay(game.startsAt)
    groups.set(key, [...(groups.get(key) ?? []), game])
  }
  // A barra de procura: quantos vão contra o jogo mais procurado (ou 30).
  const top = Math.max(30, ...upcoming.map((g) => count(g.id)))
  const edit = (id: string) =>
    router.push({ pathname: '/novo-jogo', params: { id } })

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 18,
          paddingBottom: nav.bottom + 110,
          paddingLeft: 16 + nav.left,
          paddingRight: 16 + nav.right,
          gap: 14
        }}
      >
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: palette.muted }]}>
              {`ESTA SEMANA · ${inWeek.length} ${inWeek.length === 1 ? 'JOGO' : 'JOGOS'}${owner.elite ? ` · ${weekGoing} VÃO` : ''}`}
            </Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.ink }]}
            >
              Jogos
            </Text>
          </View>
        </View>

        <View style={styles.week}>
          {week.map((d) => {
            const games = upcoming.filter((g) => brasiliaDay(g.startsAt) === d)
            const full = games.some((g) => count(g.id) >= LOTANDO)
            const on = d === day || (!day && d === week[0])
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityState={{ selected: d === day }}
                accessibilityLabel={`${dayKicker(Date.parse(`${d}T15:00:00Z`))}, ${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}`}
                onPress={() => {
                  haptic.select()
                  setTab('next')
                  setDay((now) => (now === d ? null : d))
                }}
                style={[
                  styles.day,
                  {
                    backgroundColor: on ? palette.card : 'transparent',
                    borderColor: full ? ACID : 'transparent'
                  }
                ]}
              >
                <Text style={[styles.dayName, { color: palette.muted }]}>
                  {dayKicker(Date.parse(`${d}T15:00:00Z`)).split(' ')[0]}
                </Text>
                <Text style={[styles.dayNumber, { color: palette.ink }]}>
                  {Number(d.slice(8))}
                </Text>
                <View style={styles.dots}>
                  {games.length ? (
                    games
                      .slice(0, 3)
                      .map((g) => (
                        <View
                          key={g.id}
                          style={[
                            styles.dotMark,
                            { backgroundColor: palette.dark ? ACID : '#5b6d0c' }
                          ]}
                        />
                      ))
                  ) : (
                    <View
                      style={[styles.dash, { backgroundColor: palette.line }]}
                    />
                  )}
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={[styles.tabs, { backgroundColor: palette.mark }]}>
          {(
            [
              ['next', `Próximos · ${upcoming.length}`],
              ['drafts', `Rascunhos · ${drafts.length}`],
              ['past', 'Como foi']
            ] as const
          ).map(([key, label]) => {
            const on = tab === key
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select()
                  setTab(key)
                }}
                style={styles.tabItem}
              >
                {on ? (
                  <Animated.View
                    layout={reduced ? undefined : PILL}
                    style={[styles.tabPill, { backgroundColor: palette.card }]}
                  />
                ) : null}
                <Text
                  style={[
                    text(15, on ? 'Bold' : 'SemiBold', 1.2),
                    { color: on ? palette.ink : palette.muted }
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {events.isError ? (
          <ErrorState
            title="Não deu para carregar seus jogos."
            error={events.error}
            onRetry={() => events.refetch()}
            retrying={events.isFetching}
          />
        ) : shown.length === 0 ? (
          <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
            {events.isPending
              ? 'Carregando…'
              : tab === 'drafts'
                ? 'Nenhum rascunho.'
                : tab === 'past'
                  ? 'Os jogos que já passaram aparecem aqui, com quantos foram.'
                  : day
                    ? 'Nenhum jogo neste dia.'
                    : 'Nenhum jogo marcado. Toque em Novo jogo para publicar o próximo.'}
          </Text>
        ) : (
          [...groups].map(([d, games]) => (
            <View key={d} style={{ gap: 10 }}>
              <OwnerLabel>
                {d === brasiliaDay(now)
                  ? `Hoje · ${dayKicker(now).split(' ').slice(0, 2).join(' ')}`
                  : dayKicker(Date.parse(`${d}T15:00:00Z`))}
              </OwnerLabel>
              <OwnerCard>
                {games.map((game, index) => {
                  const state = gameState(game, now)
                  const n = count(game.id)
                  const full = n >= LOTANDO && state !== 'ended'
                  return (
                    <Pressable
                      key={game.id}
                      accessibilityRole="button"
                      accessibilityHint="Abre a edição do jogo"
                      onPress={() => edit(game.id)}
                    >
                      <OwnerRow first={index === 0}>
                        <Text
                          style={[
                            styles.time,
                            {
                              color:
                                state === 'live' ? palette.live : palette.muted
                            }
                          ]}
                        >
                          {formatTime(game.startsAt)}
                        </Text>
                        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                          <Text
                            numberOfLines={2}
                            style={[ownerText.name, { color: palette.ink }]}
                          >
                            {gameTitle(game)}
                          </Text>
                          {owner.elite &&
                          (state === 'live' || state === 'upcoming') ? (
                            <View
                              style={[
                                styles.track,
                                { backgroundColor: palette.mark }
                              ]}
                            >
                              <Animated.View
                                layout={reduced ? undefined : BAR}
                                style={[
                                  styles.fill,
                                  {
                                    width: `${Math.max(3, Math.min(100, (n / top) * 100))}%`,
                                    backgroundColor: palette.dark
                                      ? ACID
                                      : '#5b6d0c'
                                  }
                                ]}
                              />
                            </View>
                          ) : null}
                          <Text
                            numberOfLines={1}
                            style={[ownerText.line, { color: palette.muted }]}
                          >
                            {[
                              owner.elite &&
                              (state === 'live' || state === 'upcoming')
                                ? `${n} ${n === 1 ? 'vai' : 'vão'}`
                                : game.championship,
                              game.onBigScreen === false ? null : 'telão',
                              game.noHouseOffer || !owner.elite
                                ? null
                                : game.houseOffer || owner.bar?.houseOffer
                                  ? 'oferta'
                                  : null
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        </View>
                        <Tag state={state} full={full} />
                      </OwnerRow>
                    </Pressable>
                  )
                })}
              </OwnerCard>
            </View>
          ))
        )}
      </ScrollView>
      <View
        pointerEvents="box-none"
        style={[
          styles.newWrap,
          {
            bottom: nav.bottom + 14,
            left: 16 + nav.left,
            right: 16 + nav.right
          }
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/novo-jogo')}
          style={styles.new}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View style={styles.newFace}>
            <Icon name="plus" size={22} color={INK} />
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              Novo jogo
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  )
}

/** AO VIVO, LOTANDO (acid), PUBLICADO, RASCUNHO, ENCERRADO. */
function Tag({ state, full }: { state: GameState; full: boolean }) {
  const palette = usePalette()
  const live = state === 'live'
  const label = live
    ? 'AO VIVO'
    : full
      ? 'LOTANDO'
      : state === 'draft'
        ? 'RASCUNHO'
        : state === 'ended'
          ? 'ENCERRADO'
          : 'PUBLICADO'
  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: live ? palette.live : full ? ACID : palette.mark
        }
      ]}
    >
      <Text
        style={[styles.tagText, { color: live || full ? INK : palette.ink }]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-end' },
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
  week: { flexDirection: 'row', gap: 4 },
  day: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 2
  },
  dayName: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  dayNumber: { fontFamily: 'Anton', fontSize: 26, marginVertical: -4 },
  dots: { flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' },
  dotMark: { width: 6, height: 6, borderRadius: 3 },
  dash: { width: 8, height: 2, borderRadius: 1 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  tabItem: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 999
  },
  time: {
    width: 64,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 19,
    fontVariant: ['tabular-nums']
  },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  tag: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center'
  },
  tagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.77
  },
  newWrap: { position: 'absolute' },
  new: { height: 58 },
  newFace: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  }
})
