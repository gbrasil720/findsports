import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import {
  DayBoard,
  OwnerCard,
  OwnerLabel,
  OwnerRow,
  ownerText,
  PlanNudge
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
import { dayMonth, delta, shortDate } from '@/lib/bar-owner'
import { useOwnerBar } from '@/lib/owner'
import { trpc } from '@/lib/trpc'

/*
 * Desempenho (rodada 10, tela 4, 30a): o número principal em placar com o
 * gráfico diário logo abaixo (arraste para ver o dia), o funil do perfil ao
 * balcão (viram, se interessaram, marcaram, validaram), os melhores jogos,
 * WhatsApp e rota, e a entrega Elite (aberta no Elite, bloqueada nos outros,
 * no lugar onde o dono sente falta dela).
 *
 * Movimento: arrastar o gráfico mostra o dia sob o dedo, 1:1 (marcador e
 * rótulo seguem o x; um toque de seleção por dia). O resto troca seco.
 */

const PERIODS = [7, 30, 90] as const
const BAR = LinearTransition.duration(300).easing(EASE)

export default function Desempenho() {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const entitlements = useQuery(
    trpc.commercialAnalytics.getMyEntitlements.queryOptions()
  )
  const max = entitlements.data?.maxDaysRetention ?? null
  const periods = PERIODS.filter((days) => max === null || days <= max)
  const [days, setDays] = useState<number>(30)
  const range = {
    from: brasiliaDay(Date.now(), -(days - 1)),
    to: brasiliaDay(Date.now())
  }
  const overview = useQuery(
    trpc.commercialAnalytics.getMyAnalyticsOverview.queryOptions(range)
  )
  const games = useQuery(
    trpc.commercialAnalytics.getMyEventAnalytics.queryOptions(range)
  )
  const d = overview.data
  const rows = games.data?.events ?? []
  const reserved = rows.reduce((sum, row) => sum + (row.reservedPeople ?? 0), 0)
  const arrivals = rows.reduce((sum, row) => sum + (row.arrivals ?? 0), 0)
  const best = [...rows]
    .sort((a, b) => (b.interestedPeople ?? 0) - (a.interestedPeople ?? 0))
    .slice(0, 3)
  // Sem resposta ainda (ou com erro nos jogos), "—": zero seria mentira.
  const gamesIn = games.isSuccess
  const funnel: { label: string; value: number | null }[] = [
    { label: 'Viram o bar', value: d?.uniqueVisitors ?? null },
    { label: 'Se interessaram', value: d?.interestedPeople ?? null },
    ...(owner.elite
      ? [
          { label: 'Marcaram que iam', value: gamesIn ? reserved : null },
          { label: 'Validaram no balcão', value: gamesIn ? arrivals : null }
        ]
      : [])
  ]
  const top = Math.max(1, ...funnel.map((row) => row.value ?? 0))

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
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: palette.muted }]}>
              {[
                `ÚLTIMOS ${days} DIAS`,
                owner.planName?.toLocaleUpperCase('pt-BR')
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[styles.title, { color: palette.ink }]}
            >
              Desempenho
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Período: ${days} dias. Toque para trocar.`}
            onPress={() => {
              haptic.select()
              const at = periods.indexOf(days as (typeof PERIODS)[number])
              setDays(periods[(at + 1) % periods.length] ?? 30)
            }}
            style={[styles.period, { backgroundColor: palette.card }]}
          >
            <Text style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}>
              {`${days} dias ▾`}
            </Text>
          </Pressable>
        </View>

        {overview.isError ? (
          <ErrorState
            title="Não deu para carregar os números."
            error={overview.error}
            onRetry={() => overview.refetch()}
            retrying={overview.isFetching}
          />
        ) : (
          <>
            <DayBoard
              kicker="PESSOAS VIRAM O BAR"
              aside={
                delta(d?.uniqueVisitorsChange)
                  ? `${(d?.uniqueVisitorsChange ?? 0) < 0 ? '▼' : '▲'} ${delta(d?.uniqueVisitorsChange)?.replace(/[+−]/, '')}`
                  : undefined
              }
            >
              <View style={{ flex: 1, gap: 10 }}>
                <Text style={styles.big}>
                  {d ? d.uniqueVisitors.toLocaleString('pt-BR') : '—'}
                </Text>
                {d ? <Chart points={d.dailyProfileViews} /> : null}
              </View>
            </DayBoard>

            <OwnerLabel>Do perfil ao balcão</OwnerLabel>
            <OwnerCard>
              {funnel.map((row, index) => (
                <View
                  key={row.label}
                  style={[styles.funnel, index === 0 && { paddingTop: 14 }]}
                  accessible
                  accessibilityLabel={`${row.label}: ${row.value ?? 'carregando'}`}
                >
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text
                      style={[
                        text(15.5, 'SemiBold', 1.2),
                        { color: palette.ink }
                      ]}
                    >
                      {row.label}
                    </Text>
                    <View
                      style={[styles.track, { backgroundColor: palette.mark }]}
                    >
                      <Animated.View
                        layout={reduced ? undefined : BAR}
                        style={[
                          styles.fill,
                          {
                            width: `${Math.max(2, ((row.value ?? 0) / top) * 100)}%`,
                            backgroundColor:
                              index === funnel.length - 1
                                ? ACID
                                : palette.dark
                                  ? PAPER
                                  : INK
                          }
                        ]}
                      />
                    </View>
                  </View>
                  <Text style={[styles.funnelValue, { color: palette.ink }]}>
                    {row.value === null
                      ? '—'
                      : row.value.toLocaleString('pt-BR')}
                  </Text>
                </View>
              ))}
              <View style={{ height: 8 }} />
            </OwnerCard>
            {owner.elite ? null : (
              <PlanNudge
                to="elite"
                title="Do perfil ao balcão, até o fim"
                body="No Elite o funil vai até quem marcou que ia e quem validou o código no balcão: a visita verificada."
              />
            )}

            {games.isError ? (
              <ErrorState
                title="Não deu para carregar os jogos."
                error={games.error}
                onRetry={() => games.refetch()}
                retrying={games.isFetching}
              />
            ) : best.length ? (
              <>
                <OwnerLabel>Melhores jogos</OwnerLabel>
                <OwnerCard>
                  {best.map((row, index) => (
                    <OwnerRow key={row.eventId} first={index === 0}>
                      <Text style={[styles.when, { color: palette.muted }]}>
                        {shortDate(row.startsAt)}
                      </Text>
                      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <Text
                          numberOfLines={1}
                          style={[ownerText.name, { color: palette.ink }]}
                        >
                          {row.eventName}
                        </Text>
                        <View
                          style={[
                            styles.track,
                            { backgroundColor: palette.mark }
                          ]}
                        >
                          <View
                            style={[
                              styles.fill,
                              {
                                width: `${Math.max(2, ((row.interestedPeople ?? 0) / Math.max(1, best[0]?.interestedPeople ?? 1)) * 100)}%`,
                                backgroundColor: ACID
                              }
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.score, { color: palette.ink }]}>
                        {owner.elite
                          ? `${row.arrivals ?? 0}/${row.reservedPeople ?? 0}`
                          : String(row.interestedPeople ?? 0)}
                      </Text>
                    </OwnerRow>
                  ))}
                </OwnerCard>
              </>
            ) : null}

            <View style={styles.pair}>
              <Small value={d?.whatsappOpened} label="WhatsApp" />
              <Small value={d?.directionsOpened} label="rota" />
            </View>

            <EliteCard
              elite={owner.elite}
              exposures={d?.classicExposures ?? null}
              clicks={d?.classicClicks ?? null}
            />
          </>
        )}
      </ScrollView>
    </View>
  )
}

/** O gráfico diário: arraste para ver o dia (1:1, um toque por dia). */
function Chart({ points }: { points: { date: string; value: number }[] }) {
  const [width, setWidth] = useState(0)
  const [at, setAt] = useState<number | null>(null)
  const max = Math.max(1, ...points.map((p) => p.value))
  const step = points.length ? width / points.length : 0
  // O dedo no UI thread: o marcador e o rótulo seguem o x 1:1; o JS só
  // fica sabendo quando o dia muda (o rótulo e um toque por dia).
  const x = useSharedValue(-1)
  const last = useSharedValue(-1)
  const choose = (index: number) => {
    haptic.select()
    setAt(index)
  }
  const follow = (to: number) => {
    'worklet'
    if (!step) return
    x.set(Math.max(0, Math.min(width, to)))
    const index = Math.max(
      0,
      Math.min(points.length - 1, Math.floor(to / step))
    )
    if (index === last.get()) return
    last.set(index)
    scheduleOnRN(choose, index)
  }
  const pan = Gesture.Pan()
    .minDistance(0)
    // Arrastar na vertical rola a tela; na horizontal, percorre os dias.
    .failOffsetY([-12, 12])
    .onBegin((e) => follow(e.x))
    .onUpdate((e) => follow(e.x))
  const marker = useAnimatedStyle(() => ({
    opacity: x.get() < 0 ? 0 : 1,
    transform: [{ translateX: x.get() - 1 }]
  }))
  const tip = useAnimatedStyle(() => ({
    opacity: x.get() < 0 ? 0 : 1,
    transform: [{ translateX: Math.max(0, Math.min(width - 96, x.get() - 48)) }]
  }))
  const chosen = at === null ? null : points[at]
  const best = points.reduce<(typeof points)[number] | null>(
    (top, p) => (!top || p.value > top.value ? p : top),
    null
  )
  const label = (p: { date: string } | undefined) =>
    p ? dayMonth(`${p.date}T15:00:00Z`) : ''
  return (
    <View style={{ gap: 6 }}>
      <GestureDetector gesture={pan}>
        <View
          accessible
          // VoiceOver: ajustável, um dia por gesto de subir ou descer.
          accessibilityRole="adjustable"
          accessibilityLabel={`Visualizações do perfil por dia, ${points.length} dias${best ? `; o melhor foi ${label(best)}, com ${best.value}` : ''}`}
          accessibilityValue={{
            text: chosen
              ? `${label(chosen)}: ${chosen.value}`
              : 'deslize para cima ou para baixo para ouvir cada dia'
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const from =
              at ??
              (e.nativeEvent.actionName === 'increment' ? -1 : points.length)
            const to = Math.max(
              0,
              Math.min(
                points.length - 1,
                from + (e.nativeEvent.actionName === 'increment' ? 1 : -1)
              )
            )
            setAt(to)
            x.set(step * to + step / 2)
          }}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={styles.chart}
        >
          {points.map((p, index) => (
            <View
              key={p.date}
              style={[
                styles.col,
                // 90 dias não cabem com vão de 3: as colunas sumiam.
                points.length > 31 && { marginHorizontal: -1 },
                {
                  height: Math.max(4, (p.value / max) * 100),
                  backgroundColor: index === at ? ACID : 'rgba(241,238,230,.16)'
                }
              ]}
            />
          ))}
          <Animated.View pointerEvents="none" style={[styles.marker, marker]} />
          {chosen && at !== null ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.tip, { left: 0 }, tip]}
            >
              <Text style={styles.tipText}>
                {`${label(chosen).toUpperCase()} · ${chosen.value}`}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{label(points[0])}</Text>
        <Text style={styles.axisText}>
          {label(points[Math.floor(points.length / 2)])}
        </Text>
        <Text style={styles.axisText}>{label(points.at(-1))}</Text>
      </View>
    </View>
  )
}

function Small({
  value,
  label
}: {
  value: number | null | undefined
  label: string
}) {
  const palette = usePalette()
  return (
    <View style={{ flex: 1 }}>
      <HardShadow color={palette.drop} offset={4} radius={20} />
      <View style={[styles.small, { backgroundColor: palette.card }]}>
        <Text style={[styles.smallValue, { color: palette.ink }]}>
          {value === null || value === undefined
            ? '—'
            : value.toLocaleString('pt-BR')}
        </Text>
        <Text style={[styles.smallLabel, { color: palette.muted }]}>
          {value === null ? `${label} · no Pro` : label}
        </Text>
      </View>
    </View>
  )
}

/** A entrega Elite nos clássicos: os números no Elite, o cadeado nos outros. */
function EliteCard({
  elite,
  exposures,
  clicks
}: {
  elite: boolean
  exposures: number | null
  clicks: number | null
}) {
  const palette = usePalette()
  return (
    <View>
      <HardShadow color={palette.drop} offset={4} radius={24} />
      <View
        style={[
          styles.elite,
          { backgroundColor: palette.card, borderColor: ACID }
        ]}
      >
        <View style={styles.eliteTag}>
          <Text style={styles.eliteTagText}>ELITE</Text>
        </View>
        <Text style={[text(18, 'Bold', 1.25), { color: palette.ink }]}>
          Entrega Elite nos clássicos
        </Text>
        <Text style={[text(14.5, 'Regular', 1.45), { color: palette.muted }]}>
          {elite && exposures !== null
            ? `O bar apareceu no topo da busca dos clássicos ${exposures.toLocaleString('pt-BR')} vezes${clicks ? `, com ${clicks.toLocaleString('pt-BR')} toques` : ''}.`
            : 'No Elite, o bar vai para o topo da busca nos clássicos, e a entrega aparece aqui.'}
        </Text>
        {!elite ? (
          <View style={styles.lock}>
            <Icon name="lock" size={16} color={palette.ink} />
            <Text style={[text(13.5, 'SemiBold', 1.2), { color: palette.ink }]}>
              Do plano Elite
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
  period: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    justifyContent: 'center'
  },
  big: {
    fontFamily: 'Anton',
    fontSize: 72,
    color: ACID,
    marginVertical: -17.5
  },
  chart: {
    height: 110,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginTop: 14
  },
  col: { flex: 1, borderRadius: 3 },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 2,
    backgroundColor: 'rgba(201,241,53,.6)'
  },
  tip: {
    position: 'absolute',
    top: -6,
    width: 96,
    height: 26,
    borderRadius: 8,
    backgroundColor: PAPER,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tipText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5, color: INK },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: '#aaa9a4'
  },
  funnel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8
  },
  funnelValue: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 18,
    fontVariant: ['tabular-nums']
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  when: { width: 60, fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  score: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 16,
    fontVariant: ['tabular-nums']
  },
  pair: { flexDirection: 'row', gap: 10 },
  small: { borderRadius: 20, padding: 14, gap: 2 },
  smallValue: { fontFamily: 'Anton', fontSize: 36, marginVertical: -8.7 },
  smallLabel: { marginTop: 12, fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  elite: { borderRadius: 24, borderWidth: 2, padding: 16, gap: 8 },
  eliteTag: {
    alignSelf: 'flex-start',
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  eliteTagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    color: INK
  },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 6 }
})
