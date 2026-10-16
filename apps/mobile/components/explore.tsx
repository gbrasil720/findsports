import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native'
import { Glass } from '@/components/glass'
import { haptic } from '@/components/motion'
import { ACCENT, ACID, Icon, INK, LIVE, PAPER, text } from '@/components/ui'
import { formatKm, formatTime, isLive, teamMark } from '@/lib/explore'

/*
 * Peças do Explorar e da página do bar ("07" do design): pino do mapa, chip
 * de filtro, selos (plano, ao vivo, voltariam) e os cards de bar. Claro e
 * escuro seguem o tema do sistema, como no design ("Explorar · escuro").
 */

type Outputs = inferRouterOutputs<AppRouter>
export type SearchBar = Outputs['pubs']['search']['bars'][number]
/** Um jogo, na forma comum à busca e ao perfil do bar (`pubs.getById`). */
export type Game = {
  startsAt: string
  endsAt: string | null
  championship: string
  participants: { team: { name: string } }[]
  participantFreeText: string | null
}

export const PALETTE = {
  light: {
    bg: PAPER,
    card: '#faf8f3',
    ink: INK,
    muted: '#55554f',
    line: 'rgba(18,18,15,.16)',
    mark: '#e7e3db',
    grabber: 'rgba(18,18,15,.18)',
    live: ACCENT
  },
  dark: {
    bg: INK,
    card: '#1c1c18',
    ink: PAPER,
    muted: '#a9a59b',
    line: 'rgba(241,238,230,.16)',
    mark: '#2a2a25',
    grabber: 'rgba(241,238,230,.22)',
    live: '#ff5a36'
  }
}
export type Palette = (typeof PALETTE)['light']

export function usePalette() {
  return PALETTE[useColorScheme() === 'dark' ? 'dark' : 'light']
}

// --- Mapa -------------------------------------------------------------------

/**
 * O pino do bar: ao vivo em vermelho, com o nome; jogo mais tarde em acid,
 * com a hora; sem jogo hoje, em tinta, com o nome.
 */
export function Pin({ bar, now }: { bar: SearchBar; now: number }) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  const later = game && !live && isToday(game.startsAt, now)
  const bg = live ? LIVE : later ? ACID : INK
  const fg = later ? INK : PAPER
  return (
    <View style={styles.pin}>
      <View
        style={[
          styles.pinLabel,
          live && styles.pinLive,
          { backgroundColor: bg }
        ]}
      >
        {live ? <View style={styles.pinDot} /> : null}
        <Text
          style={[
            text(live ? 13 : 12, 'Bold', 1.2),
            { color: fg, maxWidth: 150 }
          ]}
          numberOfLines={1}
        >
          {later && game ? formatTime(game.startsAt) : bar.name}
        </Text>
      </View>
      <View style={[styles.pinTip, { backgroundColor: bg }]} />
    </View>
  )
}

/** Você no mapa: o ponto acid com dois halos. */
export function MeDot() {
  return (
    <View style={styles.meHalo2}>
      <View style={styles.meHalo1}>
        <View style={styles.me} />
      </View>
    </View>
  )
}

// --- Filtros e selos --------------------------------------------------------

/** Chip de vidro sobre o mapa; ligado, fica acid. */
export function Chip({
  label,
  icon,
  live,
  on,
  dark,
  onPress
}: {
  label: string
  icon?: 'tv' | 'outdoor'
  live?: boolean
  on: boolean
  dark: boolean
  onPress: () => void
}) {
  const fg = on || !dark ? INK : PAPER
  const body = (
    <>
      {live ? <View style={styles.liveDot} /> : null}
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={[text(13.5, on ? 'Bold' : 'SemiBold', 1.2), { color: fg }]}>
        {label}
      </Text>
    </>
  )
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.97 }] }}
    >
      {on ? (
        <View style={[styles.chip, styles.chipOn]}>{body}</View>
      ) : (
        <Glass tone={dark ? 'dark' : 'light'} interactive style={styles.chip}>
          {body}
        </Glass>
      )}
    </Pressable>
  )
}

/** Selo pequeno: "87% voltariam", "Pro". */
export function Tag({
  children,
  outline,
  color
}: {
  children: ReactNode
  outline?: boolean
  color?: string
}) {
  return (
    <View
      style={[
        styles.tag,
        outline
          ? { borderWidth: 1, borderColor: color ?? INK }
          : { backgroundColor: ACID }
      ]}
    >
      <Text
        style={[
          text(10.5, 'Bold', 1.2),
          { color: outline ? (color ?? INK) : INK }
        ]}
      >
        {children}
      </Text>
    </View>
  )
}

/** Selo de vidro sobre foto: "Ao vivo", "Elite", "0,8 km". */
export function PhotoPill({
  kind,
  label
}: {
  kind: 'live' | 'elite' | 'pro' | 'glass'
  label: string
}) {
  const bg =
    kind === 'live'
      ? 'rgba(232,50,12,.86)'
      : kind === 'elite'
        ? 'rgba(201,241,53,.9)'
        : 'rgba(36,36,32,.55)'
  const fg = kind === 'elite' ? INK : PAPER
  return (
    <View style={[styles.photoPill, { backgroundColor: bg }]}>
      {kind === 'live' ? (
        <View style={[styles.liveDot, { backgroundColor: PAPER }]} />
      ) : null}
      {kind === 'elite' ? <Icon name="medal" size={15} color={INK} /> : null}
      {kind === 'glass' ? <Icon name="pin" size={14} color={PAPER} /> : null}
      <Text style={[text(13, 'SemiBold', 1.2), { color: fg }]}>{label}</Text>
    </View>
  )
}

// --- Cards ------------------------------------------------------------------

function isToday(date: string | Date, now: number) {
  const day = (value: number | string | Date) =>
    new Date(value).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    })
  return day(date) === day(now)
}

/** "Hoje", "Amanhã" ou "sáb., 18/10". */
export function dayLabel(date: string | Date, now: number) {
  if (isToday(date, now)) return 'Hoje'
  if (isToday(date, now + 86_400_000)) return 'Amanhã'
  return new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })
}

export function matchLine(game: Game) {
  const names = game.participants.map((p) => p.team.name)
  if (names.length === 2) return `${names[0]} × ${names[1]}`
  return (
    game.participantFreeText ??
    (names.length ? names.join(', ') : game.championship)
  )
}

function Photo({
  uri,
  name,
  style
}: {
  uri: string | null
  name: string
  style: object
}) {
  if (uri) return <Image source={{ uri }} style={style} resizeMode="cover" />
  return (
    <View style={[style, styles.noPhoto]}>
      <Text style={styles.noPhotoText}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  )
}

/** Time contra time, com o estado no meio ("AO VIVO" ou a hora). */
export function MatchRow({
  game,
  now,
  palette
}: {
  game: Game
  now: number
  palette: Palette
}) {
  const live = isLive(game, now)
  const [home, away] = game.participants.map((p) => p.team.name)
  const center = (
    // Campeonato de nome longo corta em vez de espremer os times.
    <View style={{ alignItems: 'center', maxWidth: 112 }}>
      <Text
        style={[
          styles.matchState,
          { color: live ? palette.live : palette.ink }
        ]}
      >
        {live ? 'AO VIVO' : formatTime(game.startsAt)}
      </Text>
      <Text style={[styles.mono, { color: palette.muted }]} numberOfLines={1}>
        {game.championship}
      </Text>
    </View>
  )
  if (!home || !away) {
    return (
      <View style={styles.matchFree}>
        <Text
          style={[text(14, 'Bold', 1.2), { color: palette.ink, flex: 1 }]}
          numberOfLines={2}
        >
          {matchLine(game)}
        </Text>
        {center}
      </View>
    )
  }
  const team = (name: string, right?: boolean) => (
    <View style={[styles.team, right && styles.teamRight]}>
      <View style={[styles.teamMark, { backgroundColor: palette.mark }]}>
        <Text style={[styles.teamMarkText, { color: palette.ink }]}>
          {teamMark(name)}
        </Text>
      </View>
      <Text
        style={[
          text(14, 'Bold', 1.15),
          {
            color: palette.ink,
            flexShrink: 1,
            textAlign: right ? 'right' : 'left'
          }
        ]}
        // Nome longo encolhe um pouco em vez de quebrar no meio da palavra.
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {name}
      </Text>
    </View>
  )
  return (
    <View style={styles.match}>
      {team(home)}
      {center}
      {team(away, true)}
    </View>
  )
}

/** O recorte de ingresso entre o jogo e o bar. */
function Perforation({ palette }: { palette: Palette }) {
  return (
    <View style={styles.perforation}>
      <View style={[styles.notch, { left: -9, backgroundColor: palette.bg }]} />
      <View style={[styles.dashed, { borderColor: palette.line }]} />
      <View
        style={[styles.notch, { right: -9, backgroundColor: palette.bg }]}
      />
    </View>
  )
}

type CardProps = {
  bar: SearchBar
  now: number
  palette: Palette
  favorite: boolean
  onFavorite: () => void
  onPress: () => void
}

/** O primeiro bar da lista: foto, jogo e bar, com sombra vermelha. */
export function BigBarCard({
  bar,
  now,
  palette,
  favorite,
  onFavorite,
  onPress
}: CardProps) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bar.name}
      onPress={onPress}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.985 }] }}
    >
      <View style={[styles.bigShadow, live && styles.bigShadowLive]} />
      <View style={[styles.big, { backgroundColor: palette.card }]}>
        <View style={styles.bigPhoto}>
          <Photo
            uri={bar.photo_url}
            name={bar.name}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(18,18,15,0)', 'rgba(18,18,15,.55)']}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.bigPills}>
            {live ? <PhotoPill kind="live" label="Ao vivo" /> : null}
            {bar.plan === 'elite' ? (
              <PhotoPill kind="elite" label="Elite" />
            ) : null}
          </View>
          <View style={styles.bigDistance}>
            <PhotoPill kind="glass" label={formatKm(bar.distance_km)} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favorite ? 'Tirar dos favoritos' : 'Favoritar'}
            accessibilityState={{ selected: favorite }}
            hitSlop={8}
            onPress={() => {
              haptic.select()
              onFavorite()
            }}
            style={[styles.heart, favorite && { backgroundColor: LIVE }]}
          >
            <Icon name="fan" size={20} color={PAPER} />
          </Pressable>
        </View>
        {game ? <MatchRow game={game} now={now} palette={palette} /> : null}
        {game ? (
          <Perforation palette={palette} />
        ) : (
          <View style={{ height: 12 }} />
        )}
        <View style={styles.bigFoot}>
          <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
            <Text
              style={[
                text(17, 'Bold', 1.2),
                { color: palette.ink, flexShrink: 1 }
              ]}
              numberOfLines={1}
            >
              {bar.name}
            </Text>
            {bar.rating ? <Tag>{bar.rating.percentage}% voltariam</Tag> : null}
            {bar.plan === 'pro' ? (
              <Tag outline color={palette.ink}>
                Pro
              </Tag>
            ) : null}
          </View>
          <Text style={[text(12.5), { color: palette.muted, marginTop: 3 }]}>
            {bar.neighborhood}
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

/** Os demais bares: foto pequena, jogo, distância e a hora à direita. */
export function BarRow({
  bar,
  now,
  palette,
  onPress
}: Omit<CardProps, 'favorite' | 'onFavorite'>) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bar.name}
      onPress={onPress}
      style={({ pressed }) => pressed && { transform: [{ scale: 0.985 }] }}
    >
      <View style={[styles.row, { backgroundColor: palette.card }]}>
        <Photo uri={bar.photo_url} name={bar.name} style={styles.rowPhoto} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Text
              style={[
                text(16, 'Bold', 1.2),
                { color: palette.ink, flexShrink: 1 }
              ]}
              numberOfLines={1}
            >
              {bar.name}
            </Text>
            {bar.plan === 'elite' ? <Tag>Elite</Tag> : null}
            {bar.plan === 'pro' ? (
              <Tag outline color={palette.ink}>
                Pro
              </Tag>
            ) : null}
          </View>
          {game ? (
            <Text
              style={[text(12.5), { color: palette.muted }]}
              numberOfLines={1}
            >
              {matchLine(game)}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Text style={[text(12, 'Bold'), { color: palette.ink }]}>
              {formatKm(bar.distance_km)}
            </Text>
            <Text
              style={[text(12), { color: palette.muted, flexShrink: 1 }]}
              numberOfLines={1}
            >
              {bar.neighborhood}
            </Text>
            {bar.rating ? <Tag>{bar.rating.percentage}%</Tag> : null}
          </View>
        </View>
        {game ? (
          <View style={{ alignItems: 'flex-end', paddingRight: 4 }}>
            <Text
              style={[
                styles.rowTime,
                { color: live ? palette.live : palette.ink }
              ]}
            >
              {live ? 'AO VIVO' : formatTime(game.startsAt)}
            </Text>
            <Text style={[text(11.5), { color: palette.muted }]}>
              {live ? game.championship : dayLabel(game.startsAt, now)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pin: { alignItems: 'center' },
  pinLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: PAPER
  },
  pinLive: { paddingVertical: 8, paddingHorizontal: 12 },
  pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PAPER },
  pinTip: {
    width: 9,
    height: 9,
    marginTop: -6,
    transform: [{ rotate: '45deg' }],
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: PAPER
  },
  meHalo2: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(201,241,53,.10)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  meHalo1: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(201,241,53,.25)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  me: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACID,
    borderWidth: 3,
    borderColor: INK
  },
  chip: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    overflow: 'hidden'
  },
  chipOn: { backgroundColor: 'rgba(201,241,53,.9)' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE },
  tag: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 },
  photoPill: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  big: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18,18,15,.12)'
  },
  bigShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 6,
    backgroundColor: 'rgba(18,18,15,.09)'
  },
  bigShadowLive: { backgroundColor: 'rgba(232,50,12,.28)' },
  bigPhoto: { height: 128, backgroundColor: '#2a2a25' },
  bigPills: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6
  },
  bigDistance: { position: 'absolute', left: 10, bottom: 10 },
  heart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(36,36,32,.45)'
  },
  match: {
    paddingTop: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  matchFree: {
    paddingTop: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  team: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0
  },
  teamRight: { flexDirection: 'row-reverse' },
  teamMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  teamMarkText: { fontFamily: 'Anton', fontSize: 15, marginVertical: -4 },
  matchState: { fontFamily: 'Anton', fontSize: 22, marginVertical: -6 },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5, marginTop: 2 },
  perforation: { height: 18, justifyContent: 'center' },
  notch: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  dashed: {
    marginHorizontal: 14,
    borderTopWidth: 1.5,
    borderStyle: 'dashed'
  },
  bigFoot: { paddingHorizontal: 14, paddingBottom: 13 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18,18,15,.12)'
  },
  rowPhoto: {
    width: 62,
    height: 62,
    borderRadius: 3,
    backgroundColor: '#2a2a25'
  },
  rowTime: { fontFamily: 'Anton', fontSize: 24, marginVertical: -7 },
  noPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INK
  },
  noPhotoText: {
    fontFamily: 'Anton',
    fontSize: 28,
    color: ACID,
    marginVertical: -8
  }
})
