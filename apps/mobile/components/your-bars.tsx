import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import Animated, { FadeIn } from 'react-native-reanimated'
import Svg, { G, Path } from 'react-native-svg'
import { Card } from '@/components/card'
import {
  dayLabel,
  dropBox,
  HardShadow,
  MapDrop,
  Photo
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { usePressScale } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  text
} from '@/components/ui'
import { formatKm, formatTime, isLive } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'
import {
  dayMonth,
  type MemoryBar,
  monthGrids,
  WEEK_LETTERS
} from '@/lib/your-bars'

/*
 * As peças de Seus bares fora do celular (A04 do design): o calendário do mês
 * inteiro e as visitas em cards com foto (tablet em pé), a lembrança do bar
 * tocado (dobrável aberto e tablet deitado) e o mapa de onde você foi (tablet
 * deitado). A tela fica em `app/(fan)/favoritos.tsx`.
 */

export type VisitRow =
  inferRouterOutputs<AppRouter>['attendance']['visits'][number]

/** O coração do design: vermelho cheio salvo, apagado quando não. */
export function SavedHeart({ on }: { on: boolean }) {
  const palette = usePalette()
  const color = on ? palette.live : palette.muted
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <G opacity={on ? 1 : 0.25}>
        <Path
          d="M12 21s-8.6-5-8.6-11.2A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.6 3.2C20.6 16 12 21 12 21z"
          fill={color}
        />
      </G>
      <Path
        d="M12 18.6s-6.4-3.9-6.4-8.5A3.2 3.2 0 0 1 12 8.9a3.2 3.2 0 0 1 6.4 1.2c0 4.6-6.4 8.5-6.4 8.5z"
        fill={color}
      />
      <Path
        d="M19.3 2.2l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"
        fill={on ? palette.ink : palette.muted}
      />
    </Svg>
  )
}

const glowOf = (dark: boolean) =>
  dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'

/**
 * O mês anterior e o atual lado a lado (tablet em pé): cada quadrado acid é um
 * jogo com código validado; o da visita mais recente sai em tinta.
 */
export function MonthsCard({
  visits,
  now,
  selected,
  cell
}: {
  visits: { startsAt: string | Date }[]
  now: number
  /** O dia selecionado ("2026-10-04"). */
  selected: string | null
  cell: number
}) {
  const palette = usePalette()
  const off = palette.dark ? '#262621' : palette.mark
  return (
    <Card shadow={glowOf(palette.dark)} offset={5}>
      <View style={styles.months}>
        <View style={styles.monthRow}>
          {monthGrids(visits, now).map((month) => {
            const weeks = Array.from(
              { length: Math.ceil(month.cells.length / 7) },
              (_, w) =>
                Array.from(
                  { length: 7 },
                  (_, d) => month.cells[w * 7 + d] ?? null
                )
            )
            return (
              <View key={month.key} style={styles.month}>
                <View style={styles.monthHead}>
                  <Text style={[styles.monthName, { color: palette.ink }]}>
                    {month.label}
                  </Text>
                  <Text style={[styles.monthCount, { color: palette.muted }]}>
                    {month.count} {month.count === 1 ? 'jogo' : 'jogos'}
                  </Text>
                </View>
                <View style={styles.week}>
                  {WEEK_LETTERS.map((letter, i) => (
                    <Text
                      // biome-ignore lint/suspicious/noArrayIndexKey: S, T, Q, Q, S, S, D se repetem
                      key={i}
                      style={[styles.weekLetter, { color: palette.muted }]}
                    >
                      {letter}
                    </Text>
                  ))}
                </View>
                {weeks.map((week, w) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a semana é a posição no mês
                  <View key={w} style={styles.week}>
                    {week.map((day, d) => {
                      if (!day)
                        return (
                          <View
                            // biome-ignore lint/suspicious/noArrayIndexKey: vazio antes do dia 1
                            key={d}
                            style={[styles.cell, { height: cell }]}
                          />
                        )
                      const on = day.key === selected
                      return (
                        <View
                          key={day.key}
                          style={[styles.cell, { height: cell }]}
                        >
                          {on ? (
                            <HardShadow color={ACID} offset={2} radius={4} />
                          ) : null}
                          <View
                            style={[
                              styles.cellFill,
                              {
                                backgroundColor: on
                                  ? palette.ink
                                  : day.on
                                    ? ACID
                                    : off
                              }
                            ]}
                          >
                            <Text
                              style={[
                                styles.cellText,
                                {
                                  color: on
                                    ? palette.dark
                                      ? INK
                                      : ACID
                                    : day.on
                                      ? INK
                                      : palette.muted
                                }
                              ]}
                            >
                              {day.day}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                ))}
              </View>
            )
          })}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: ACID }]} />
            <Text style={[text(12), { color: palette.muted }]}>
              jogo com código validado
            </Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: palette.ink }]} />
            <Text style={[text(12), { color: palette.muted }]}>
              selecionado
            </Text>
          </View>
        </View>
      </View>
    </Card>
  )
}

/** Uma visita em card com foto (tablet em pé): a data na foto, o bar e o jogo. */
export function VisitCard({
  visit,
  saved,
  onOpen,
  onToggle
}: {
  visit: VisitRow
  saved: boolean
  onOpen?: () => void
  onToggle: () => void
}) {
  const palette = usePalette()
  const press = usePressScale(0.98)
  const date = dayMonth(visit.startsAt)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${visit.barName}, ${gameTitle(visit)}, ${date.day} ${date.month}`}
      disabled={!onOpen}
      onPress={onOpen}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.visitSlot}
    >
      <Animated.View style={press.style}>
        <Card soft>
          <View style={styles.visit}>
            <View>
              <Photo
                uri={visit.photoUrl}
                name={visit.barName}
                big
                style={styles.visitPhoto}
              />
              <View style={styles.visitDate}>
                <Text style={styles.visitDateText}>
                  {date.day} {date.month}
                </Text>
              </View>
            </View>
            <View style={styles.visitLine}>
              <View style={styles.grow}>
                <Text
                  style={[text(15, 'Bold', 1.3), { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {visit.barName}
                </Text>
                <Text
                  style={[text(12.5), { color: palette.muted }]}
                  numberOfLines={1}
                >
                  {gameTitle(visit)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? 'Tirar dos salvos' : 'Salvar bar'}
                accessibilityState={{ selected: saved }}
                hitSlop={12}
                onPress={onToggle}
              >
                <SavedHeart on={saved} />
              </Pressable>
            </View>
          </View>
        </Card>
      </Animated.View>
    </Pressable>
  )
}

const directions = (lat: number, lng: number) =>
  Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

/** "VOCÊ FOI 2 VEZES". */
const timesLabel = (n: number) =>
  n ? `VOCÊ FOI ${n} ${n === 1 ? 'VEZ' : 'VEZES'}` : 'VOCÊ NUNCA FOI'

/** O dia e a hora do próximo jogo, como no balão do mapa: "HOJE 21:30". */
const nextWhen = (startsAt: string, now: number) =>
  `${dayLabel(startsAt, now).split(',')[0]?.replace('.', '').toLocaleUpperCase('pt-BR')} ${formatTime(startsAt)}`

/**
 * A lembrança do bar tocado em "Já fui" (dobrável aberto e tablet deitado): a
 * foto com as vezes que você foi, os jogos que viu lá, o próximo jogo e como
 * chegar.
 */
export function BarMemory({
  bar: place,
  here,
  km,
  saved,
  onToggle,
  photoHeight
}: {
  /** O bar tocado. */
  bar: MemoryBar
  /** As visitas a esse bar, da mais recente (nenhuma num salvo novo). */
  here: VisitRow[]
  km: number | null
  saved: boolean
  onToggle: () => void
  photoHeight: number
}) {
  const palette = usePalette()
  const router = useRouter()
  const now = Date.now()
  // O próximo jogo vem da página do bar (a mesma leitura, em cache).
  const bar = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: place.barId }),
    enabled: place.active
  })
  const next = bar.data?.events?.[0]
  const lat = Number(place.latitude)
  const lng = Number(place.longitude)
  const located =
    place.latitude !== null &&
    place.longitude !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  const glow = glowOf(palette.dark)
  return (
    // Trocar de bar troca a lembrança em fade curto.
    <Animated.View key={place.barId} entering={MEMORY_IN} style={styles.memory}>
      <View style={{ height: photoHeight }}>
        <HardShadow color={glow} offset={5} radius={8} />
        <View style={styles.hero}>
          <Photo
            uri={place.photoUrl}
            name={place.name}
            big
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(18,18,15,0)', 'rgba(18,18,15,.85)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroText}>
            <Text style={styles.heroTimes}>{timesLabel(here.length)}</Text>
            <Text style={styles.heroName} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={[text(13), { color: '#d6d3cb' }]} numberOfLines={1}>
              {[place.neighborhood, km === null ? null : formatKm(km)]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Tirar dos salvos' : 'Salvar bar'}
            accessibilityState={{ selected: saved }}
            onPress={onToggle}
            style={styles.heroHeart}
          >
            <GlassRound tone="dark">
              <SavedHeart on={saved} />
            </GlassRound>
          </Pressable>
        </View>
      </View>

      {here.length ? (
        <Card soft>
          <View style={styles.history}>
            {here.map((v, i) => {
              const date = dayMonth(v.startsAt)
              return (
                <View
                  key={v.eventId}
                  style={[
                    styles.historyRow,
                    i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
                  ]}
                >
                  <Text style={[styles.historyDate, { color: palette.ink }]}>
                    {date.day} {date.month}
                  </Text>
                  <Text
                    style={[
                      text(14, 'Regular', 1.3),
                      styles.grow,
                      { color: palette.ink }
                    ]}
                    numberOfLines={2}
                  >
                    {gameTitle(v)}
                  </Text>
                  <View style={styles.badge}>
                    <Icon name="check" size={11} color={INK} />
                    <Text style={styles.badgeText}>Validado</Text>
                  </View>
                </View>
              )
            })}
          </View>
        </Card>
      ) : null}

      {next ? (
        <View>
          <HardShadow color={ACID} offset={4} radius={7} />
          <View
            style={[
              styles.next,
              { backgroundColor: palette.dark ? PAPER : INK }
            ]}
          >
            <View style={styles.grow}>
              <Text
                style={[styles.nextWhen, { color: palette.dark ? LIVE : ACID }]}
              >
                PRÓXIMO JOGO ·{' '}
                {isLive(next, now) ? 'AO VIVO' : nextWhen(next.startsAt, now)}
              </Text>
              <Text
                style={[
                  text(15, 'Bold', 1.3),
                  { color: palette.dark ? INK : PAPER, marginTop: 4 }
                ]}
                numberOfLines={2}
              >
                {gameTitle(next)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/vou/[barId]',
                  params: { barId: place.barId, eventId: next.id }
                })
              }
              style={styles.going}
            >
              <Text style={[text(13.5, 'Bold', 1.2), { color: INK }]}>
                {next.attendance?.attending ? 'Você vai' : 'Vou assistir'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {located ? (
          <GlassPill
            label="Como chegar"
            icon
            onPress={() => Linking.openURL(directions(lat, lng))}
          />
        ) : null}
        {place.active ? (
          <GlassPill
            label="Ver bar"
            bold
            onPress={() =>
              router.push({
                pathname: '/bar/[id]',
                params: { id: place.barId }
              })
            }
          />
        ) : null}
      </View>
    </Animated.View>
  )
}

/**
 * A tela de fora do Z Flip 8: o último bar onde você foi, o jogo de hoje lá
 * (se houver) e "Voltar lá", que abre a página do bar.
 */
export function LastBar({
  visit,
  onOpen
}: {
  visit: VisitRow
  onOpen: (barId: string) => void
}) {
  const now = Date.now()
  const bar = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: visit.barId }),
    enabled: visit.barActive
  })
  const next = bar.data?.events?.[0]
  const today = next && dayLabel(next.startsAt, now) === 'Hoje'
  const date = dayMonth(visit.startsAt)
  return (
    <View style={styles.last}>
      <Text style={styles.heroTimes}>ÚLTIMO BAR</Text>
      <View style={styles.lastBar}>
        <Photo
          uri={visit.photoUrl}
          name={visit.barName}
          big
          style={styles.lastPhoto}
        />
        <View style={styles.grow}>
          <Text style={styles.lastName} numberOfLines={1}>
            {visit.barName}
          </Text>
          <Text style={[text(12.5), { color: MUTED_ON_INK }]} numberOfLines={1}>
            {date.day} {date.month.toLocaleLowerCase('pt-BR')} ·{' '}
            {gameTitle(visit)}
          </Text>
        </View>
      </View>
      {today && next ? (
        <Text style={[text(13), { color: '#d6d3cb' }]}>
          {isLive(next, now)
            ? 'Tem jogo lá agora.'
            : `Hoje tem jogo lá às ${formatTime(next.startsAt)}.`}
        </Text>
      ) : null}
      {visit.barActive ? (
        <View style={styles.lastGo}>
          <PillButton
            label="Voltar lá"
            height={50}
            onPress={() => onOpen(visit.barId)}
          />
        </View>
      ) : null}
    </View>
  )
}

/** O cinza do texto sobre tinta (o `MUTEDINK` do design). */
const MUTED_ON_INK = '#aaa9a4'

const MEMORY_IN = FadeIn.duration(180)

function GlassPill({
  label,
  icon,
  bold,
  onPress
}: {
  label: string
  icon?: boolean
  bold?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePressScale(0.97)
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={styles.grow}
    >
      <Animated.View style={press.style}>
        {/* Papel com sombra macia, não vidro: sobre o painel liso o vidro
            some. */}
        <View
          style={[
            styles.pill,
            styles.pillBase,
            { backgroundColor: palette.dark ? '#262621' : palette.card }
          ]}
        >
          {icon ? (
            <Icon
              name="pin"
              size={15}
              color={palette.ink}
              accent={palette.dark ? ACID : LIVE}
            />
          ) : null}
          <Text
            style={[
              text(13.5, bold ? 'Bold' : 'SemiBold', 1.2),
              { color: palette.ink }
            ]}
          >
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

/**
 * O mapa de onde você foi (tablet deitado): uma gota por bar com visita, a do
 * bar tocado grande com o balão ("Casa 92", "04 OUT · 2×"). Tocar numa gota
 * escolhe a visita mais recente daquele bar.
 */
export function VisitsMap({
  visits,
  selected,
  onSelect,
  padding,
  top,
  center
}: {
  visits: VisitRow[]
  /** O bar tocado (pode ser um salvo onde você nunca foi). */
  selected: MemoryBar | null
  onSelect: (barId: string) => void
  /** O que a lembrança e a navegação cobrem, para as gotas ficarem à vista. */
  padding: { top: number; right: number; bottom: number; left: number }
  /** Onde a pílula fica. */
  top: number
  /** Sem visita com endereço, o mapa abre aqui. */
  center: { latitude: number; longitude: number }
}) {
  const palette = usePalette()
  const map = useRef<MapView>(null)
  const located = (b: Pick<MemoryBar, 'latitude' | 'longitude'>) =>
    b.latitude !== null &&
    b.longitude !== null &&
    Number.isFinite(Number(b.latitude)) &&
    Number.isFinite(Number(b.longitude))
  // Um por bar (a lista chega da visita mais recente).
  const visited = [
    ...new Map(visits.map((v) => [v.barId, { ...v, name: v.barName }])).values()
  ].filter(located)
  // O salvo tocado onde você nunca foi também entra no mapa.
  const pins =
    selected &&
    located(selected) &&
    !visited.some((b) => b.barId === selected.barId)
      ? [...visited, selected]
      : visited
  const coords = visited.map((b) => ({
    latitude: Number(b.latitude),
    longitude: Number(b.longitude)
  }))
  // Enquadra as gotas quando o mapa fica pronto e quando as visitas chegam
  // ou mudam (o mapa pode nascer antes da leitura).
  const ready = useRef(false)
  const frame = () => {
    if (!ready.current || !coords.length) return
    map.current?.fitToCoordinates(coords, {
      edgePadding: padding,
      animated: false
    })
  }
  const framing = `${coords.map((c) => `${c.latitude},${c.longitude}`).join('|')}:${Object.values(padding).join(',')}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: enquadra de novo só quando o desenho muda
  useEffect(frame, [framing])
  /** "04 OUT · 2×": a visita mais recente e quantas vezes. */
  const when = (barId: string) => {
    const here = visits.filter((v) => v.barId === barId)
    if (!here[0]) return null
    const date = dayMonth(here[0].startsAt)
    return `${date.day} ${date.month} · ${here.length}×`
  }
  const first = coords[0] ?? center
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        onMapReady={() => {
          ready.current = true
          frame()
        }}
        initialRegion={{ ...first, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
        userInterfaceStyle={palette.dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        showsCompass={false}
        pitchEnabled={false}
        toolbarEnabled={false}
      >
        {pins.map((b) => {
          const on = b.barId === selected?.barId
          const callout = on ? { name: b.name, when: when(b.barId) } : undefined
          // A caixa conta a pílula do nome (a do design é de papel, não a do
          // ao vivo do Explorar): a gota fica na mesma ponta.
          const box = dropBox(callout ? { callout } : { label: b.name })
          return (
            <DrawnMarker
              // Mudou o tipo (gota, tocada), nasce outro marcador: o Apple
              // Maps não muda o `centerOffset` de um marcador vivo.
              key={`${on ? 'on' : 'off'}:${b.barId}`}
              draw={`${on}:${palette.dark}`}
              coordinate={{
                latitude: Number(b.latitude),
                longitude: Number(b.longitude)
              }}
              anchor={box.anchor}
              centerOffset={box.centerOffset}
              zIndex={on ? 3 : 1}
              onPress={() => onSelect(b.barId)}
            >
              {callout ? (
                <MapDrop
                  live={false}
                  elite={false}
                  dark={palette.dark}
                  callout={callout}
                />
              ) : (
                <View style={{ width: box.width, height: box.height }}>
                  <MapDrop live={false} elite={false} dark={palette.dark} />
                  <View
                    style={[
                      styles.pinLabel,
                      {
                        left: box.tipX + 20,
                        top: box.tipY - 34,
                        backgroundColor: palette.dark ? '#1c1c18' : PAPER,
                        borderColor: palette.dark
                          ? 'rgba(241,238,230,.12)'
                          : 'rgba(18,18,15,.08)'
                      }
                    ]}
                  >
                    <Text
                      style={[text(12, 'Bold', 1.1), { color: palette.ink }]}
                      numberOfLines={1}
                    >
                      {b.name}
                    </Text>
                  </View>
                </View>
              )}
            </DrawnMarker>
          )
        })}
      </MapView>
      <View style={[styles.mapPill, { top }]}>
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          style={[styles.pill, { height: 38, borderRadius: 19 }]}
        >
          <Icon
            name="ticket"
            size={15}
            color={palette.ink}
            accent={palette.dark ? ACID : LIVE}
          />
          <Text style={[text(13.5, 'Bold', 1.2), { color: palette.ink }]}>
            {visited.length} {visited.length === 1 ? 'bar' : 'bares'} onde você
            foi
          </Text>
        </Glass>
      </View>
    </View>
  )
}

/**
 * Marcador que acompanha a vista só ao nascer ou mudar de desenho, como no
 * Explorar: acompanhar sempre pesa, e nunca deixa a gota em branco.
 */
function DrawnMarker({
  draw,
  ...props
}: React.ComponentProps<typeof Marker> & { draw: string }) {
  const [tracking, setTracking] = useState(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: redesenha quando `draw` muda
  useEffect(() => {
    setTracking(true)
    const stop = setTimeout(() => setTracking(false), 500)
    return () => clearTimeout(stop)
  }, [draw])
  return <Marker {...props} tracksViewChanges={tracking} />
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  months: { padding: 16, gap: 12 },
  monthRow: { flexDirection: 'row', gap: 22 },
  month: { flex: 1, minWidth: 0, gap: 4 },
  monthHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4
  },
  monthName: {
    fontFamily: 'Anton',
    fontSize: 20,
    textTransform: 'uppercase',
    marginVertical: -4
  },
  monthCount: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 },
  week: { flexDirection: 'row', gap: 4 },
  weekLetter: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5
  },
  cell: { flex: 1 },
  cellFill: {
    flex: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cellText: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 11, height: 11, borderRadius: 3 },
  visitSlot: { flex: 1, minWidth: 0 },
  visit: { padding: 10, gap: 8 },
  visitPhoto: { height: 110, borderRadius: 5 },
  visitDate: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 4,
    backgroundColor: PAPER
  },
  visitDateText: {
    fontFamily: 'Anton',
    fontSize: 15,
    color: INK,
    marginVertical: -4
  },
  visitLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memory: { gap: 14 },
  hero: { flex: 1, borderRadius: 8, overflow: 'hidden' },
  heroText: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  heroTimes: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: ACID
  },
  heroName: {
    fontFamily: 'Anton',
    fontSize: 34,
    textTransform: 'uppercase',
    color: PAPER,
    marginTop: 2,
    marginBottom: -6
  },
  heroHeart: { position: 'absolute', right: 12, top: 12 },
  history: { paddingVertical: 4, paddingHorizontal: 14 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  historyDate: {
    width: 56,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: ACID
  },
  badgeText: { ...text(10.5, 'Bold', 1.2), color: INK },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 7
  },
  nextWhen: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.63
  },
  going: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 4,
    backgroundColor: ACID
  },
  actions: { flexDirection: 'row', gap: 8 },
  pill: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  last: { flex: 1, gap: 12 },
  lastBar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastPhoto: { width: 60, height: 60, borderRadius: 4 },
  lastName: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -4
  },
  lastGo: { position: 'absolute', right: 0, bottom: 26, width: 150 },
  pillBase: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 }
  },
  pinLabel: {
    position: 'absolute',
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 0.22,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 3 }
  },
  mapPill: { position: 'absolute', left: 16 }
})
