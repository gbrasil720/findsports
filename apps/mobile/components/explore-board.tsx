import { useEffect, useRef } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg'
import { HardShadow, Photo, Tag } from '@/components/explore'
import { EASE, haptic, usePressScale } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, LIVE, PAPER, Text, text } from '@/components/ui'
import { formatTime } from '@/lib/explore'
import {
  type BoardBar,
  distance,
  type QuietBar,
  type RowGame
} from '@/lib/explore-board'

/*
 * As peças do Explorar novo (rodada 1 do redesign, telas 3, 3b e 3c): a
 * fileira de dias, a de jogos, o título do jogo na folha, o cartão compacto
 * do bar, os sem jogo, o "Ampliar", o cartão do jogo ao vivo e a faixa da
 * conta. Fora do mapa nada é vidro (decisão 1 da rodada): peças sólidas.
 */

const MONO = 'GeistMono-SemiBold'

/** A pílula da fileira de dias: o indicador anda sob o rótulo (200 ms). */
export function DayRow({
  days,
  value,
  onChange,
  stretch
}: {
  days: { day: string; label: string }[]
  value: string
  onChange: (day: string) => void
  /** O seletor do desenho (`.seg`): a largura toda, opções iguais, em mono. */
  stretch?: boolean
}) {
  const palette = usePalette()
  const widths = useRef<{ x: number; width: number }[]>([])
  const x = useSharedValue(0)
  const w = useSharedValue(0)
  const index = Math.max(
    0,
    days.findIndex((d) => d.day === value)
  )
  const place = (animate: boolean) => {
    const box = widths.current[index]
    if (!box) return
    const to = (v: number) =>
      animate ? withTiming(v, { duration: 200, easing: EASE }) : v
    x.set(to(box.x))
    w.set(to(box.width))
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: segue o dia escolhido
  useEffect(() => place(true), [index])
  const pill = useAnimatedStyle(() => ({
    width: w.get(),
    transform: [{ translateX: x.get() }]
  }))
  return (
    <View
      style={[
        styles.days,
        { backgroundColor: stretch ? palette.mark : palette.card },
        stretch && styles.daysStretch
      ]}
    >
      <Animated.View
        style={[
          styles.dayPill,
          { backgroundColor: palette.ink },
          stretch && { top: 4, bottom: 4, borderRadius: 999 },
          pill
        ]}
      />
      {days.map((d, i) => {
        const on = i === index
        return (
          <Pressable
            key={d.day}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onLayout={(e) => {
              widths.current[i] = e.nativeEvent.layout
              if (i === index) place(false)
            }}
            onPress={() => {
              if (on) return
              haptic.select()
              onChange(d.day)
            }}
            style={[styles.day, stretch && styles.dayStretch]}
          >
            <Text
              style={[
                stretch
                  ? { fontFamily: MONO, fontSize: 13.5 }
                  : text(13.5, 'Bold', 1.2),
                { color: on ? palette.bg : palette.ink }
              ]}
            >
              {d.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** A fileira dos jogos do dia: o escolhido em tinta, o ao vivo em vermelho. */
export function GameRow({
  games,
  chosen,
  onChoose
}: {
  games: RowGame[]
  chosen: string | undefined
  onChoose: (key: string) => void
}) {
  const palette = usePalette()
  // O escolhido fora da tela (vindo de "O jogo de hoje", de outro dia) fica
  // à vista: a fileira rola até ele.
  const scroller = useRef<ScrollView>(null)
  const at = games.findIndex((game) => game.key === chosen)
  useEffect(() => {
    if (at > 0)
      scroller.current?.scrollTo({ x: at * GAME_STEP, animated: true })
  }, [at])
  if (!games.length) return null
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.gameRow}
    >
      {games.map((game) => {
        const on = game.key === chosen
        const fg = on ? palette.bg : palette.ink
        return (
          <Pressable
            key={game.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${game.title}, ${game.live ? 'ao vivo' : formatTime(game.startsAt)}, ${game.bars.length} ${game.bars.length === 1 ? 'bar' : 'bares'}`}
            onPress={() => {
              if (on) return
              haptic.select()
              onChoose(game.key)
            }}
          >
            {/* Dezenas de trocas por dia: só o estado, sem deslizar. */}
            <View
              style={[
                styles.game,
                on
                  ? {
                      backgroundColor: palette.ink,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 4 }
                    }
                  : { backgroundColor: palette.card, shadowColor: palette.drop }
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.gameKicker,
                  on ? { color: fg, opacity: 0.7 } : { color: palette.muted }
                ]}
              >
                {game.live ? (
                  <Text style={{ color: palette.live }}>● ao vivo</Text>
                ) : (
                  formatTime(game.startsAt)
                )}
                {` · ${game.championship}`}
              </Text>
              <View style={styles.gameLine}>
                <Text
                  numberOfLines={1}
                  style={[text(15, 'Bold', 1.15), { color: fg, flex: 1 }]}
                >
                  {game.title}
                </Text>
                <Text style={[styles.gameCount, { color: fg }]}>
                  {game.bars.length}
                </Text>
              </View>
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/** Largura de um jogo na fileira mais o espaço entre eles. */
const GAME_STEP = 216

/** "FLAMENGO × PALMEIRAS": o × em vermelho (acid no escuro). */
export function GameTitle({
  title,
  size = 34,
  color,
  accent,
  cross = 0.75
}: {
  title: string
  size?: number
  color: string
  accent: string
  /** O tamanho do ×, em em (o placar ao vivo usa um menor, cinza). */
  cross?: number
}) {
  const sides = title.split(' × ')
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[styles.anton, { fontSize: size, color }]}
    >
      {sides.length === 2 ? (
        <>
          {sides[0]}
          {/* O × menor, na cor de destaque. */}
          <Text style={{ color: accent, fontSize: size * cross }}> × </Text>
          {sides[1]}
        </>
      ) : (
        title
      )}
    </Text>
  )
}

/** Chip sólido da folha (raio, telão, som, atalhos); ligado, em tinta. */
export function SheetChip({
  label,
  icon,
  on,
  live,
  onPress,
  onLongPress
}: {
  label: string
  icon?: Parameters<typeof Icon>[0]['name']
  on: boolean
  live?: boolean
  onPress: () => void
  /** Segurar o atalho abre a tela de atalhos (2b da rodada 5). */
  onLongPress?: () => void
}) {
  const palette = usePalette()
  const bg = live && on ? LIVE : on ? palette.ink : palette.card
  const fg = live && on ? PAPER : on ? palette.bg : palette.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      onLongPress={
        onLongPress &&
        (() => {
          haptic.pick()
          onLongPress()
        })
      }
      style={[
        styles.chip,
        { backgroundColor: bg },
        !on && { borderColor: palette.line, borderWidth: 1 }
      ]}
    >
      {live && !on ? <View style={styles.liveDot} /> : null}
      {icon ? (
        <Icon name={icon} size={16} color={fg} accent={palette.accent} />
      ) : null}
      <Text style={[text(13.5, on ? 'Bold' : 'SemiBold', 1.2), { color: fg }]}>
        {label}
      </Text>
    </Pressable>
  )
}

/** Telão e som, os do jogo neste bar, em mono. */
function Screens({ bar, color }: { bar: BoardBar; color: string }) {
  if (!bar.onBigScreen && !bar.withSound) return null
  return (
    <View style={styles.screens}>
      {bar.onBigScreen ? (
        <View style={styles.screen}>
          <Icon name="tv" size={14} color={color} />
          <Text style={[styles.mono11, { color }]}>Telão</Text>
        </View>
      ) : null}
      {bar.withSound ? (
        <View style={styles.screen}>
          <Icon name="sound" size={14} color={color} />
          <Text style={[styles.mono11, { color }]}>Som</Text>
        </View>
      ) : null}
    </View>
  )
}

/** O coração do cartão: estala de 0,9 para 1 ao trocar. */
function Heart({ on, onPress }: { on: boolean; onPress: () => void }) {
  const palette = usePalette()
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
  }, [on])
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }]
  }))
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={on ? 'Tirar dos salvos' : 'Salvar bar'}
      accessibilityState={{ selected: on }}
      hitSlop={10}
      onPress={() => {
        haptic.select()
        onPress()
      }}
    >
      <Animated.View style={style}>
        <Icon
          name="fan"
          size={22}
          color={on ? palette.live : palette.muted}
          accent={on ? palette.live : palette.accent}
        />
      </Animated.View>
    </Pressable>
  )
}

/** "34 / VÃO" à direita do cartão, em mono. */
function GoingCount({ count, color }: { count: number; color: string }) {
  const palette = usePalette()
  return (
    <View style={{ alignItems: 'flex-end', gap: 4 }}>
      <Text style={[styles.goingNumber, { color }]}>
        {count.toLocaleString('pt-BR')}
      </Text>
      <Text style={[styles.goingLabel, { color: palette.muted }]}>
        {count === 1 ? 'VAI' : 'VÃO'}
      </Text>
    </View>
  )
}

/**
 * O cartão compacto do bar (tela 3): foto, Elite ou ao vivo, nome, bairro e
 * distância, telão ou som, o coração e "34 vão" em mono à direita.
 */
export function BoardCard({
  bar,
  live,
  favorite,
  chosen,
  onFavorite,
  onPress
}: {
  bar: BoardBar
  live: boolean
  favorite: boolean
  /** O bar aberto ao lado no tablet. */
  chosen?: boolean
  onFavorite: () => void
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePressScale(0.985)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bar.name}, ${bar.neighborhood}, ${distance(bar.distanceKm)}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <HardShadow
          color={chosen ? 'rgba(201,241,53,.85)' : palette.drop}
          offset={3}
          radius={20}
        />
        <View style={[styles.card, { backgroundColor: palette.card }]}>
          <Photo uri={bar.photoUrl} name={bar.name} style={styles.photo} />
          <View style={{ flex: 1, minWidth: 0 }}>
            {live || bar.elite ? (
              <View style={[styles.tags, { marginBottom: 6 }]}>
                {live ? (
                  <View
                    style={[styles.boardTag, { backgroundColor: palette.live }]}
                  >
                    <View style={styles.boardTagDot} />
                    <Text style={[styles.boardTagText, { color: INK }]}>
                      AO VIVO
                    </Text>
                  </View>
                ) : null}
                {bar.elite ? (
                  // `.tag.elite`: tinta e acid no claro, acid e tinta no escuro.
                  <View
                    style={[
                      styles.boardTag,
                      { backgroundColor: palette.dark ? ACID : INK }
                    ]}
                  >
                    <Text
                      style={[
                        styles.boardTagText,
                        { color: palette.dark ? INK : ACID }
                      ]}
                    >
                      ELITE
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text
              numberOfLines={2}
              style={[text(17, 'Bold', 1.2), { color: palette.ink }]}
            >
              {bar.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                text(13.5, 'Regular', 1.3),
                { color: palette.muted, marginTop: 3 }
              ]}
            >
              {bar.neighborhood} · {distance(bar.distanceKm)}
            </Text>
            <Screens bar={bar} color={palette.muted} />
          </View>
          <View style={styles.cardSide}>
            <Heart on={favorite} onPress={onFavorite} />
            {bar.going ? (
              <GoingCount count={bar.going.count} color={palette.ink} />
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  )
}

/** O corte tracejado antes dos sem jogo: "SEM JOGO MARCADO". */
export function QuietDivider({ alone }: { alone: boolean }) {
  const palette = usePalette()
  return (
    <View style={styles.divider}>
      <View style={[styles.dash, { borderColor: palette.dash }]} />
      <Text style={[styles.mono10, { color: palette.muted }]}>
        {alone ? 'PERTO DE VOCÊ, SEM JOGO MARCADO' : 'SEM JOGO MARCADO'}
      </Text>
      <View style={[styles.dash, { borderColor: palette.dash }]} />
    </View>
  )
}

/** Bar perto sem jogo no dia: cinza, só com o coração. */
export function QuietCard({
  bar,
  favorite,
  onFavorite,
  onPress
}: {
  bar: QuietBar
  favorite: boolean
  onFavorite: () => void
  onPress: () => void
}) {
  const palette = usePalette()
  const open = bar.opening?.open ? 'aberto' : bar.opening ? 'fechado' : null
  const tv = bar.amenities.includes(1) ? 'telão' : null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bar.name}, sem jogo marcado`}
      onPress={onPress}
      style={[
        styles.quiet,
        { backgroundColor: palette.card, borderColor: palette.line }
      ]}
    >
      <Photo uri={bar.photoUrl} name={bar.name} style={styles.quietPhoto} />
      <View style={{ flex: 1, minWidth: 0, opacity: 0.75 }}>
        <Text
          numberOfLines={1}
          style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}
        >
          {bar.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
        >
          {[bar.neighborhood, distance(bar.distanceKm), tv, open]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Heart on={favorite} onPress={onFavorite} />
    </Pressable>
  )
}

/** "Ampliar para 3 km": o ganho em número, num bloco escuro. */
export function WidenBlock({
  km,
  gain,
  onWiden
}: {
  km: number
  /** Quantos bares a mais passam o jogo no raio maior; `null` sem saber. */
  gain: number | null
  onWiden: () => void
}) {
  return (
    <View style={styles.widen}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.anton, { fontSize: 22, color: PAPER }]}
        >
          AMPLIAR PARA {km.toLocaleString('pt-BR')} KM
        </Text>
        <Text style={[text(12.5, 'Regular', 1.3), { color: '#aaa9a4' }]}>
          {gain
            ? `mais ${gain} ${gain === 1 ? 'bar' : 'bares'} com o jogo · vale só agora`
            : 'vale só agora'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ampliar para ${km} km`}
        onPress={() => {
          haptic.select()
          onWiden()
        }}
        style={styles.widenButton}
      >
        <Text style={[text(13.5, 'Bold', 1.2), { color: INK }]}>Ampliar</Text>
      </Pressable>
    </View>
  )
}

/**
 * Um jogo ao vivo (tela 3c, atalho "Ao vivo"): cartão escuro nos dois temas,
 * a faixa "AO VIVO" com o início (a Onside não tem o minuto), os times em
 * Anton e os bares que passam, cada um com quantos vão.
 */
export function LiveGameCard({
  game,
  bars,
  onOpen
}: {
  game: RowGame
  bars: BoardBar[]
  onOpen: (bar: BoardBar) => void
}) {
  return (
    <View style={styles.liveCard}>
      {/* A trama de pontos do placar (`.qlv`). */}
      <Svg style={styles.liveDots} pointerEvents="none">
        <Defs>
          <Pattern
            id="placar"
            width={7}
            height={7}
            patternUnits="userSpaceOnUse"
          >
            <Circle cx={3.5} cy={3.5} r={1.2} fill="rgba(241,238,230,.07)" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#placar)" />
      </Svg>
      <View style={styles.liveHead}>
        <View style={[styles.boardTag, { backgroundColor: '#f3421d' }]}>
          <View style={styles.boardTagDot} />
          <Text style={[styles.boardTagText, { color: INK }]}>AO VIVO</Text>
        </View>
        <Text style={[styles.mono11, { color: '#aaa9a4', flex: 1 }]}>
          começou {formatTime(game.startsAt)}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.mono10, { color: '#aaa9a4', maxWidth: 120 }]}
        >
          {game.championship.toUpperCase()}
        </Text>
      </View>
      <GameTitle
        title={game.title}
        size={32}
        color={PAPER}
        accent="#6a6a63"
        cross={0.625}
      />
      {bars.map((bar) => (
        <Pressable
          key={bar.barId}
          accessibilityRole="button"
          accessibilityLabel={bar.name}
          onPress={() => onOpen(bar)}
          style={styles.liveBar}
        >
          <Photo uri={bar.photoUrl} name={bar.name} style={styles.quietPhoto} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[text(14, 'Bold', 1.25), { color: PAPER }]}
            >
              {bar.name}
            </Text>
            <Text
              numberOfLines={1}
              style={[text(12, 'Regular', 1.3), { color: '#aaa9a4' }]}
            >
              {[
                bar.neighborhood,
                distance(bar.distanceKm),
                bar.onBigScreen && bar.withSound
                  ? 'telão e som'
                  : bar.onBigScreen
                    ? 'telão'
                    : bar.withSound
                      ? 'som'
                      : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {bar.going ? (
            // `.qn`: o número em Anton acid e o rótulo em duas linhas.
            <View style={styles.liveCount}>
              <Text style={styles.liveNumber}>
                {bar.going.count.toLocaleString('pt-BR')}
              </Text>
              <Text style={styles.liveLabel}>
                {bar.going.count === 1 ? 'VAI' : 'VÃO'}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  )
}

/** No fim da lista, para quem não tem conta: o que a conta dá. */
export function AccountNudge({ onPress }: { onPress: () => void }) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.nudge, { borderColor: palette.dash }]}
    >
      <Icon name="ticket" size={18} color={palette.ink} />
      <Text
        style={[text(13.5, 'Regular', 1.35), { color: palette.ink, flex: 1 }]}
      >
        <Text style={text(13.5, 'Bold', 1.35)}>Crie a conta</Text> para salvar
        bares e marcar presença.
      </Text>
      <Icon name="next" size={16} color={palette.muted} />
    </Pressable>
  )
}

/**
 * O bar tocado no mapa (tela 3b): no lugar da folha, um cartão flutuante com
 * a foto, aberto ou fechado, a nota, o jogo com a oferta e quem vai, e as
 * duas ações. Sobe de onde a folha estava (24 pt e opacidade, 240 ms).
 */
export function BarFloat({
  bar,
  game,
  favorite,
  onFavorite,
  onClose,
  onOpen,
  onGo
}: {
  bar: BoardBar | QuietBar
  game: RowGame | undefined
  favorite: boolean
  onFavorite: () => void
  onClose: () => void
  onOpen: () => void
  onGo: () => void
}) {
  const palette = usePalette()
  const shown = useSharedValue(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: entra uma vez por bar
  useEffect(() => {
    shown.set(withTiming(1, { duration: 240, easing: EASE }))
  }, [])
  const enter = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 24 }]
  }))
  const withGame = 'eventId' in bar ? bar : null
  const closes = withGame?.closes
  const open = 'opening' in bar ? bar.opening : null
  const status = closes
    ? `ABERTO · FECHA ${closes}`
    : open
      ? open.open
        ? open.closes
          ? `ABERTO · FECHA ${open.closes}`
          : 'ABERTO'
        : 'FECHADO'
      : null
  const rating = withGame?.rating
  const extras = withGame
    ? [
        withGame.onBigScreen ? 'Telão' : null,
        withGame.withSound ? 'Som' : null,
        withGame.offer
      ].filter(Boolean)
    : []
  return (
    <Animated.View
      style={[
        styles.float,
        { backgroundColor: palette.card, shadowColor: '#000' },
        enter
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${bar.name}`}
        onPress={onOpen}
      >
        <View style={styles.floatPhoto}>
          <Photo
            uri={bar.photoUrl}
            name={bar.name}
            style={StyleSheet.absoluteFill}
            big
          />
          <View style={styles.floatTags}>
            {withGame?.elite ? <Tag>ELITE</Tag> : null}
            {status ? (
              <View style={styles.darkTag}>
                <Text style={[styles.mono10, { color: PAPER }]}>{status}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        hitSlop={10}
        onPress={onClose}
        style={styles.floatClose}
      >
        <Icon name="close" size={16} color={PAPER} />
      </Pressable>
      <View style={styles.floatBody}>
        <View style={styles.floatName}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={[
              styles.anton,
              { fontSize: 30, color: palette.ink, flex: 1 }
            ]}
          >
            {bar.name}
          </Text>
          <Heart on={favorite} onPress={onFavorite} />
        </View>
        <Text style={[text(13, 'Regular', 1.3), { color: palette.muted }]}>
          {bar.neighborhood} · {distance(bar.distanceKm)}
          {rating?.stars
            ? ` · ★ ${rating.stars.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} (${rating.total})`
            : ''}
        </Text>
        {withGame && game ? (
          // `.gm9`: o dia em mono e a hora em Anton.
          <View style={[styles.floatGame, { backgroundColor: palette.mark }]}>
            <View style={{ alignItems: 'center', minWidth: 52 }}>
              <Text
                style={[
                  styles.floatDay,
                  { color: game.live ? palette.live : palette.ink }
                ]}
              >
                {game.live ? 'AO VIVO' : 'HOJE'}
              </Text>
              <Text style={[styles.floatTime, { color: palette.ink }]}>
                {formatTime(game.startsAt)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={[text(14, 'Bold', 1.25), { color: palette.ink }]}
              >
                {game.title}
              </Text>
              {extras.length ? (
                <Text
                  numberOfLines={2}
                  style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
                >
                  {extras.join(' · ')}
                </Text>
              ) : null}
            </View>
            {withGame.going ? (
              <GoingCount count={withGame.going.count} color={palette.ink} />
            ) : null}
          </View>
        ) : (
          <Text style={[text(13, 'Regular', 1.3), { color: palette.muted }]}>
            Sem jogo marcado neste dia.
          </Text>
        )}
        <View style={styles.floatActions}>
          <Pressable
            accessibilityRole="button"
            onPress={onOpen}
            // `.b-ghost`: borda da cor do texto a 22%.
            style={[
              styles.floatButton,
              {
                borderColor: palette.dark
                  ? 'rgba(241,238,230,.22)'
                  : 'rgba(18,18,15,.22)'
              }
            ]}
          >
            <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
              Ver o bar
            </Text>
          </Pressable>
          {withGame?.attendanceEnabled ? (
            <Pressable
              accessibilityRole="button"
              onPress={onGo}
              style={[styles.floatButton, styles.floatGo]}
            >
              <Text style={[text(14.5, 'Bold', 1.2), { color: INK }]}>
                Vou assistir aqui
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Animated.View>
  )
}

/** O jogo na linha da folha: "21:30 · 9 bares até 1,5 km". */
export function sheetLine(
  game: RowGame,
  count: number,
  radiusKm: number
): string {
  const when = game.live
    ? `ao vivo · começou ${formatTime(game.startsAt)}`
    : formatTime(game.startsAt)
  const few = count > 0 && count < 3 ? 'só ' : ''
  return `${when} · ${few}${count} ${count === 1 ? 'bar' : 'bares'} até ${radiusKm.toLocaleString('pt-BR')} km`
}

const styles = StyleSheet.create({
  float: {
    borderRadius: 26,
    overflow: 'hidden',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12
  },
  floatPhoto: { height: 118 },
  floatDay: { fontFamily: MONO, fontSize: 13, marginBottom: -2 },
  floatTime: { fontFamily: 'Anton', fontSize: 22, marginVertical: -5.3 },
  floatTags: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    gap: 6
  },
  darkTag: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(18,18,15,.78)'
  },
  floatClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(18,18,15,.6)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  floatBody: { padding: 14, gap: 8 },
  floatName: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  floatGame: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16
  },
  floatActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  // `.rw9`: 1fr e 1,3fr, 8 entre eles; `.b-sm` de 40.
  floatButton: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  floatGo: {
    flex: 1.3,
    backgroundColor: ACID,
    borderColor: ACID,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  days: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 20,
    padding: 3
  },
  dayPill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 17
  },
  day: { height: 34, paddingHorizontal: 13, justifyContent: 'center' },
  daysStretch: { alignSelf: 'stretch', padding: 4, borderRadius: 999 },
  dayStretch: { flex: 1, alignItems: 'center' },
  gameRow: { gap: 8, paddingHorizontal: 16 },
  game: {
    width: 208,
    height: 64,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'space-between',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  gameKicker: { fontFamily: MONO, fontSize: 11.5, marginVertical: -1.7 },
  gameLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  gameCount: { fontFamily: MONO, fontSize: 12 },
  anton: {
    fontFamily: 'Anton',
    textTransform: 'uppercase',
    letterSpacing: -0.3,
    marginVertical: -8
  },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE },
  screens: { flexDirection: 'row', gap: 6, marginTop: 7 },
  screen: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  mono11: { fontFamily: MONO, fontSize: 11 },
  mono10: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.5 },
  goingNumber: {
    fontFamily: MONO,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    marginVertical: -2
  },
  goingLabel: {
    fontFamily: MONO,
    fontSize: 10.5,
    letterSpacing: 0.63,
    marginVertical: -1.6
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    alignItems: 'center'
  },
  photo: { width: 84, height: 84, borderRadius: 14 },
  tags: { flexDirection: 'row', gap: 6 },
  // `.tag` do redesign: 24 de altura, mono 11 em caixa alta.
  boardTag: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  boardTagDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: INK },
  boardTagText: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.77 },
  liveTag: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3
  },
  cardSide: {
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6
  },
  dash: { flex: 1, borderTopWidth: 1, borderStyle: 'dashed' },
  quiet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1
  },
  quietPhoto: { width: 46, height: 46, borderRadius: 10 },
  widen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: INK
  },
  widenButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  liveCard: {
    backgroundColor: '#1c1c18',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(243,66,29,.5)',
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  // A trama dentro da borda arredondada (o card fica sem `overflow`, pela sombra).
  liveDots: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22.5,
    overflow: 'hidden'
  },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.1)'
  },
  liveCount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveNumber: {
    fontFamily: 'Anton',
    fontSize: 32,
    color: ACID,
    marginVertical: -7.8
  },
  liveLabel: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.57,
    color: '#aaa9a4'
  },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed'
  }
})
