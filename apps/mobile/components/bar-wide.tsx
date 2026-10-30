import { AMENITIES } from '@findsports_oficial/api/lib/amenities'
import { gameTitle, matchSides } from '@findsports_oficial/db/game-title'
import { useRouter } from 'expo-router'
import type React from 'react'
import type { ReactNode } from 'react'
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native'
import MapView from 'react-native-maps'
import Animated from 'react-native-reanimated'
import { Card } from '@/components/card'
import { dayLabel, MapDrop } from '@/components/explore'
import { openPhoto, PhotoTile } from '@/components/gallery'
import { Glass } from '@/components/glass'
import { usePressScale } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, Text, text } from '@/components/ui'
import { formatTime, isLive, teamMark } from '@/lib/explore'
import type { GalleryPhoto } from '@/lib/gallery'
import { MAP_STYLE } from '@/lib/map-style'

/*
 * As peças da página do bar fora do celular (Adaptativo 02, WEB-488), como
 * o design desenha: o nome com as etiquetas, o cartão escuro do jogo, os
 * próximos jogos com o dia em caixinha, "Onde fica" com o mapa, "No bar" em
 * chips com ícone, "Fotos" em grade e o "1/14" sobre a foto.
 */

const LIVE = '#e8320c'
const LIVET = '#c92b0c'
const LIVEINK = '#f3421d'
const STONE = '#e7e3db'
const MUTED = '#55554f'
const MUTEDINK = '#aaa9a4'

type Game = {
  id: string
  startsAt: string
  championship: string | null
  going?: { count: number | null; initials: string[] } | null
} & Parameters<typeof gameTitle>[0] &
  Parameters<typeof isLive>[0] &
  Parameters<typeof matchSides>[0]

/** Título de seção do design: 15, negrito. */
export function SectionTitle({
  title,
  aside,
  onAside
}: {
  title: string
  aside?: string
  onAside?: () => void
}) {
  const palette = usePalette()
  return (
    <View style={styles.section}>
      <Text style={[text(15, 'Bold', 1.3), { color: palette.ink }]}>
        {title}
      </Text>
      {aside ? (
        <Pressable
          accessibilityRole={onAside ? 'button' : undefined}
          disabled={!onAside}
          hitSlop={10}
          onPress={onAside}
        >
          <Text
            style={[
              text(13, 'Bold', 1.3),
              { color: palette.dark ? ACID : LIVET }
            ]}
          >
            {aside}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/** As etiquetas, o nome e a linha do bairro (titleB). */
export function BarTitle({
  name,
  elite,
  rating,
  info,
  size
}: {
  name: string
  elite: boolean
  rating: { percentage: number; total: number } | null
  info: string
  size: number
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 8 }}>
      {elite || rating ? (
        <View style={styles.badges}>
          {elite ? (
            <View style={[styles.badge, { backgroundColor: ACID }]}>
              <Icon name="star" size={10} color={INK} />
              <Text style={[text(10.5, 'Bold', 1.2), { color: INK }]}>
                Elite
              </Text>
            </View>
          ) : null}
          {rating ? (
            <>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: palette.dark ? '#2c2c27' : STONE }
                ]}
              >
                <Text style={[text(10.5, 'Bold', 1.2), { color: palette.ink }]}>
                  {rating.percentage}% voltariam
                </Text>
              </View>
              <Text
                style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
              >
                de {rating.total}{' '}
                {rating.total === 1 ? 'torcedor' : 'torcedores'}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
      <Text
        style={[
          styles.name,
          { color: palette.ink, fontSize: size, marginVertical: -size * 0.24 }
        ]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {name.toUpperCase()}
      </Text>
      <Text
        style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
        numberOfLines={2}
      >
        {info || ' '}
      </Text>
    </View>
  )
}

/** "Ao vivo" com o ponto vermelho e o halo (liveTag). */
function LiveTag({ label, onInk }: { label: string; onInk: boolean }) {
  return (
    <View style={styles.liveTag}>
      <View style={styles.liveHalo}>
        <View style={styles.liveDot} />
      </View>
      <Text style={[text(12, 'Bold', 1.2), { color: onInk ? LIVEINK : LIVET }]}>
        {label}
      </Text>
    </View>
  )
}

/** O escudo redondo com a sigla (crest). */
function Crest({ name, onInk }: { name: string; onInk: boolean }) {
  return (
    <View
      style={[
        styles.crest,
        onInk
          ? { backgroundColor: '#2a2a25', borderColor: 'rgba(241,238,230,.12)' }
          : { backgroundColor: STONE, borderColor: 'rgba(18,18,15,.08)' }
      ]}
    >
      <Text style={[styles.crestText, { color: onInk ? PAPER : INK }]}>
        {teamMark(name)}
      </Text>
    </View>
  )
}

/**
 * O jogo do bar (gameB): cartão de tinta no claro e de papel no escuro, com
 * a sombra vermelha. "Ao vivo" (o tempo do jogo não existe no produto), o
 * campeonato e a hora, os times com o escudo, quem vai e os outros jogos.
 */
export function GameCard({
  game,
  more,
  now,
  narrow
}: {
  game: Game
  /** Quantos outros jogos o bar tem marcados ("+2 jogos"). */
  more: number
  now: number
  /** Coluna estreita: sem os escudos, nomes em 20. */
  narrow?: boolean
}) {
  const palette = usePalette()
  const onInk = !palette.dark
  const bg = onInk ? INK : PAPER
  const fg = onInk ? PAPER : INK
  const mu = onInk ? MUTEDINK : MUTED
  const live = isLive(game, now)
  const [home, away] = matchSides(game) ?? []
  const size = narrow ? 20 : 22
  const going = game.going
  const shown = going?.initials.slice(0, 2) ?? []
  const rest = going?.count ? going.count - shown.length : 0
  const team = (name: string, right?: boolean) => (
    <View style={[styles.side, right && { justifyContent: 'flex-end' }]}>
      {narrow || right ? null : <Crest name={name} onInk={onInk} />}
      <Text
        style={[styles.team, { fontSize: size, color: fg }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {name.toUpperCase()}
      </Text>
      {narrow || !right ? null : <Crest name={name} onInk={onInk} />}
    </View>
  )
  return (
    <View>
      <View
        style={[
          styles.hardShadow,
          {
            backgroundColor: palette.dark
              ? 'rgba(232,50,12,.30)'
              : 'rgba(232,50,12,.28)'
          }
        ]}
      />
      <View style={[styles.game, { backgroundColor: bg }]}>
        <View style={styles.row}>
          {live ? (
            <LiveTag label="Ao vivo" onInk={onInk} />
          ) : (
            <Text style={[text(12, 'Bold', 1.2), { color: fg }]}>
              {dayLabel(game.startsAt, now)}
            </Text>
          )}
          <Text style={[styles.mono, { color: mu }]} numberOfLines={1}>
            {[
              game.championship?.toLocaleUpperCase('pt-BR'),
              formatTime(game.startsAt)
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {home && away ? (
          <View style={styles.teams}>
            {team(home)}
            <Text style={[text(18, 'Bold', 1), { color: ACID }]}>×</Text>
            {team(away, true)}
          </View>
        ) : (
          <Text
            style={[styles.team, styles.teams, { fontSize: size, color: fg }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {gameTitle(game).toUpperCase()}
          </Text>
        )}
        {going?.count || more > 0 ? (
          <View
            style={[
              styles.gameFoot,
              {
                borderTopColor: onInk
                  ? 'rgba(241,238,230,.14)'
                  : 'rgba(18,18,15,.12)'
              }
            ]}
          >
            {going?.count ? (
              <View style={styles.going}>
                <View style={{ flexDirection: 'row' }}>
                  {[
                    ...shown.map((s, i) => ({
                      label: s,
                      bg: i ? LIVE : ACID,
                      fg: i ? PAPER : INK
                    })),
                    ...(rest > 0 ? [{ label: `+${rest}`, bg: fg, fg: bg }] : [])
                  ].map((a, i) => (
                    <View
                      key={a.label}
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: a.bg,
                          borderColor: bg,
                          marginLeft: i ? -8 : 0
                        }
                      ]}
                    >
                      <Text style={[text(11, 'Bold', 1), { color: a.fg }]}>
                        {a.label}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[text(13, 'Regular', 1.3), { color: fg }]}>
                  {going.count} {going.count === 1 ? 'vai' : 'vão'} assistir
                  aqui
                </Text>
              </View>
            ) : (
              <View />
            )}
            {more > 0 ? (
              <Text style={[text(13, 'Regular', 1.3), { color: mu }]}>
                +{more} {more === 1 ? 'jogo' : 'jogos'}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

/** Os próximos jogos (nextB): o dia numa caixinha, o jogo e a hora. */
export function NextGames<G extends Game>({
  games,
  tag
}: {
  games: G[]
  /** A etiqueta do produto ("Vou", "Telão", WEB-399). */
  tag: (game: G) => string | null
}) {
  const palette = usePalette()
  return (
    <Card soft>
      <View style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
        {games.map((game, i) => {
          const date = new Date(game.startsAt)
          const part = (o: Intl.DateTimeFormatOptions) =>
            date.toLocaleDateString('pt-BR', {
              ...o,
              timeZone: 'America/Sao_Paulo'
            })
          const label = tag(game)
          return (
            <View
              key={game.id}
              style={[
                styles.next,
                i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
              ]}
            >
              <View
                style={[
                  styles.day,
                  { backgroundColor: palette.dark ? '#262621' : STONE }
                ]}
              >
                <Text style={[styles.dayTop, { color: palette.muted }]}>
                  {part({ weekday: 'short' })
                    .replace('.', '')
                    .toLocaleUpperCase('pt-BR')}
                </Text>
                <Text style={[styles.dayNum, { color: palette.ink }]}>
                  {part({ day: '2-digit' })}
                </Text>
              </View>
              <Text
                style={[
                  text(14.5, 'Bold', 1.3),
                  { color: palette.ink, flex: 1 }
                ]}
                numberOfLines={1}
              >
                {gameTitle(game)}
              </Text>
              {label ? (
                <View style={[styles.tag, { backgroundColor: palette.mark }]}>
                  <Text
                    style={[text(10.5, 'Bold', 1.2), { color: palette.ink }]}
                  >
                    {label}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.time, { color: palette.ink }]}>
                {formatTime(game.startsAt)}
              </Text>
            </View>
          )
        })}
      </View>
    </Card>
  )
}

const directions = (lat: number, lng: number) =>
  Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

/**
 * "Onde fica" (whereB): o mapa com a gota, o endereço e "Como chegar".
 * Ligar e WhatsApp entram com o WEB-484.
 */
export function WhereCard({
  lat,
  lng,
  address,
  live,
  elite,
  onRoute
}: {
  lat: number
  lng: number
  address: string
  live: boolean
  elite: boolean
  onRoute: () => void
}) {
  const palette = usePalette()
  const mapPress = usePressScale(0.985)
  const goPress = usePressScale()
  const go = () => {
    onRoute()
    Linking.openURL(directions(lat, lng))
  }
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title="Onde fica" />
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Como chegar"
        onPress={go}
        onPressIn={mapPress.onPressIn}
        onPressOut={mapPress.onPressOut}
      >
        <Animated.View style={mapPress.style}>
          <Card>
            <View style={styles.map} pointerEvents="none">
              <MapView
                style={StyleSheet.absoluteFill}
                initialRegion={{
                  latitude: lat,
                  longitude: lng,
                  latitudeDelta: 0.006,
                  longitudeDelta: 0.012
                }}
                // A ponta da gota em 96 de 150, como no design.
                mapPadding={{ top: 42, right: 0, bottom: 0, left: 0 }}
                mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
                customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
                userInterfaceStyle={palette.dark ? 'dark' : 'light'}
                showsPointsOfInterests={false}
                scrollEnabled={false}
                zoomEnabled={false}
                rotateEnabled={false}
                pitchEnabled={false}
                toolbarEnabled={false}
              />
              <View style={styles.pin}>
                <MapDrop live={live} elite={elite} dark={palette.dark} />
              </View>
            </View>
          </Card>
        </Animated.View>
      </Pressable>
      <Text style={[text(13.5, 'Regular', 1.4), { color: palette.muted }]}>
        {address}
      </Text>
      <View style={styles.wrap}>
        <Pressable
          accessibilityRole="link"
          onPress={go}
          onPressIn={goPress.onPressIn}
          onPressOut={goPress.onPressOut}
        >
          <Animated.View style={[styles.route, goPress.style]}>
            <Icon name="pin" size={17} color={INK} accent={INK} />
            <Text style={[text(13.5, 'Bold', 1.2), { color: INK }]}>
              Como chegar
            </Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  )
}

/** O ícone de cada característica nos chips de "No bar". */
const AMENITY_ICON: Record<number, React.ComponentProps<typeof Icon>['name']> =
  {
    1: 'tv',
    2: 'sound',
    3: 'premiere',
    4: 'outdoor',
    5: 'outdoor',
    6: 'person',
    7: 'people',
    15: 'link',
    9: 'pin',
    22: 'pin'
  }
/** Os rótulos curtos do design. */
const SHORT: Record<number, string> = {
  1: 'Telão',
  2: 'Som do jogo',
  3: 'Premiere'
}

/** Os chips de "No bar": o rótulo do design e "Pix e cartão" juntos. */
export function amenityChips(ids: readonly number[], screens: number | null) {
  const has = (id: number) => ids.includes(id)
  return AMENITIES.filter((a) => has(a.id)).flatMap((a) => {
    if (a.id === 17 && has(16)) return []
    const icon =
      AMENITY_ICON[a.id] ??
      (a.group === 'food' ? 'bar' : a.group === 'payment' ? 'ticket' : 'check')
    const label =
      a.id === 16 && has(17) ? 'Pix e cartão' : (SHORT[a.id] ?? a.label)
    const chip = { key: String(a.id), icon, label }
    return a.id === 1 && screens && screens > 1
      ? [chip, { key: 'telas', icon, label: `${screens} telas` }]
      : [chip]
  })
}

/** "No bar" (amenB): as características em chips com ícone. */
export function Amenities({
  chips
}: {
  chips: ReturnType<typeof amenityChips>
}) {
  const palette = usePalette()
  if (!chips.length) return null
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle title="No bar" />
      <View style={styles.wrap}>
        {chips.map((chip) => (
          <View key={chip.key}>
            <View
              style={[styles.chipShadow, { backgroundColor: palette.shadow }]}
            />
            <View
              style={[
                styles.chip,
                { backgroundColor: palette.card, borderColor: palette.ring }
              ]}
            >
              <Icon
                name={chip.icon}
                size={16}
                color={palette.ink}
                accent={palette.dark ? ACID : LIVE}
              />
              <Text
                style={[
                  text(13, 'SemiBold', 1.2),
                  styles.chipText,
                  { color: palette.ink }
                ]}
                numberOfLines={1}
              >
                {chip.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const BLANKS = ['a', 'b', 'c', 'd', 'e', 'f']

/** "Fotos" (galB): a grade, a última com "+N", e "Ver as N". */
export function PhotoGrid({
  barId,
  photos,
  cols
}: {
  barId: string
  photos: readonly GalleryPhoto[]
  cols: number
}) {
  const router = useRouter()
  if (!photos.length) return null
  const shown = photos.slice(0, cols)
  const rest = photos.length - shown.length
  const all = () =>
    router.push({ pathname: '/fotos/[barId]', params: { barId, cat: 'all' } })
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle
        title="Fotos"
        aside={photos.length > 1 ? `Ver as ${photos.length}` : undefined}
        onAside={all}
      />
      <View style={styles.grid}>
        {shown.map((photo, i) => {
          const last = i === cols - 1 && rest > 0
          return (
            <PhotoTile
              key={photo.url}
              uri={photo.url}
              label={last ? `Mais ${rest} fotos` : `Foto ${i + 1}`}
              onPress={() => (last ? all() : openPhoto(router, barId, i))}
              style={styles.cell}
            >
              {last ? (
                <View style={styles.more}>
                  <Text style={styles.moreText}>+{rest}</Text>
                </View>
              ) : null}
            </PhotoTile>
          )
        })}
        {/* Menos fotos que colunas: as que existem ficam do tamanho certo. */}
        {BLANKS.slice(0, cols - shown.length).map((key) => (
          <View key={key} style={styles.cell} />
        ))}
      </View>
    </View>
  )
}

/** "1/14" sobre a foto: a primeira das fotos do bar. */
export function PhotoCount({
  total,
  left,
  onPress
}: {
  total: number
  left?: boolean
  onPress: () => void
}) {
  if (total < 1) return null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver as ${total} fotos`}
      hitSlop={8}
      onPress={onPress}
      style={[styles.count, left ? { left: 14 } : { right: 14 }]}
    >
      <Glass tone="dark" style={styles.countGlass}>
        <Text style={styles.countText}>1/{total}</Text>
      </Glass>
    </Pressable>
  )
}

/** Uma coluna do design (stackC): as peças com o vão do design. */
export function Stack({ gap, children }: { gap: number; children: ReactNode }) {
  return <View style={{ gap }}>{children}</View>
}

const styles = StyleSheet.create({
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3
  },
  name: { fontFamily: 'Anton', letterSpacing: -0.3 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveHalo: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    margin: -4,
    marginRight: -4,
    backgroundColor: 'rgba(232,50,12,.22)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: LIVE },
  crest: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  crestText: { fontFamily: 'Anton', fontSize: 15, letterSpacing: 0.3 },
  hardShadow: {
    ...StyleSheet.absoluteFill,
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 7
  },
  game: { borderRadius: 7, padding: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, flexShrink: 1 },
  teams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14
  },
  side: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  team: { fontFamily: 'Anton', flexShrink: 1, marginVertical: -5 },
  gameFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1
  },
  going: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10
  },
  day: { width: 44, paddingVertical: 6, borderRadius: 4, alignItems: 'center' },
  dayTop: { fontFamily: 'GeistMono-SemiBold', fontSize: 9.5 },
  dayNum: { fontFamily: 'Anton', fontSize: 18, marginTop: 3, marginBottom: -4 },
  tag: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 },
  time: { fontFamily: 'Anton', fontSize: 20, marginVertical: -5 },
  map: { height: 150, borderRadius: 6, overflow: 'hidden' },
  pin: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 96 - 36,
    alignItems: 'center'
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: ACID
  },
  chipShadow: {
    ...StyleSheet.absoluteFill,
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 5
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1
  },
  // O Android mede o texto em negrito um pouco curto e o cortava no chip.
  chipText: { flexShrink: 0 },
  grid: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, aspectRatio: 1 },
  more: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,15,.55)'
  },
  moreText: { fontFamily: 'Anton', fontSize: 20, color: PAPER },
  count: { position: 'absolute', bottom: 12 },
  countGlass: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    overflow: 'hidden'
  },
  countText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5, color: PAPER }
})
