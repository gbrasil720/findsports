import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import type { inferRouterOutputs } from '@trpc/server'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { Photo } from '@/components/explore'
import {
  GameLine,
  GroupLabel,
  LineList,
  LineState
} from '@/components/game-line'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, Text, text } from '@/components/ui'
import type { VisitRow } from '@/components/your-bars'
import { formatTime } from '@/lib/explore'
import { distance } from '@/lib/explore-board'
import { dayShort } from '@/lib/my-games'
import { type BarSort, barGroups, dayKey, type YourBar } from '@/lib/your-bars'

/*
 * Seus bares no celular (rodada 4 do redesign, telas 3 e 3b): Já fui (o
 * placar do ano, o mês como calendário e as visitas do mês), Salvos (a semana
 * dos jogos dos salvos, dia a dia) e Bares (os salvos por bairro, perto ou
 * A–Z, com quantas vezes foi e arrastar para tirar). Fora do celular, os
 * layouts largos de `app/(fan)/favoritos.tsx` continuam.
 */

type SavedRow = inferRouterOutputs<AppRouter>['pubs']['getFavorites'][number]

const TZ = 'America/Sao_Paulo'
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** "2026-11": o mês em Brasília. */
const monthKey = (at: string | number) => dayKey(at).slice(0, 7)

// --- Já fui ----------------------------------------------------------------

export function PhoneVisits({
  now,
  visits,
  toRate,
  saved,
  onOpen,
  onRate,
  onGo
}: {
  now: number
  visits: VisitRow[]
  /** Os jogos que ainda pedem avaliação (`postGame.pending`). */
  toRate: Set<string>
  saved: SavedRow[]
  onOpen: (barId: string) => void
  onRate: (eventId: string) => void
  onGo: (barId: string, eventId: string) => void
}) {
  const palette = usePalette()
  const [month, setMonth] = useState(() => monthKey(now))
  const year = dayKey(now).slice(0, 4)
  const ofYear = visits.filter((v) => dayKey(v.startsAt).startsWith(year))
  if (!visits.length)
    return <FirstVisit now={now} year={year} saved={saved} onGo={onGo} />
  const stats = [
    [
      ofYear.length,
      `${ofYear.length === 1 ? 'visita' : 'visitas'}\nem ${year}`
    ],
    [
      new Set(ofYear.map((v) => v.barId)).size,
      `${new Set(ofYear.map((v) => v.barId)).size === 1 ? 'bar' : 'bares'}\ndiferentes`
    ],
    [
      ofYear.filter((v) => v.myStars).length,
      `${ofYear.filter((v) => v.myStars).length === 1 ? 'avaliação' : 'avaliações'}\nverificadas`
    ]
  ] as const
  const shown = visits.filter((v) => monthKey(v.startsAt) === month)
  return (
    <>
      <View style={styles.year}>
        {stats.map(([n, label]) => (
          <View key={label}>
            <Text style={[styles.yearNumber, { color: palette.ink }]}>{n}</Text>
            <Text style={[styles.yearLabel, { color: palette.muted }]}>
              {label.toLocaleUpperCase('pt-BR')}
            </Text>
          </View>
        ))}
      </View>
      <MonthCard
        month={month}
        now={now}
        days={new Set(visits.map((v) => dayKey(v.startsAt)))}
        first={monthKey(visits.at(-1)?.startsAt ?? now)}
        onMonth={setMonth}
      />
      {shown.length ? (
        <LineList>
          {shown.map((visit, index) => (
            <GameLine
              key={visit.eventId}
              first={index === 0}
              time={formatTime(visit.startsAt)}
              day={dayShort(visit.startsAt, now)}
              title={visit.barName}
              sub={gameTitle(visit)}
              onPress={
                toRate.has(visit.eventId)
                  ? () => onRate(visit.eventId)
                  : visit.barActive
                    ? () => onOpen(visit.barId)
                    : undefined
              }
              right={
                toRate.has(visit.eventId) ? (
                  <LineState kind="rate" label="Avaliar" />
                ) : visit.myStars ? (
                  <LineState kind="done" label={`★ ${visit.myStars}`} />
                ) : null
              }
            />
          ))}
        </LineList>
      ) : (
        <Text style={[text(14), { color: palette.muted }]}>
          Nenhuma visita neste mês.
        </Text>
      )}
    </>
  )
}

/** O mês como calendário (`.cal`): acid nos dias de visita, hoje marcado. */
function MonthCard({
  month,
  now,
  days,
  first,
  onMonth
}: {
  month: string
  now: number
  days: Set<string>
  /** O mês da primeira visita: antes dele não há o que ver. */
  first: string
  onMonth: (month: string) => void
}) {
  const palette = usePalette()
  // Sete colunas com 5 entre elas, na largura medida da grade.
  const [width, setWidth] = useState(0)
  const size = width ? (width - 6 * 5) / 7 : 0
  const [y, m] = month.split('-').map(Number) as [number, number]
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: 'UTC'
  })
  const today = dayKey(now)
  const shift = (by: number) => {
    const date = new Date(Date.UTC(y, m - 1 + by, 15))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const canBack = shift(-1) >= first
  const canNext = shift(1) <= monthKey(now)
  const cells = [
    ...Array.from({ length: lead }, (_, i) => ({ key: `e${i}`, day: 0 })),
    ...Array.from({ length: total }, (_, i) => ({
      key: `d${i + 1}`,
      day: i + 1
    }))
  ]
  return (
    <View
      style={[
        styles.cal,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <View style={styles.calHead}>
        <Text style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}>
          {name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1)}
        </Text>
        <View style={styles.calArrows}>
          {/* O mês troca seco: é dado que a pessoa lê. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
            disabled={!canBack}
            hitSlop={10}
            onPress={() => {
              haptic.select()
              onMonth(shift(-1))
            }}
            style={{ opacity: canBack ? 1 : 0.3 }}
          >
            <Icon name="back" size={18} color={palette.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mês seguinte"
            disabled={!canNext}
            hitSlop={10}
            onPress={() => {
              haptic.select()
              onMonth(shift(1))
            }}
            style={{ opacity: canNext ? 1 : 0.3 }}
          >
            <Icon name="next" size={18} color={palette.muted} />
          </Pressable>
        </View>
      </View>
      <View
        style={styles.grid}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {WEEKDAYS.map((letter, i) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: letras repetem
            key={i}
            style={[styles.weekLetter, { color: palette.muted, width: size }]}
          >
            {letter}
          </Text>
        ))}
        {cells.map(({ key, day }) => {
          if (!day)
            return <View key={key} style={{ width: size, height: size }} />
          const date = `${month}-${String(day).padStart(2, '0')}`
          const on = days.has(date)
          return (
            <View
              key={key}
              accessibilityLabel={on ? `Dia ${day}, com visita` : undefined}
              style={[
                { width: size, height: size },
                styles.day,
                { backgroundColor: on ? ACID : palette.mark },
                date === today && {
                  borderWidth: 2,
                  borderColor: palette.ink
                }
              ]}
            >
              <Text
                style={[
                  styles.dayText,
                  on
                    ? { color: INK, fontFamily: 'GeistMono-Bold' }
                    : { color: palette.muted }
                ]}
              >
                {day}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

/** Sem visita ainda (3b): como a visita conta e a primeira ida. */
function FirstVisit({
  now,
  year,
  saved,
  onGo
}: {
  now: number
  year: string
  saved: SavedRow[]
  onGo: (barId: string, eventId: string) => void
}) {
  const palette = usePalette()
  const next = saved
    .flatMap((s) => s.bar.events.map((game) => ({ s, game })))
    .filter(({ game }) => Date.parse(game.startsAt) > now)
    .sort((a, b) => a.game.startsAt.localeCompare(b.game.startsAt))[0]
  return (
    <>
      <View style={styles.year}>
        <View>
          <Text style={[styles.yearNumber, { color: palette.ink }]}>0</Text>
          <Text style={[styles.yearLabel, { color: palette.muted }]}>
            {`VISITAS\nEM ${year}`}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.how,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        {(
          [
            [
              'qr',
              'Código no balcão',
              'No bar Elite, mostre o código e a visita conta na hora.'
            ],
            [
              'pin',
              'Estou aqui',
              'Nos outros, faça o check-in a até 150 m do bar, na hora do jogo.'
            ]
          ] as const
        ).map(([icon, title, body], i) => (
          <View
            key={title}
            style={[
              styles.howRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
            ]}
          >
            <Icon name={icon} size={20} color={palette.ink} />
            <View style={{ flex: 1 }}>
              <Text style={[text(15, 'Bold', 1.3), { color: palette.ink }]}>
                {title}
              </Text>
              <Text
                style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
              >
                {body}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {next ? (
        <>
          <GroupLabel>Sua primeira ida</GroupLabel>
          <View
            style={[
              styles.first,
              palette.dark && {
                borderWidth: 1,
                borderColor: 'rgba(241,238,230,.08)'
              }
            ]}
          >
            <View style={styles.firstHead}>
              <Text style={styles.firstWhen}>
                {`${dayShort(next.game.startsAt, now)} · ${formatTime(next.game.startsAt)}`.toLocaleUpperCase(
                  'pt-BR'
                )}
              </Text>
              <Text style={styles.firstWhen}>
                {next.s.bar.name.toLocaleUpperCase('pt-BR')}
              </Text>
            </View>
            <Text numberOfLines={2} style={styles.firstTitle}>
              {gameTitle(next.game).toLocaleUpperCase('pt-BR')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => onGo(next.s.barId, next.game.id)}
              style={styles.firstButton}
            >
              <Text style={[text(14.5, 'Bold', 1.2), { color: INK }]}>
                Vou assistir aqui
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </>
  )
}

// --- Salvos ----------------------------------------------------------------

/** A semana dos salvos (`.day`): o dia à esquerda, os jogos à direita. */
export function PhoneSaved({
  now,
  saved,
  onOpen
}: {
  now: number
  saved: SavedRow[]
  onOpen: (barId: string) => void
}) {
  const palette = usePalette()
  const today = dayKey(now)
  const last = dayKey(now + 6 * 86_400_000)
  // O mesmo jogo em dois salvos vira uma linha com os dois bares.
  const games = new Map<
    string,
    { at: string; title: string; bars: { id: string; name: string }[] }
  >()
  for (const s of saved)
    for (const game of s.bar.events) {
      const day = dayKey(game.startsAt)
      if (day < today || day > last) continue
      const key = `${game.startsAt}|${gameTitle(game)}`
      const row = games.get(key) ?? {
        at: game.startsAt,
        title: gameTitle(game),
        bars: []
      }
      row.bars.push({ id: s.barId, name: s.bar.name })
      games.set(key, row)
    }
  const byDay = new Map<
    string,
    (typeof games extends Map<string, infer R> ? R : never)[]
  >()
  for (const row of [...games.values()].sort((a, b) =>
    a.at.localeCompare(b.at)
  )) {
    const day = dayKey(row.at)
    byDay.set(day, [...(byDay.get(day) ?? []), row])
  }
  const count = saved.length
  return (
    <>
      <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
        {byDay.size
          ? `A semana de jogos ${count === 1 ? 'do bar' : `dos ${count} bares`} que você salvou.`
          : `Nenhum jogo nos seus salvos nesta semana.`}
      </Text>
      {[...byDay].map(([day, rows]) => {
        const isToday = day === today
        const date = new Date(`${day}T12:00:00Z`)
        const weekday = date
          .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: TZ })
          .replace('.', '')
          .toLocaleUpperCase('pt-BR')
        const n = Number(day.slice(8))
        return (
          <View key={day} style={styles.dayRow}>
            <View style={{ width: 52 }}>
              <Text style={[styles.daySmall, { color: palette.muted }]}>
                {isToday ? 'HOJE' : weekday}
              </Text>
              <Text
                style={[
                  styles.dayBig,
                  { color: isToday ? palette.hot : palette.ink }
                ]}
              >
                {isToday ? `${weekday}\n${n}` : n}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              {rows.map((row) => (
                <Pressable
                  key={`${row.at}${row.title}`}
                  accessibilityRole="button"
                  onPress={() => {
                    const bar = row.bars[0]
                    if (bar) onOpen(bar.id)
                  }}
                  style={[
                    styles.dayGame,
                    { backgroundColor: palette.card, shadowColor: palette.drop }
                  ]}
                >
                  <Text style={[styles.dayTime, { color: palette.ink }]}>
                    {formatTime(row.at)}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={[text(14, 'Bold', 1.2), { color: palette.ink }]}
                    >
                      {row.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        text(12, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {row.bars.map((b) => b.name).join(' · ')}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )
      })}
    </>
  )
}

// --- Bares -----------------------------------------------------------------

export function PhoneBars({
  now,
  bars,
  neighborhoods,
  saved,
  onOpen,
  onRemove
}: {
  now: number
  bars: YourBar[]
  neighborhoods: { name: string; count: number }[]
  saved: SavedRow[]
  onOpen: (barId: string) => void
  onRemove: (barId: string) => void
}) {
  const palette = usePalette()
  const [sort, setSort] = useState<BarSort>('bairro')
  const today = dayKey(now)
  const playsToday = new Set(
    saved
      .filter((s) => s.bar.events.some((g) => dayKey(g.startsAt) === today))
      .map((s) => s.barId)
  )
  return (
    <>
      <View style={styles.sorts}>
        {(
          [
            ['bairro', 'Por bairro'],
            ['perto', 'Perto'],
            ['az', 'A–Z']
          ] as const
        ).map(([key, label]) => {
          const on = sort === key
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return
                haptic.select()
                setSort(key)
              }}
              style={[
                styles.sort,
                { backgroundColor: on ? palette.ink : palette.mark }
              ]}
            >
              <Text
                style={[
                  text(14, 'SemiBold', 1.2),
                  { color: on ? palette.bg : palette.ink }
                ]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {barGroups(bars, neighborhoods, sort)
        .filter((group) => group.bars.length)
        .map((group) => (
          <View key={group.key} style={{ gap: 12 }}>
            {group.label ? <GroupLabel>{group.label}</GroupLabel> : null}
            <LineList>
              {group.bars.map((bar, index) => (
                <SwipeRow key={bar.barId} onRemove={() => onRemove(bar.barId)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={bar.name}
                    accessibilityActions={[
                      { name: 'remove', label: 'Tirar dos salvos' }
                    ]}
                    onAccessibilityAction={() => onRemove(bar.barId)}
                    disabled={!bar.active}
                    onPress={() => onOpen(bar.barId)}
                    style={[
                      styles.barRow,
                      { backgroundColor: palette.card },
                      index > 0 && {
                        borderTopWidth: 1,
                        borderTopColor: palette.line
                      }
                    ]}
                  >
                    <Photo
                      uri={bar.photoUrl}
                      name={bar.name}
                      style={styles.barPhoto}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          text(15.5, 'Bold', 1.2),
                          { color: palette.ink }
                        ]}
                      >
                        {bar.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          text(12.5, 'Regular', 1.3),
                          { color: palette.muted }
                        ]}
                      >
                        {sort === 'bairro' || bar.km === null
                          ? bar.km === null
                            ? bar.neighborhood
                            : distance(bar.km)
                          : `${bar.neighborhood} · ${distance(bar.km)}`}
                      </Text>
                      {playsToday.has(bar.barId) ? (
                        <View style={styles.today}>
                          <Text style={styles.todayText}>TEM JOGO HOJE</Text>
                        </View>
                      ) : null}
                    </View>
                    {bar.visits ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.times, { color: palette.ink }]}>
                          {bar.visits}×
                        </Text>
                        <Text
                          style={[styles.timesLabel, { color: palette.muted }]}
                        >
                          FOI
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.times, { color: palette.muted }]}>
                        nunca
                      </Text>
                    )}
                  </Pressable>
                </SwipeRow>
              ))}
            </LineList>
          </View>
        ))}
    </>
  )
}

/**
 * Arrastar a linha para a esquerda revela "Tirar" (o gesto do iOS): soltar
 * passando de 40% ou com um flick tira; o aviso tem "Desfazer".
 */
function SwipeRow({
  children,
  onRemove
}: {
  children: React.ReactNode
  onRemove: () => void
}) {
  const palette = usePalette()
  return (
    <Swipeable
      friction={1}
      rightThreshold={140}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        haptic.select()
        onRemove()
      }}
      renderRightActions={() => (
        <View style={[styles.remove, { backgroundColor: palette.ink }]}>
          <Text style={[text(12, 'SemiBold', 1.2), { color: palette.bg }]}>
            Tirar
          </Text>
        </View>
      )}
    >
      {children}
    </Swipeable>
  )
}

/** O aviso de "tirado", com "Desfazer" (a linha volta). */
export function UndoToast({
  name,
  bottom,
  onUndo
}: {
  name: string
  bottom: number
  onUndo: () => void
}) {
  return (
    <View style={[styles.toast, { bottom }]}>
      <Text
        numberOfLines={1}
        style={[text(14, 'Regular', 1.3), { color: PAPER, flex: 1 }]}
      >
        {name} saiu dos salvos
      </Text>
      <Pressable accessibilityRole="button" hitSlop={10} onPress={onUndo}>
        <Text style={[text(14, 'Bold', 1.3), { color: ACID }]}>Desfazer</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  year: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  // Anton 48/.9: margem negativa no lugar do entrelinha curto.
  yearNumber: { fontFamily: 'Anton', fontSize: 48, marginVertical: -12.5 },
  yearLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.66,
    marginTop: 1
  },
  cal: {
    borderRadius: 22,
    padding: 14,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  calHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  calArrows: { flexDirection: 'row', gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  weekLetter: {
    textAlign: 'center',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    marginBottom: 1
  },
  day: { borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontFamily: 'GeistMono-SemiBold', fontSize: 10 },
  how: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  howRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12
  },
  first: {
    backgroundColor: INK,
    borderRadius: 24,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  firstHead: { flexDirection: 'row', justifyContent: 'space-between' },
  firstWhen: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    color: '#aaa9a4'
  },
  firstTitle: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    marginVertical: -7.3
  },
  firstButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  dayRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  daySmall: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 3
  },
  // Anton 26/1: margem negativa no lugar do entrelinha curto.
  dayBig: {
    fontFamily: 'Anton',
    fontSize: 26,
    lineHeight: 30,
    marginTop: -4
  },
  dayGame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  dayTime: { fontFamily: 'GeistMono-SemiBold', fontSize: 15 },
  sorts: { flexDirection: 'row', gap: 8 },
  sort: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    justifyContent: 'center'
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10
  },
  barPhoto: { width: 52, height: 52, borderRadius: 12 },
  today: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: ACID
  },
  todayText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    color: INK,
    marginVertical: -1.5
  },
  times: { fontFamily: 'GeistMono-SemiBold', fontSize: 14 },
  timesLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6
  },
  remove: {
    width: 72,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    marginLeft: 6
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: INK,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 }
  }
})
