import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { isLiquidGlassAvailable } from 'expo-glass-effect'
import { LinearGradient } from 'expo-linear-gradient'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ViewStyle
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import Svg, { Line } from 'react-native-svg'
import { Glass } from '@/components/glass'
import { haptic, usePressScale } from '@/components/motion'
import { ACID, Icon, INK, LIVE, PAPER, text } from '@/components/ui'
import { formatKm, formatTime, isLive, teamMark } from '@/lib/explore'

/*
 * Peças do Explorar e da página do bar (07 do design, e o card e a linha da
 * página "Onside Componentes"): pino do mapa, chip, selos de vidro, o card
 * em formato de ingresso e a linha compacta. Claro e escuro seguem o tema do
 * sistema, com as cores do design para cada um.
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
    dark: false,
    bg: PAPER,
    sheet: PAPER,
    card: '#faf8f3',
    ink: INK,
    muted: '#55554f',
    line: 'rgba(18,18,15,.12)',
    ring: 'rgba(18,18,15,.08)',
    mark: '#e7e3db',
    markRing: 'rgba(18,18,15,.08)',
    dash: 'rgba(18,18,15,.16)',
    grabber: 'rgba(18,18,15,.18)',
    live: '#c92b0c',
    accent: LIVE,
    shadow: 'rgba(18,18,15,.09)',
    liveShadow: 'rgba(232,50,12,.28)'
  },
  dark: {
    dark: true,
    bg: INK,
    sheet: '#161613',
    card: '#1c1c18',
    ink: PAPER,
    muted: '#aaa9a4',
    line: 'rgba(241,238,230,.1)',
    ring: 'rgba(241,238,230,.09)',
    mark: '#2a2a25',
    markRing: 'rgba(241,238,230,.12)',
    dash: 'rgba(241,238,230,.16)',
    grabber: 'rgba(241,238,230,.2)',
    live: '#f3421d',
    accent: ACID,
    shadow: 'rgba(0,0,0,.35)',
    liveShadow: 'rgba(232,50,12,.30)'
  }
}
export type Palette = (typeof PALETTE)['light'] | (typeof PALETTE)['dark']

export function usePalette(): Palette {
  return PALETTE[useColorScheme() === 'dark' ? 'dark' : 'light']
}

const DAY = 86_400_000
const dayOf = (value: number | string | Date) =>
  new Date(value).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  })

/** "Hoje", "Amanhã", "Ontem" ou "sáb., 18/10". */
export function dayLabel(date: string | Date, now: number) {
  if (dayOf(date) === dayOf(now)) return 'Hoje'
  if (dayOf(date) === dayOf(now + DAY)) return 'Amanhã'
  if (dayOf(date) === dayOf(now - DAY)) return 'Ontem'
  return new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Sao_Paulo'
  })
}

/** Bar cadastrado há menos de 30 dias ganha o selo "Novo", como no web. */
export const isNewBar = (createdAt: string, now: number) =>
  now - new Date(createdAt).getTime() < 30 * DAY

export function matchLine(game: Game) {
  const names = game.participants.map((p) => p.team.name)
  if (names.length === 2) return `${names[0]} × ${names[1]}`
  return (
    game.participantFreeText ??
    (names.length ? names.join(', ') : game.championship)
  )
}

/** "BS" para Boteco Sete: a foto que falta vira as iniciais. */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word[0] ?? ''))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()

// --- Mapa -------------------------------------------------------------------

/**
 * O pino do bar: ao vivo em vermelho, com o nome; jogo mais tarde hoje em
 * acid, com a hora; o resto em tinta, com o nome.
 */
export function Pin({ bar, now }: { bar: SearchBar; now: number }) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  const later = game && !live && dayOf(game.startsAt) === dayOf(now)
  return (
    <PinTag
      label={later && game ? formatTime(game.startsAt) : bar.name}
      kind={live ? 'live' : later ? 'later' : 'idle'}
    />
  )
}

/** A etiqueta do pino, sem a regra de qual cor: o mapa de "Onde fica" a usa. */
export function PinTag({
  label,
  kind
}: {
  label: string
  kind: 'live' | 'later' | 'idle'
}) {
  const live = kind === 'live'
  const bg = live ? LIVE : kind === 'later' ? ACID : INK
  const fg = kind === 'later' ? INK : PAPER
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
          {label}
        </Text>
      </View>
      <View style={[styles.pinTip, { backgroundColor: bg }]} />
    </View>
  )
}

/**
 * O ponto do bar (20d): o padrão do mapa. Tinta; vermelho com halo se ao
 * vivo; acid se Elite. 18 pt, com 44 pt de área de toque.
 */
export function MapPoint({
  live,
  elite,
  dark
}: {
  live: boolean
  elite: boolean
  dark: boolean
}) {
  return (
    <View style={styles.pointHit}>
      {live ? <View style={styles.pointHalo} /> : null}
      <View
        style={[
          styles.point,
          {
            backgroundColor: live ? LIVE : elite ? ACID : dark ? PAPER : INK,
            borderColor: dark ? INK : PAPER
          }
        ]}
      />
    </View>
  )
}

/** O grupo (20a): bares colados na tela viram um número; o selo conta os ao vivo. */
export function MapGroup({ count, live }: { count: number; live: number }) {
  return (
    <View style={styles.groupHit}>
      <View style={styles.group}>
        <Text style={styles.groupText}>{count}</Text>
      </View>
      {live ? (
        <View style={styles.groupLive}>
          <View style={styles.groupLiveDot} />
          <Text style={[text(10.5, 'Bold', 1.1), { color: PAPER }]}>
            {live}
          </Text>
        </View>
      ) : null}
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

// --- Vidro ------------------------------------------------------------------

const LIQUID = isLiquidGlassAvailable()

const TINT = {
  live: 'rgba(232,50,12,.78)',
  acid: 'rgba(201,241,53,.82)',
  dark: 'rgba(36,36,32,.40)',
  favorite: 'rgba(232,50,12,.8)'
}

/** Selo de vidro sobre foto: "Ao vivo", "Elite", "Hoje às 21:30", "0,8 km". */
export function PhotoPill({
  kind,
  height = 30,
  children
}: {
  kind: 'live' | 'acid' | 'dark'
  height?: number
  children: ReactNode
}) {
  return (
    <Glass
      tone="dark"
      tint={TINT[kind]}
      style={[styles.photoPill, { height, borderRadius: height / 2 }]}
    >
      {children}
    </Glass>
  )
}

const pillText = (color: string) => [text(12.5, 'Bold', 1.2), { color }]

/** Chip de filtro sobre o mapa; ligado, fica no vidro acid. */
export function Chip({
  label,
  icon,
  live,
  on,
  palette,
  onPress
}: {
  label: string
  icon?: 'tv' | 'outdoor' | 'sound' | 'ticket' | 'premiere' | 'person'
  live?: boolean
  on: boolean
  palette: Palette
  onPress: () => void
}) {
  const fg = on ? INK : palette.ink
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      // O vidro interativo do iOS 26 já reage ao toque; a escala só entra
      // onde ele não existe.
      onPressIn={LIQUID ? undefined : press.onPressIn}
      onPressOut={LIQUID ? undefined : press.onPressOut}
    >
      <Animated.View style={LIQUID ? undefined : press.style}>
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          tint={on ? 'rgba(201,241,53,.66)' : undefined}
          interactive
          style={styles.chip}
        >
          {live ? <View style={styles.liveDot} /> : null}
          {icon ? (
            <Icon name={icon} size={16} color={fg} accent={palette.accent} />
          ) : null}
          <Text
            style={[text(13.5, on ? 'Bold' : 'SemiBold', 1.2), { color: fg }]}
          >
            {label}
          </Text>
        </Glass>
      </Animated.View>
    </Pressable>
  )
}

/** Selo pequeno: "87% voltariam", "Pro", "Novo". */
export function Tag({
  children,
  outline,
  color = INK,
  shadow
}: {
  children: ReactNode
  outline?: boolean
  color?: string
  shadow?: boolean
}) {
  return (
    <View
      style={[
        styles.tag,
        outline
          ? { borderWidth: 1, borderColor: color }
          : { backgroundColor: ACID },
        shadow && styles.tagShadow
      ]}
    >
      <Text style={[text(10.5, 'Bold', 1.2), { color: outline ? color : INK }]}>
        {children}
      </Text>
    </View>
  )
}

/** Sombra dura deslocada, como o `box-shadow` sem desfoque do design. */
function HardShadow({ color, offset }: { color: string; offset: number }) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          top: offset,
          left: offset,
          right: -offset,
          bottom: -offset,
          borderRadius: 6,
          backgroundColor: color
        }
      ]}
    />
  )
}

// --- Card do bar (ingresso) --------------------------------------------------

export function Photo({
  uri,
  name,
  style,
  palette,
  big
}: {
  uri: string | null
  name: string
  style: ViewStyle
  palette: Palette
  big?: boolean
}) {
  // Foto que não carrega cai para as iniciais em vez de um quadro vazio.
  const [failed, setFailed] = useState(false)
  if (uri && !failed)
    return (
      <Image
        source={{ uri }}
        // O quadro do design enquanto a foto carrega (ou se ela não vem).
        style={
          [style, { backgroundColor: big ? '#2a2a25' : palette.mark }] as never
        }
        onError={() => setFailed(true)}
      />
    )
  return (
    <View
      style={[
        style,
        styles.noPhoto,
        { backgroundColor: big ? '#2a2a25' : palette.mark }
      ]}
    >
      <Text
        style={[
          text(big ? 34 : 19, 'Bold', 1.2),
          { color: big ? 'rgba(241,238,230,.22)' : palette.ink }
        ]}
      >
        {initials(name)}
      </Text>
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
      <View style={styles.match}>
        <Text
          style={[text(14, 'Bold', 1.15), { color: palette.ink, flex: 1 }]}
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
      <View
        style={[
          styles.teamMark,
          { backgroundColor: palette.mark, borderColor: palette.markRing }
        ]}
      >
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

/** O picote entre o jogo e o bar, com os dois recortes na cor da folha. */
export function Perforation({
  palette,
  shadow,
  inset = 14,
  radius = 9
}: {
  palette: Palette
  /**
   * A sombra dura do ingresso. Nos ingressos recortados do design (Meus
   * jogos, código no balcão) a sombra tem o mesmo furo, deslocado: no furo
   * da direita aparece um crescente dela.
   */
  shadow?: { color: string; offset: number }
  /** Distância do tracejado até a borda. */
  inset?: number
  /** Raio do furo. */
  radius?: number
}) {
  const size = radius * 2
  const notch = {
    width: size,
    height: size,
    borderRadius: radius,
    backgroundColor: palette.sheet
  }
  return (
    <View style={[styles.perforation, { height: size }]}>
      <View style={[styles.notch, notch, { left: -radius }]} />
      {/* Tracejado em SVG: no iOS o React Native não desenha borda
          tracejada de um lado só. */}
      <Svg height={2} style={[styles.dashed, { marginHorizontal: inset }]}>
        <Line
          x1={0}
          y1={1}
          x2="100%"
          y2={1}
          stroke={palette.dash}
          strokeWidth={1.5}
          strokeDasharray="4.5,4.5"
        />
      </Svg>
      <View
        style={[styles.notch, notch, { right: -radius, overflow: 'hidden' }]}
      >
        {shadow ? (
          <>
            {/* A sombra vai até a borda dela (offset além da do card)… */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: radius + shadow.offset,
                backgroundColor: shadow.color
              }}
            />
            {/* …menos o furo dela, deslocado como ela. */}
            <View
              style={[
                notch,
                {
                  position: 'absolute',
                  left: shadow.offset,
                  top: shadow.offset
                }
              ]}
            />
          </>
        ) : null}
      </View>
    </View>
  )
}

/** As características que viram ícone no card (telão, som, Premiere, área externa). */
// Os três do design no ingresso; Premiere fica nos ladrilhos da página.
const AMENITY_ICONS = [
  [1, 'tv'],
  [2, 'sound'],
  [4, 'outdoor']
] as const

export function AmenityIcons({
  ids,
  palette
}: {
  ids: number[]
  palette: Palette
}) {
  const shown = AMENITY_ICONS.filter(([id]) => ids.includes(id))
  if (!shown.length) return null
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {shown.map(([id, icon]) => (
        <Icon key={id} name={icon} size={15} color={palette.muted} />
      ))}
    </View>
  )
}

/**
 * Quem vai: a inicial dos três que marcaram por último, sobrepostas, e o
 * total, a partir do piso que o servidor aplica ("M R J 34 vão", 2g).
 */
export function Going({
  count,
  initials,
  palette
}: {
  count: number
  initials: string[]
  palette: Palette
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {initials.length ? (
        initials.map((letter, index) => {
          const [bg, fg] = GOING_COLORS[index % GOING_COLORS.length]
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa
              key={index}
              style={[
                styles.goer,
                {
                  // Passo de 15 pt entre centros, como os 22 pt com -7 do design.
                  marginLeft: index ? -11 : 0,
                  backgroundColor: bg === 'mark' ? palette.mark : bg,
                  borderColor: palette.card
                }
              ]}
            >
              <Text
                style={[
                  text(10, 'Bold', 1.2),
                  { color: fg === 'ink' ? palette.ink : fg }
                ]}
                maxFontSizeMultiplier={1}
              >
                {letter}
              </Text>
            </View>
          )
        })
      ) : (
        <Icon
          name="people"
          size={17}
          color={palette.ink}
          accent={palette.accent}
        />
      )}
      <Text
        style={[
          text(12.5, 'SemiBold', 1.2),
          { color: palette.ink, marginLeft: 5 }
        ]}
      >
        {count.toLocaleString('pt-BR')} {count === 1 ? 'vai' : 'vão'}
      </Text>
    </View>
  )
}

/** As três bolinhas do design: acid, cinza e vermelha. */
const GOING_COLORS = [
  [ACID, INK],
  ['mark', 'ink'],
  [LIVE, PAPER]
] as const

/** O que o ingresso mostra: a busca e o perfil do bar dão os dois. */
export type TicketBar = Pick<
  SearchBar,
  | 'id'
  | 'name'
  | 'neighborhood'
  | 'photo_url'
  | 'plan'
  | 'rating'
  | 'amenities'
  | 'goingCount'
  | 'goingInitials'
> & {
  nextEvent?: Game
  /** Sem ela (link compartilhado), o selo de distância não aparece. */
  distance_km?: number | null
}

/**
 * O coração do card: ao favoritar (ou desfazer), o ícone estala de 0,9 para
 * 1 numa mola curta. Só escala: está sobre vidro, que não aceita opacidade
 * animada. Não estala na primeira pintura.
 */
function HeartPop({ on }: { on: boolean }) {
  const scale = useSharedValue(1)
  const first = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: estala quando `on` muda
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    scale.set(0.9)
    scale.set(withSpring(1, { duration: 300, dampingRatio: 0.7 }))
  }, [on, scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }]
  }))
  return (
    <Animated.View style={style}>
      <Icon name="fan" size={18} color={PAPER} accent={PAPER} />
    </Animated.View>
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

/**
 * O primeiro bar da lista, em formato de ingresso: a foto com os selos de
 * vidro, o jogo, o picote e o bar. A sombra muda com o estado: vermelha ao
 * vivo, acid no Elite, a padrão no resto.
 */
export function BarTicket({
  bar,
  now,
  palette,
  favorite,
  onFavorite,
  onPress
}: Omit<CardProps, 'bar' | 'onPress'> & {
  bar: TicketBar
  onPress?: () => void
}) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  const elite = bar.plan === 'elite'
  const shadow = live
    ? { color: palette.liveShadow, offset: 5 }
    : elite
      ? { color: 'rgba(201,241,53,.85)', offset: 5 }
      : { color: palette.shadow, offset: 4 }
  const press = usePressScale(0.985)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bar.name}
      disabled={!onPress}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <HardShadow {...shadow} />
        <View
          style={[
            styles.ticket,
            { backgroundColor: palette.card, borderColor: palette.ring }
          ]}
        >
          <View style={styles.ticketPhoto}>
            <Photo
              uri={bar.photo_url}
              name={bar.name}
              style={StyleSheet.absoluteFill}
              palette={palette}
              big
            />
            <LinearGradient
              colors={['rgba(18,18,15,0)', 'rgba(18,18,15,.55)']}
              locations={[0.4, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.ticketPills}>
              {live ? (
                <PhotoPill kind="live">
                  <View style={[styles.liveDot, { backgroundColor: PAPER }]} />
                  <Text style={pillText(INK)}>Ao vivo</Text>
                </PhotoPill>
              ) : game ? (
                <PhotoPill kind="dark">
                  <Text style={[styles.monoPill, { color: PAPER }]}>
                    {dayLabel(game.startsAt, now)} às{' '}
                    {formatTime(game.startsAt)}
                  </Text>
                </PhotoPill>
              ) : null}
              {elite ? (
                <PhotoPill kind="acid">
                  <Icon name="medal" size={14} color={INK} />
                  <Text style={pillText(INK)}>Elite</Text>
                </PhotoPill>
              ) : null}
            </View>
            {bar.distance_km != null ? (
              <View style={styles.ticketDistance}>
                <PhotoPill kind="dark" height={28}>
                  <Icon name="pin" size={13} color={PAPER} />
                  <Text style={pillText(PAPER)}>
                    {formatKm(bar.distance_km)}
                  </Text>
                </PhotoPill>
              </View>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                favorite ? 'Tirar dos favoritos' : 'Favoritar'
              }
              accessibilityState={{ selected: favorite }}
              hitSlop={8}
              onPress={() => {
                haptic.select()
                onFavorite()
              }}
              style={styles.heartSpot}
            >
              <Glass
                tone="dark"
                tint={favorite ? TINT.favorite : TINT.dark}
                interactive
                style={styles.heart}
              >
                <HeartPop on={favorite} />
              </Glass>
            </Pressable>
          </View>
          {game ? <MatchRow game={game} now={now} palette={palette} /> : null}
          {game ? (
            <Perforation palette={palette} />
          ) : (
            <View style={{ height: 12 }} />
          )}
          <View style={styles.ticketFoot}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.nameRow}>
                <Text
                  style={[styles.ticketName, { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {bar.name}
                </Text>
                {bar.rating ? (
                  <Tag>{bar.rating.percentage}% voltariam</Tag>
                ) : null}
              </View>
              <View style={styles.hoodRow}>
                <Text
                  style={[
                    text(12.5, 'Regular', 1.3),
                    { color: palette.muted, flexShrink: 1 }
                  ]}
                  numberOfLines={1}
                >
                  {bar.neighborhood}
                </Text>
                <AmenityIcons ids={bar.amenities} palette={palette} />
              </View>
            </View>
            {bar.goingCount ? (
              <Going
                count={bar.goingCount}
                initials={bar.goingInitials}
                palette={palette}
              />
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  )
}

/**
 * A linha compacta: foto (ou iniciais, com "Novo" para bar recém-chegado),
 * jogo, distância e a hora em destaque à direita.
 */
export function BarRow({
  bar,
  now,
  palette,
  onPress
}: Omit<CardProps, 'favorite' | 'onFavorite'>) {
  const game = bar.nextEvent
  const live = game ? isLive(game, now) : false
  const press = usePressScale(0.985)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bar.name}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <HardShadow color={palette.shadow} offset={4} />
        <View
          style={[
            styles.row,
            { backgroundColor: palette.card, borderColor: palette.ring }
          ]}
        >
          <View>
            <Photo
              uri={bar.photo_url}
              name={bar.name}
              style={styles.rowPhoto}
              palette={palette}
            />
            {isNewBar(bar.created_at, now) ? (
              <View style={styles.newTag}>
                <Tag shadow>Novo</Tag>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={styles.nameRow}>
              <Text
                style={[
                  text(16, 'Bold', 1.2),
                  { color: palette.ink, flexShrink: 1 }
                ]}
                numberOfLines={1}
              >
                {bar.name}
              </Text>
              {bar.plan === 'pro' ? (
                <Tag outline color={palette.ink}>
                  Pro
                </Tag>
              ) : null}
            </View>
            <Text
              style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
              numberOfLines={1}
            >
              {game ? matchLine(game) : 'Sem eventos programados'}
            </Text>
            <View style={styles.rowMeta}>
              <View style={styles.km}>
                <Icon name="pin" size={13} color={palette.ink} />
                <Text style={[text(12, 'Bold', 1.2), { color: palette.ink }]}>
                  {formatKm(bar.distance_km)}
                </Text>
              </View>
              <Text
                style={[
                  text(12, 'Regular', 1.2),
                  { color: palette.muted, flexShrink: 1 }
                ]}
                numberOfLines={1}
              >
                {bar.neighborhood}
              </Text>
              {bar.rating ? <Tag>{bar.rating.percentage}%</Tag> : null}
            </View>
          </View>
          {game ? (
            <View style={styles.rowWhen}>
              <Text
                style={[
                  styles.rowTime,
                  { color: live ? palette.live : palette.ink }
                ]}
              >
                {live ? 'AO VIVO' : formatTime(game.startsAt)}
              </Text>
              <Text
                style={[text(11.5, 'Regular', 1.2), { color: palette.muted }]}
              >
                {live ? 'Agora' : dayLabel(game.startsAt, now)}
              </Text>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pin: { alignItems: 'center' },
  pointHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pointHalo: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(232,50,12,.22)'
  },
  point: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 }
  },
  groupHit: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center'
  },
  group: {
    width: 40,
    height: 40,
    borderRadius: 7,
    backgroundColor: INK,
    borderWidth: 2,
    borderColor: PAPER,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: INK,
    shadowOpacity: 0.3,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  groupText: { fontFamily: 'Anton', fontSize: 20, color: PAPER },
  groupLive: {
    position: 'absolute',
    top: 2,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: LIVE,
    borderWidth: 1.5,
    borderColor: PAPER
  },
  groupLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: PAPER
  },
  // 22 pt com o anel de 2 pt da cor do cartão por fora, como o box-shadow.
  goer: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: PAPER,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 }
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
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE },
  tag: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3
  },
  tagShadow: {
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 }
  },
  photoPill: {
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden'
  },
  monoPill: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  ticket: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1
  },
  ticketPhoto: { height: 128, backgroundColor: '#2a2a25' },
  ticketPills: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6
  },
  ticketDistance: { position: 'absolute', left: 10, bottom: 10 },
  heartSpot: { position: 'absolute', top: 8, right: 8 },
  heart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  match: {
    paddingTop: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
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
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  teamMarkText: {
    fontFamily: 'Anton',
    fontSize: 15,
    letterSpacing: 0.3,
    marginVertical: -4
  },
  matchState: { fontFamily: 'Anton', fontSize: 22, marginVertical: -6 },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5, marginTop: 2 },
  perforation: { justifyContent: 'center' },
  notch: { position: 'absolute' },
  dashed: { alignSelf: 'stretch' },
  ticketFoot: {
    paddingHorizontal: 14,
    paddingBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  nameRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  ticketName: {
    ...text(17, 'Bold', 1.2),
    letterSpacing: -0.17,
    flexShrink: 1
  },
  hoodRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 3
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1
  },
  rowPhoto: { width: 62, height: 62, borderRadius: 3 },
  newTag: { position: 'absolute', left: -4, top: -4 },
  rowMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  km: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  rowWhen: { alignItems: 'flex-end', paddingRight: 4, gap: 3 },
  rowTime: { fontFamily: 'Anton', fontSize: 24, marginVertical: -7 },
  noPhoto: { alignItems: 'center', justifyContent: 'center' }
})
