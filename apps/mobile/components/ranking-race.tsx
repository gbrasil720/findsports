import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg'
import type { CityBoard } from '@/components/city-ranking'
import { initials } from '@/components/explore'
import { GroupLabel, LineList } from '@/components/game-line'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, PillButton, Text, text } from '@/components/ui'
import {
  firstName,
  histogramBars,
  lastLine,
  METRICS,
  type Metric,
  monthClock,
  monthLabel,
  unit
} from '@/lib/ranking'

/*
 * O ranking da rodada 6 (tela 3): o topo virou placar de tinta, com a métrica,
 * o relógio do fim do mês e um pódio de degraus; logo abaixo, a perseguição
 * ("Mais 1 bar e você passa a Marina"). Na cidade, a sua posição grande, a
 * fatia ("TOP 17%") e o histograma. As linhas andam para a posição nova ao
 * trocar a métrica (220 ms); números trocam seco.
 */

type Board = inferRouterOutputs<AppRouter>['ranking']['friends']
type Row = Board['rows'][number]

const ROW_MOVE = LinearTransition.duration(220).easing(EASE)

/** O cartão de tinta do placar, com os pontos de fundo. */
function Scoreboard({ children }: { children: ReactNode }) {
  const palette = usePalette()
  return (
    <View style={[styles.board, palette.dark && styles.boardDark]}>
      <View style={styles.dots} pointerEvents="none">
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="rk" width={7} height={7} patternUnits="userSpaceOnUse">
              <Circle cx={3.5} cy={3.5} r={1.2} fill="rgba(241,238,230,.09)" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#rk)" />
        </Svg>
      </View>
      {children}
    </View>
  )
}

/** "22d 04h" em dígitos de placar; muda por minuto, sem animação. */
function Clock({ month }: { month: string }) {
  const { days, hours } = monthClock(month, Date.now())
  return (
    <View style={styles.clock}>
      <Text style={styles.clockText}>
        {days}
        <Text style={styles.clockUnit}>d </Text>
        {String(hours).padStart(2, '0')}
        <Text style={styles.clockUnit}>h</Text>
      </Text>
    </View>
  )
}

function Head({ left, month }: { left: string; month: string }) {
  return (
    <View style={styles.head}>
      <Text style={styles.headText} numberOfLines={1}>
        {left.toLocaleUpperCase('pt-BR')}
      </Text>
      <Clock month={month} />
    </View>
  )
}

/** A perseguição: o que falta, em acid, com o atalho para os bares. */
function Chase({
  children,
  onBars
}: {
  children: ReactNode
  onBars?: () => void
}) {
  return (
    <View style={styles.chase}>
      <Icon name="fire" size={18} color={ACID} accent={ACID} />
      <Text style={[text(13.5, 'Regular', 1.35), styles.chaseText]}>
        {children}
      </Text>
      {onBars ? (
        <PillButton label="Ver bares" height={36} onPress={onBars} />
      ) : null}
    </View>
  )
}

const Strong = ({ children }: { children: ReactNode }) => (
  <Text style={{ fontFamily: 'Archivo-Bold', color: ACID }}>{children}</Text>
)

/** O placar dos amigos: pódio, perseguição, métricas e a lista. */
export function FriendsRace({
  data,
  metric,
  onMetric,
  onOpen,
  onBars
}: {
  data: Board
  metric: Metric
  onMetric: (metric: Metric) => void
  onOpen: (row: Row) => void
  onBars: () => void
}) {
  const palette = usePalette()
  const now = Date.now()
  const label = METRICS.find((m) => m.key === metric)?.label ?? ''
  const podium = data.rows.filter((row) => row.position <= 3)
  const rest = data.rows.filter((row) => row.position > 3)
  return (
    <>
      <Scoreboard>
        <Head
          left={`${monthLabel(data.month)} · ${metric === 'bars' ? 'bares diferentes' : label}`}
          month={data.month}
        />
        <View style={styles.podium}>
          {[2, 1, 3].map((place) => {
            const row = podium.find((r) => r.position === place)
            return row ? (
              <Step key={row.id} row={row} onPress={() => onOpen(row)} />
            ) : (
              <View key={place} style={{ flex: place === 1 ? 1.1 : 1 }} />
            )
          })}
        </View>
        {data.chase ? (
          <Chase onBars={metric === 'bars' ? onBars : undefined}>
            Mais{' '}
            <Strong>
              {data.chase.need} {unit(metric, data.chase.need)}
            </Strong>{' '}
            e você passa {firstName(data.chase.name)}.
          </Chase>
        ) : null}
      </Scoreboard>

      <View style={styles.chips}>
        {METRICS.map((m) => {
          const on = m.key === metric
          return (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (on) return
                haptic.select()
                onMetric(m.key)
              }}
              style={[
                styles.chip,
                { backgroundColor: on ? palette.ink : palette.mark }
              ]}
            >
              <Text
                style={[
                  text(13.5, 'SemiBold', 1.2),
                  { color: on ? palette.bg : palette.ink }
                ]}
              >
                {m.key === 'bars' ? 'Bares' : m.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {rest.length ? (
        <LineList>
          {rest.map((row, i) => {
            const last = lastLine(row.lastAt, row.firstAt, now)
            return (
              <Animated.View key={row.id} layout={ROW_MOVE}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpen(row)}
                  style={[
                    styles.row,
                    i > 0 &&
                      !row.me && {
                        borderTopWidth: 1,
                        borderTopColor: palette.line
                      },
                    row.me && [styles.rowMe, { backgroundColor: palette.ink }]
                  ]}
                >
                  <Text
                    style={[
                      styles.position,
                      { color: row.me ? palette.bg : palette.muted }
                    ]}
                  >
                    {row.position}
                  </Text>
                  <View
                    style={[styles.face, { backgroundColor: palette.mark }]}
                  >
                    <Text
                      style={[text(13, 'Bold', 1.1), { color: palette.ink }]}
                    >
                      {initials(row.name).slice(0, 1)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        text(15, 'Bold', 1.2),
                        { color: row.me ? palette.bg : palette.ink }
                      ]}
                    >
                      {row.me ? 'Você' : firstName(row.name)}
                    </Text>
                    <Text
                      style={[
                        styles.hint,
                        { color: row.me ? palette.bg : palette.muted },
                        row.me && { opacity: 0.7 }
                      ]}
                    >
                      nível {row.level}
                      {last ? ` · ${last}` : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.value,
                      { color: row.me ? palette.bg : palette.ink }
                    ]}
                  >
                    {row.value}
                  </Text>
                  <Arrow move={row.move} />
                </Pressable>
              </Animated.View>
            )
          })}
        </LineList>
      ) : null}
    </>
  )
}

/** Um degrau do pódio: rosto, nome e o bloco com a posição e o número. */
function Step({ row, onPress }: { row: Row; onPress: () => void }) {
  const first = row.position === 1
  const size = first ? 56 : 46
  const face = row.me
    ? { bg: INK, fg: ACID }
    : row.position === 2
      ? { bg: ACID, fg: INK }
      : { bg: PAPER, fg: INK }
  const block =
    row.position === 1
      ? { height: 96, backgroundColor: ACID }
      : row.position === 2
        ? { height: 72, backgroundColor: PAPER }
        : {
            height: 56,
            backgroundColor: '#34342d',
            borderWidth: 2,
            borderColor: ACID
          }
  const ink = row.position === 3 ? PAPER : INK
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.position}º, ${row.me ? 'você' : row.name}, ${row.value}`}
      onPress={onPress}
      style={[styles.step, { flex: first ? 1.1 : 1 }]}
    >
      {row.move ? (
        <Text style={[styles.move, { color: row.move > 0 ? ACID : '#aaa9a4' }]}>
          {row.move > 0 ? `▲${row.move}` : `▼${-row.move}`}
        </Text>
      ) : null}
      {first ? (
        <Icon name="medal" size={20} color={ACID} accent={ACID} />
      ) : null}
      <View
        style={[
          styles.stepFace,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: face.bg
          }
        ]}
      >
        <Text style={[text(first ? 21 : 17, 'Bold', 1.1), { color: face.fg }]}>
          {row.me ? initials(row.name) : initials(row.name).slice(0, 1)}
        </Text>
      </View>
      <Text numberOfLines={1} style={[text(13, 'Bold', 1.2), { color: PAPER }]}>
        {row.me ? 'Você' : firstName(row.name)}
      </Text>
      <View style={[styles.block, block]}>
        <Text style={[styles.blockPlace, { color: ink }]}>{row.position}º</Text>
        <Text style={[styles.blockValue, { color: ink }]}>{row.value}</Text>
      </View>
    </Pressable>
  )
}

function Arrow({ move }: { move: number | null }) {
  const palette = usePalette()
  return (
    <Text
      style={[
        styles.arrow,
        {
          color:
            move && move > 0 ? (palette.dark ? ACID : '#5b6d0c') : palette.muted
        }
      ]}
    >
      {move === null
        ? ''
        : move === 0
          ? '—'
          : move > 0
            ? `▲${move}`
            : `▼${-move}`}
    </Text>
  )
}

/** A cidade: a sua posição grande, a fatia, o histograma, o topo e a vizinhança. */
export function CityRace({
  data,
  onAll
}: {
  data: CityBoard
  onAll: () => void
}) {
  const palette = usePalette()
  const bars = histogramBars(data.histogram, data.mine)
  const top3 = data.rows.filter((row) => row.position <= 3)
  const around = data.around
  const gap = (around[0]?.position ?? 0) - 4
  const unitWord = data.metric === 'bars' ? ['bar', 'bares'] : ['jogo', 'jogos']
  const word = (n: number) => `${n} ${n === 1 ? unitWord[0] : unitWord[1]}`
  return (
    <>
      <Scoreboard>
        <Head
          left={`${data.city} · ${monthLabel(data.month)}`}
          month={data.month}
        />
        {data.position ? (
          <View style={styles.you}>
            <View>
              <Text style={styles.youKicker}>VOCÊ ESTÁ EM</Text>
              <Text style={styles.youBig}>{data.position}º</Text>
              <Text style={[text(12.5, 'Regular', 1.3), styles.youSub]}>
                de {data.total.toLocaleString('pt-BR')}{' '}
                {data.total === 1 ? 'torcedor' : 'torcedores'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {data.top ? (
                <Text style={styles.youTop}>TOP {data.top}%</Text>
              ) : null}
              {data.weekMove ? (
                <Text style={[text(12.5, 'Regular', 1.3), styles.youSub]}>
                  {data.weekMove > 0 ? '▲' : '▼'}{' '}
                  {Math.abs(data.weekMove).toLocaleString('pt-BR')}{' '}
                  {Math.abs(data.weekMove) === 1 ? 'posição' : 'posições'} na
                  semana
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}
        {bars.length > 1 ? (
          <>
            <View style={styles.hist}>
              {bars.map((bar) => (
                <View
                  key={bar.from}
                  style={[
                    styles.histBar,
                    {
                      height: Math.max(4, bar.share * 72),
                      backgroundColor: bar.me ? ACID : '#34342d'
                    }
                  ]}
                />
              ))}
            </View>
            <View style={styles.histLabels}>
              <Text style={styles.histLabel}>{word(1)}</Text>
              <Text style={styles.histLabel}>você · {data.mine}</Text>
              <Text style={styles.histLabel}>{word(bars.at(-1)?.to ?? 1)}</Text>
            </View>
          </>
        ) : null}
      </Scoreboard>

      {top3.length ? (
        <>
          <GroupLabel>O topo</GroupLabel>
          <LineList>
            {top3.map((row, i) => (
              <CityLine key={row.id} row={row} first={i === 0} gold />
            ))}
          </LineList>
        </>
      ) : null}
      {gap > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ver a lista inteira"
          onPress={onAll}
          style={styles.cut}
        >
          {/* Borda tracejada de um lado só não aparece no iOS: SVG. */}
          {(['top', 'bottom'] as const).map((side) => (
            <Svg
              key={side}
              height={2}
              style={[
                styles.cutLine,
                side === 'top' ? { top: 0 } : { bottom: 0 }
              ]}
            >
              <Line
                x1={0}
                y1={1}
                x2="100%"
                y2={1}
                stroke={palette.line}
                strokeWidth={1.5}
                strokeDasharray="5,4"
              />
            </Svg>
          ))}
          <Icon name="ranking" size={16} color={palette.muted} />
          <Text style={[styles.cutText, { color: palette.muted }]}>
            {gap.toLocaleString('pt-BR')}{' '}
            {gap === 1 ? 'TORCEDOR' : 'TORCEDORES'} ENTRE O TOPO E VOCÊ
          </Text>
        </Pressable>
      ) : null}
      {around.length && (around[0]?.position ?? 0) > 3 ? (
        <LineList>
          {around.map((row, i) => (
            <CityLine key={row.id} row={row} first={i === 0} />
          ))}
        </LineList>
      ) : null}
      {data.chase ? (
        <View style={[styles.chase, styles.chaseCity]}>
          <Icon name="fire" size={18} color={ACID} accent={ACID} />
          <Text style={[text(13.5, 'Regular', 1.35), styles.chaseText]}>
            Mais <Strong>{word(data.chase.need)}</Strong> e você sobe para o top{' '}
            {data.chase.top}%.
          </Text>
        </View>
      ) : null}
    </>
  )
}

function CityLine({
  row,
  first,
  gold
}: {
  row: CityBoard['rows'][number]
  first: boolean
  gold?: boolean
}) {
  const palette = usePalette()
  const fg = row.me ? palette.bg : palette.ink
  return (
    <View
      style={[
        styles.row,
        !first &&
          !row.me && { borderTopWidth: 1, borderTopColor: palette.line },
        row.me && [styles.rowMe, { backgroundColor: palette.ink }]
      ]}
    >
      {gold ? (
        <View style={styles.gold}>
          <Text style={[styles.position, { color: INK, fontSize: 13 }]}>
            {row.position}
          </Text>
        </View>
      ) : (
        <Text
          style={[
            styles.position,
            { color: row.me ? palette.bg : palette.muted, width: 34 }
          ]}
        >
          {row.position}
        </Text>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[text(15, 'Bold', 1.2), { color: fg }]}>
          {row.name}
        </Text>
        {row.username ? (
          <Text
            style={[
              styles.hint,
              { color: row.me ? palette.bg : palette.muted },
              row.me && { opacity: 0.7 }
            ]}
          >
            @{row.username}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.value, { color: fg }]}>{row.value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  board: {
    borderRadius: 26,
    backgroundColor: INK,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  boardDark: {
    backgroundColor: '#1f1f1a',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.08)'
  },
  dots: { ...StyleSheet.absoluteFill, borderRadius: 26, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8
  },
  headText: {
    flex: 1,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.84,
    color: '#aaa9a4'
  },
  clock: {
    backgroundColor: '#26261f',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  clockText: { fontFamily: 'GeistMono-SemiBold', fontSize: 16, color: ACID },
  clockUnit: { fontSize: 10, color: '#aaa9a4' },
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  step: { alignItems: 'center', gap: 6 },
  move: {
    position: 'absolute',
    top: -2,
    right: 6,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10
  },
  stepFace: { alignItems: 'center', justifyContent: 'center' },
  block: {
    alignSelf: 'stretch',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    alignItems: 'center',
    paddingTop: 8,
    gap: 2
  },
  // Anton 18/1 e mono 26/1: margens negativas no lugar do entrelinha curto.
  blockPlace: {
    fontFamily: 'Anton',
    fontSize: 18,
    opacity: 0.75,
    marginVertical: -4.4
  },
  blockValue: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 26,
    marginTop: 6
  },
  chase: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(201,241,53,.12)'
  },
  chaseCity: { backgroundColor: INK },
  chaseText: { flex: 1, color: PAPER },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    justifyContent: 'center'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10
  },
  rowMe: { marginHorizontal: -14, paddingHorizontal: 14, borderRadius: 14 },
  position: {
    width: 28,
    textAlign: 'center',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 15
  },
  face: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  hint: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  value: { fontFamily: 'GeistMono-SemiBold', fontSize: 17 },
  arrow: {
    width: 40,
    textAlign: 'right',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11
  },
  you: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end'
  },
  youKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: '#aaa9a4'
  },
  // Anton 64/.9: margem negativa no lugar do entrelinha curto.
  youBig: {
    fontFamily: 'Anton',
    fontSize: 64,
    color: ACID,
    marginVertical: -18,
    marginTop: -10
  },
  youSub: { color: '#aaa9a4' },
  youTop: { fontFamily: 'GeistMono-SemiBold', fontSize: 22, color: PAPER },
  hist: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 76 },
  histBar: { flex: 1, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  histLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6
  },
  histLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    color: '#aaa9a4'
  },
  gold: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4
  },
  cut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6
  },
  cutLine: { position: 'absolute', left: 0, right: 0 },
  cutText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 0.92
  }
})
