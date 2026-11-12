import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  FadeInUp,
  LinearTransition,
  useReducedMotion
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BoardCell,
  DayBoard,
  OkPill,
  OwnerCard,
  OwnerLabel,
  OwnerRow,
  ownerText,
  PlanNudge,
  StateTag,
  useMinuteNow
} from '@/components/bar-owner'
import { askBarTour, FirstSteps } from '@/components/bar-tour'
import { HardShadow, initials } from '@/components/explore'
import { useNavInsets } from '@/components/layout'
import { EASE, haptic } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import { useTourTarget } from '@/components/tour'
import {
  ACID,
  ErrorState,
  Icon,
  INK,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { hasCatalog, useWeekGames, WeekCarousel } from '@/components/week-games'
import {
  dayKicker,
  delta,
  gameState,
  todayGames,
  visitLine,
  weekdayName
} from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'

/*
 * Hoje na casa (rodada 10, tela 1, 2r): o placar do dia em tinta (jogos de
 * hoje, quantos vão, o interesse contra o normal do dia da semana), quem
 * chegou agora (código validado hoje, com a visita), a agenda de hoje com o
 * ao vivo, a semana contra a anterior e uma sugestão de jogo.
 *
 * Movimento: chegou alguém, a linha nova entra no topo e as outras descem
 * (LinearTransition 220 ms; entra por opacidade e −8 pt; háptico leve).
 * Números do dia trocam seco.
 */

const ARRIVE = FadeInUp.duration(220)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: -8 }] })
const SLIDE = LinearTransition.duration(220).easing(EASE)

export default function Casa() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const nav = useNavInsets()
  const reduced = useReducedMotion()
  const soon = useSoon()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const now = useMinuteNow()
  const owner = useOwnerBar()
  const bar = owner.bar
  const day = brasiliaDay(now)
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    enabled: owner.elite,
    refetchInterval: 30_000
  })
  const interest = useQuery({
    ...trpc.commercialAnalytics.getMyWeekdayInterest.queryOptions({ day }),
    refetchInterval: 60_000
  })
  const week = useQuery(
    trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions({
      from: brasiliaDay(now, -6),
      to: day
    })
  )
  const suggestions = useWeekGames()
  const tourBoard = useTourTarget('bar-board')

  const games = todayGames(events.data ?? [], now)
  const live = games.filter((game) => gameState(game, now) === 'live').length
  const goingById = new Map((going.data ?? []).map((g) => [g.id, g]))
  const goingToday = games.reduce(
    (sum, game) => sum + (goingById.get(game.id)?.people.length ?? 0),
    0
  )
  // Quem validou o código hoje, do mais recente para o mais antigo.
  const arrivals = (going.data ?? [])
    .flatMap((game) =>
      game.people.filter(
        (p) => p.validatedAt && brasiliaDay(p.validatedAt) === day
      )
    )
    .sort(
      (a, b) =>
        new Date(b.validatedAt ?? 0).getTime() -
        new Date(a.validatedAt ?? 0).getTime()
    )
  // Chegou alguém: um toque leve (a linha entra sozinha).
  const newest = arrivals[0]?.validatedAt
  // `undefined` até a primeira resposta: o que já estava lá ao abrir não
  // vibra nem entra animado; a primeira chegada do dia, sim.
  const [seen, setSeen] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!going.isFetched) return
    const at = newest ? String(newest) : null
    if (seen !== undefined && at && at !== seen) haptic.light()
    setSeen(at)
  }, [newest, seen, going.isFetched])
  const settled = seen !== undefined

  const change = interest.data?.changePercent ?? null
  const offer = bar?.houseOffer ?? null
  // Com o catálogo, a semana vai no carrossel (WEB-433); sem, a sugestão de
  // sempre, dos bares perto, no fim da tela.
  const suggestion = hasCatalog(suggestions.data)
    ? undefined
    : suggestions.data?.[0]

  if (owner.error)
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ErrorState
          title="Não deu para abrir o seu bar."
          error={owner.error}
          onRetry={() => owner.refetch()}
        />
      </View>
    )

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 18,
          paddingBottom: nav.bottom + 32,
          paddingLeft: 16 + nav.left,
          paddingRight: 16 + nav.right,
          gap: 14
        }}
      >
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {/* Nome longo encolhe com reticências; o plano fica sempre. */}
            <View style={{ flexDirection: 'row' }}>
              <Text
                numberOfLines={1}
                style={[styles.kicker, { color: palette.muted, flexShrink: 1 }]}
              >
                {(bar?.name ?? '').toLocaleUpperCase('pt-BR')}
              </Text>
              {owner.planName ? (
                <Text style={[styles.kicker, { color: palette.muted }]}>
                  {` · ${owner.planName.toLocaleUpperCase('pt-BR')}`}
                </Text>
              ) : null}
            </View>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.title, { color: palette.ink }]}
            >
              Hoje na casa
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Avisos"
            onPress={() =>
              soon.show('Os avisos do bar chegam ao app em breve.')
            }
            style={styles.bell}
          >
            <HardShadow color={palette.drop} offset={3} radius={22} />
            <View style={[styles.bellFace, { backgroundColor: palette.card }]}>
              <Icon name="bell" size={20} color={palette.ink} />
            </View>
          </Pressable>
        </View>

        <View ref={tourBoard} collapsable={false}>
          <DayBoard
            kicker={dayKicker(now)}
            live={live ? `${live} AO VIVO` : undefined}
          >
            <BoardCell
              value={String(games.length)}
              label={games.length === 1 ? 'jogo\nhoje' : 'jogos\nhoje'}
            />
            <BoardCell
              value={owner.elite ? String(goingToday) : '—'}
              label={'vão\nassistir'}
            />
            <BoardCell
              grow={1.7}
              hot={change !== null && change > 0}
              value={change === null ? '—' : (delta(change) ?? '—')}
              label={
                change === null
                  ? `interesse ${weekdayName(now)}, ainda sem base`
                  : Math.round(change) === 0
                    ? `interesse igual ao normal ${weekdayName(now)}`
                    : `interesse ${change < 0 ? 'abaixo' : 'acima'} do normal ${weekdayName(now)}`
              }
            />
          </DayBoard>
        </View>

        <FirstSteps onTour={askBarTour} />

        <WeekCarousel gutter={16 + nav.left} />

        {owner.bar && !owner.elite && owner.trial ? (
          <PlanNudge
            compact
            to="elite"
            title="Quem vai assistir no seu bar"
            body="No Elite, “vão assistir” vira nome e número, e o código do balcão mostra quem veio pela Onside."
          />
        ) : null}

        {owner.elite ? (
          <>
            <OwnerLabel>
              {`Chegaram agora · ${arrivals.length} ${arrivals.length === 1 ? 'código validado' : 'códigos validados'}`}
            </OwnerLabel>
            <OwnerCard>
              {arrivals.length ? (
                arrivals.slice(0, 5).map((person, index) => (
                  <Animated.View
                    key={`${person.useId ?? person.name}-${String(person.validatedAt)}`}
                    entering={reduced || !settled ? undefined : ARRIVE}
                    layout={reduced ? undefined : SLIDE}
                  >
                    <OwnerRow first={index === 0}>
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor:
                              index % 2 === 0
                                ? ACID
                                : palette.dark
                                  ? '#2a2a24'
                                  : INK
                          }
                        ]}
                      >
                        <Text
                          style={[
                            text(16, 'Bold', 1.1),
                            {
                              color: index % 2 === 0 ? INK : ACID
                            }
                          ]}
                        >
                          {initials(person.name).slice(0, 1)}
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
                            ? `${formatTime(person.validatedAt)} · `
                            : ''}
                          {person.arrival ? visitLine(person.arrival) : ''}
                        </Text>
                      </View>
                      <OkPill>
                        {person.arrival?.offer ? 'Oferta liberada' : 'Validou'}
                      </OkPill>
                    </OwnerRow>
                  </Animated.View>
                ))
              ) : (
                <Text
                  style={[
                    text(14.5, 'Regular', 1.45),
                    { color: palette.muted, paddingVertical: 16 }
                  ]}
                >
                  Ninguém validou o código hoje ainda. Quem chegar e mostrar o
                  código aparece aqui.
                </Text>
              )}
            </OwnerCard>
          </>
        ) : null}

        <OwnerLabel>
          {offer && owner.elite
            ? `Hoje na casa · oferta: ${offer.length > 34 ? `${offer.slice(0, 33).trimEnd()}…` : offer}`
            : 'Hoje na casa'}
        </OwnerLabel>
        <OwnerCard>
          {events.isError ? (
            <View style={{ paddingVertical: 12 }}>
              <ErrorState
                kind="block"
                error={events.error}
                onRetry={() => events.refetch()}
                retrying={events.isFetching}
              />
            </View>
          ) : games.length ? (
            games.map((game, index) => {
              const state = gameState(game, now)
              const people = goingById.get(game.id)?.people ?? []
              const validated = people.filter((p) => p.validatedAt).length
              return (
                <Pressable
                  key={game.id}
                  accessibilityRole="button"
                  accessibilityHint="Abre a edição do jogo"
                  onPress={() =>
                    router.push({
                      pathname: '/novo-jogo',
                      params: { id: game.id }
                    })
                  }
                >
                  <OwnerRow first={index === 0}>
                    <Text
                      style={[
                        styles.time,
                        {
                          color: state === 'live' ? palette.live : palette.muted
                        }
                      ]}
                    >
                      {formatTime(game.startsAt)}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={2}
                        style={[ownerText.name, { color: palette.ink }]}
                      >
                        {gameTitle(game)}
                      </Text>
                      {owner.elite ? (
                        <Text
                          numberOfLines={1}
                          style={[ownerText.line, { color: palette.muted }]}
                        >
                          {[
                            people.length
                              ? `${people.length} ${people.length === 1 ? 'vai' : 'vão'}`
                              : 'ninguém marcou ainda',
                            validated
                              ? `${validated} ${validated === 1 ? 'validou' : 'validaram'}`
                              : null
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      ) : (
                        <Text
                          numberOfLines={1}
                          style={[ownerText.line, { color: palette.muted }]}
                        >
                          {game.championship}
                        </Text>
                      )}
                    </View>
                    <StateTag state={state} />
                  </OwnerRow>
                </Pressable>
              )
            })
          ) : (
            <Text
              style={[
                text(14.5, 'Regular', 1.45),
                { color: palette.muted, paddingVertical: 16 }
              ]}
            >
              {events.isPending
                ? 'Carregando a agenda…'
                : 'Nenhum jogo hoje. Publique um em Jogos para aparecer no Explorar.'}
            </Text>
          )}
        </OwnerCard>

        <OwnerLabel>Últimos 7 dias · vs. os 7 anteriores</OwnerLabel>
        <View style={styles.weekRow}>
          <WeekCell
            value={week.data?.uniqueVisitors}
            label="viram o bar"
            change={week.data?.uniqueVisitorsChange}
          />
          <WeekCell
            value={week.data?.interestedPeople}
            label="se interessaram"
            change={week.data?.interestedPeopleChange}
          />
          <WeekCell
            value={week.data?.highIntentActions}
            label="contatos"
            change={week.data?.highIntentActionsChange}
          />
        </View>

        {suggestion ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${suggestion.title} na sua grade?`}
            onPress={() =>
              router.push({
                pathname: '/novo-jogo',
                params: { sugestao: suggestion.key }
              })
            }
          >
            <HardShadow color={palette.drop} offset={4} radius={24} />
            <View
              style={[
                styles.suggest,
                { backgroundColor: palette.card, borderColor: ACID }
              ]}
            >
              <Icon name="fire" size={22} color={palette.muted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={2}
                  style={[text(17, 'Bold', 1.25), { color: palette.ink }]}
                >
                  {suggestion.title} na sua grade?
                </Text>
                <Text
                  numberOfLines={1}
                  style={[ownerText.line, { color: palette.muted }]}
                >
                  {suggestionWhen(suggestion.startsAt, now)} · outros bares
                  perto já marcaram
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

function WeekCell({
  value,
  label,
  change
}: {
  value: number | null | undefined
  label: string
  change: number | null | undefined
}) {
  const palette = usePalette()
  const shown = delta(change)
  return (
    <View
      style={{ flex: 1 }}
      accessible
      accessibilityLabel={`${value ?? 'sem dado'} ${label}${shown ? `, ${shown}` : ''}`}
    >
      <HardShadow color={palette.drop} offset={4} radius={20} />
      <View style={[styles.weekCell, { backgroundColor: palette.card }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.weekValue, { color: palette.ink }]}
        >
          {value === null || value === undefined
            ? '—'
            : value.toLocaleString('pt-BR')}
        </Text>
        <Text style={[styles.weekLabel, { color: palette.muted }]}>
          {label}
        </Text>
        {shown ? (
          <Text
            style={[
              styles.weekDelta,
              {
                color: shown.startsWith('−')
                  ? palette.muted
                  : palette.dark
                    ? ACID
                    : '#5b6d0c'
              }
            ]}
          >
            {shown}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/** "Sáb 16:00". */
function suggestionWhen(startsAt: string, now: number) {
  const day =
    brasiliaDay(startsAt) === brasiliaDay(now)
      ? 'Hoje'
      : new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          weekday: 'short'
        })
          .format(new Date(startsAt))
          .replace('.', '')
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${formatTime(startsAt)}`
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: 24 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
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
  bell: { width: 44, height: 44, marginBottom: 2 },
  bellFace: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Largura mínima, não fixa: com o texto grande do iOS, "21:30" não quebra.
  time: {
    minWidth: 64,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 19,
    fontVariant: ['tabular-nums']
  },
  weekRow: { flexDirection: 'row', gap: 10 },
  weekCell: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 2
  },
  weekValue: {
    fontFamily: 'Anton',
    fontSize: 30,
    marginVertical: -7.3
  },
  weekLabel: {
    marginTop: 8,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    lineHeight: 14
  },
  weekDelta: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5
  },
  suggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 24,
    borderWidth: 2
  }
})
