import { forwardRef, useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  FadeIn,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming
} from 'react-native-reanimated'
import { dayLabel, HardShadow, Photo, Tag } from '@/components/explore'
import { EASE, haptic, ScalePress, usePressScale } from '@/components/motion'
import { ACID, Icon, INK, text } from '@/components/ui'
import { citationPieces } from '@/lib/ai-chat'
import type { ChatBar, FilterChip, Source } from '@/lib/ai-events'
import { formatKm, formatTime } from '@/lib/explore'
import { AiIcon } from './icons'
import type { AiPalette } from './theme'
import { MONO } from './tool'

/*
 * Resposta e citações (Response · InlineCitation): texto direto, sem balão,
 * com negrito e o número acid que liga o nome ao card do bar (tocar rola até
 * ele). O card citado é o do Explorar com o número no canto. Fontes
 * (Sources): fechado por padrão. Filtros entendidos: o que a IA entendeu,
 * em chips com ×; tirar um refaz a busca.
 */

export function AnswerText({
  text: value,
  count,
  palette,
  onCite
}: {
  text: string
  /** Quantos bares a resposta trouxe (citação fora sai). */
  count: number
  palette: AiPalette
  onCite?: (n: number) => void
}) {
  return (
    <Text style={[text(15.5, 'Regular', 1.5), { color: palette.ink }]}>
      {citationPieces(value, count).map((piece, i) =>
        'cite' in piece ? (
          <Pressable
            // biome-ignore lint/suspicious/noArrayIndexKey: pedaços fixos do texto
            key={i}
            accessibilityRole="link"
            accessibilityLabel={`Ver o bar ${piece.cite}`}
            hitSlop={8}
            disabled={!onCite}
            onPress={() => onCite?.(piece.cite)}
            style={styles.inline}
          >
            <Cite n={piece.cite} />
          </Pressable>
        ) : (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: pedaços fixos do texto
            key={i}
            style={piece.bold ? { fontFamily: 'Archivo-Bold' } : null}
          >
            {piece.text}
          </Text>
        )
      )}
    </Text>
  )
}

/** O número acid (18 pt, mono). Dentro do texto, sobe 2 pt. */
export function Cite({ n, ring }: { n: number; ring?: string }) {
  return (
    <View
      style={[
        styles.cite,
        ring
          ? { borderWidth: 2, borderColor: ring, height: 22, minWidth: 22 }
          : null
      ]}
    >
      <Text style={styles.citeText}>{n}</Text>
    </View>
  )
}

/** O card do Explorar com o número da citação no canto. */
export const CitedBar = forwardRef<
  View,
  {
    bar: ChatBar
    n: number | null
    now: number
    palette: AiPalette
    onPress: () => void
    /** Pisca quando a citação no texto leva até ele. */
    flash?: number
  }
>(function CitedBar({ bar, n, now, palette, onPress, flash }, ref) {
  const glow = useSharedValue(0)
  useEffect(() => {
    if (!flash) return
    // Acende quando a rolagem chega (≈ 280 ms) e apaga devagar. Vale com
    // menos movimento: é a única pista de qual card a citação abriu.
    glow.set(
      withSequence(
        withDelay(
          280,
          withTiming(1, { duration: 120, reduceMotion: ReduceMotion.Never })
        ),
        withTiming(0, {
          duration: 500,
          easing: EASE,
          reduceMotion: ReduceMotion.Never
        })
      )
    )
  }, [flash, glow])
  const ring = useAnimatedStyle(() => ({ opacity: glow.get() }))
  const press = usePressScale(0.985)
  const game = bar.game
  return (
    <View ref={ref} collapsable={false}>
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
            <Photo uri={bar.photoUrl} name={bar.name} style={styles.photo} />
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
                {game ? game.title : 'Sem eventos programados'}
              </Text>
              <View style={styles.meta}>
                {bar.distanceKm !== null ? (
                  <View style={styles.km}>
                    <Icon name="pin" size={13} color={palette.ink} />
                    <Text
                      style={[text(12, 'Bold', 1.2), { color: palette.ink }]}
                    >
                      {formatKm(bar.distanceKm)}
                    </Text>
                  </View>
                ) : null}
                <Text
                  style={[
                    text(12, 'Regular', 1.2),
                    { color: palette.muted, flexShrink: 1 }
                  ]}
                  numberOfLines={1}
                >
                  {bar.neighborhood}
                </Text>
                {bar.ratingPercent !== null ? (
                  <Tag>{bar.ratingPercent}%</Tag>
                ) : null}
              </View>
            </View>
            {game ? (
              <View style={styles.when}>
                <Text
                  style={[
                    styles.time,
                    { color: game.live ? palette.live : palette.ink }
                  ]}
                >
                  {game.live ? 'Agora' : formatTime(game.startsAt)}
                </Text>
                <Text
                  style={[text(11.5, 'Regular', 1.2), { color: palette.muted }]}
                >
                  {game.live ? 'Ao vivo' : dayLabel(game.startsAt, now)}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
      <Animated.View pointerEvents="none" style={[styles.flash, ring]} />
      {n ? (
        <View style={styles.corner} pointerEvents="none">
          <Cite n={n} ring={palette.citeRing} />
        </View>
      ) : null}
    </View>
  )
})

const OPEN_IN = FadeIn.duration(180)
const OPEN_OUT = FadeOut.duration(120)
const RESIZE = LinearTransition.duration(220).easing(EASE)

/** "Usei 3 bares e a agenda de hoje": as fotos; aberto, a lista. */
export function Sources({
  label,
  sources,
  numberOf,
  palette,
  onOpen,
  initiallyOpen = false
}: {
  label: string
  sources: Source[]
  /** O número da citação do bar, se ele foi citado. */
  numberOf: (barId: string) => number | null
  palette: AiPalette
  onOpen: (source: Source) => void
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const ring = palette.dark ? 'rgba(241,238,230,.14)' : palette.outline
  return (
    <Animated.View
      layout={RESIZE}
      style={[styles.sources, { borderColor: ring }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptic.select()
          setOpen((v) => !v)
        }}
        style={open ? styles.sourcesHeadOpen : styles.sourcesHead}
      >
        {open ? null : (
          <View style={styles.faces}>
            {sources.slice(0, 3).map((s, i) => (
              <Face
                key={s.barId}
                uri={s.photoUrl}
                size={24}
                style={{
                  marginLeft: i ? -7 : 0,
                  borderWidth: 2,
                  borderColor: palette.sheet
                }}
                palette={palette}
              />
            ))}
          </View>
        )}
        <Text
          style={[
            text(12.5, 'Regular', 1.4),
            { flex: 1, color: palette.muted }
          ]}
        >
          {label}
        </Text>
        <Chevron open={open} color={palette.muted} />
      </Pressable>
      {open ? (
        <Animated.View entering={OPEN_IN} exiting={OPEN_OUT}>
          {sources.map((s, i) => {
            const n = numberOf(s.barId)
            return (
              <ScalePress
                key={s.barId}
                to={0.98}
                accessibilityRole="button"
                accessibilityLabel={s.name}
                onPress={() => onOpen(s)}
                style={[
                  styles.source,
                  i ? { borderTopWidth: 1, borderTopColor: palette.line } : null
                ]}
              >
                {n ? <Cite n={n} /> : null}
                <Face uri={s.photoUrl} size={28} palette={palette} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[text(13.5, 'Bold', 1.3), { color: palette.ink }]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                  <Text
                    style={[
                      text(11.5, 'Regular', 1.3),
                      { color: palette.muted }
                    ]}
                    numberOfLines={1}
                  >
                    {s.why}
                  </Text>
                </View>
                <Icon name="next" size={12} color={palette.muted} />
              </ScalePress>
            )
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  )
}

/** A seta de abrir e fechar, girando como a do raciocínio. */
export function Chevron({ open, color }: { open: boolean; color: string }) {
  const turn = useSharedValue(open ? 180 : 0)
  useEffect(() => {
    turn.set(withTiming(open ? 180 : 0, { duration: 200, easing: EASE }))
  }, [open, turn])
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.get()}deg` }]
  }))
  return (
    <Animated.View style={style}>
      <AiIcon name="chevron" size={13} color={color} />
    </Animated.View>
  )
}

function Face({
  uri,
  size,
  style,
  palette
}: {
  uri: string | null
  size: number
  style?: object
  palette: AiPalette
}) {
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: '#2a2a25'
  }
  return uri ? (
    <Image source={{ uri }} style={[box, style]} />
  ) : (
    <View style={[box, { backgroundColor: palette.mark }, style]} />
  )
}

const CHIP_ICON = {
  tv: 'tv',
  team: 'tv',
  cal: 'calendar',
  sun: 'outdoor',
  pin: 'pin',
  sport: 'fan',
  beer: 'bar'
} as const

// O chip sai encolhendo, só por transform (no campo ele está sobre o vidro).
const CHIP_OUT: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ scale: 1 }] },
    animations: {
      transform: [{ scale: withTiming(0.6, { duration: 120, easing: EASE }) }]
    }
  }
}
const CHIP_MOVE = LinearTransition.duration(200).easing(EASE)

/** Chip com ×: os filtros entendidos e o contexto do campo. */
export function XChip({
  label,
  icon,
  palette,
  onRemove
}: {
  label: string
  icon: FilterChip['icon']
  palette: AiPalette
  /** Sem `onRemove`, o chip não tem ×. */
  onRemove?: () => void
}) {
  return (
    <Animated.View exiting={CHIP_OUT} layout={CHIP_MOVE}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={onRemove ? `Tirar ${label}` : label}
        disabled={!onRemove}
        hitSlop={4}
        onPress={() => {
          haptic.select()
          onRemove?.()
        }}
        style={[
          styles.chip,
          { backgroundColor: palette.soft },
          onRemove ? null : { paddingRight: 9 }
        ]}
      >
        <Icon
          name={CHIP_ICON[icon]}
          size={13}
          color={palette.ink}
          accent={palette.accent}
        />
        <Text style={[text(12.5, 'SemiBold', 1.2), { color: palette.ink }]}>
          {label}
        </Text>
        {onRemove ? (
          <View style={[styles.x, { backgroundColor: palette.softer }]}>
            <Icon name="close" size={8} color={palette.muted} />
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}

/** "Entendi assim · toque para mudar" e os chips. */
export function FilterChips({
  chips,
  palette,
  onRemove
}: {
  chips: FilterChip[]
  palette: AiPalette
  onRemove?: (chip: FilterChip) => void
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={[text(12.5, 'SemiBold', 1.4), { color: palette.muted }]}>
        {onRemove ? 'Entendi assim · toque para mudar' : 'Entendi assim'}
      </Text>
      <View style={styles.chips}>
        {chips.map((chip) => (
          <XChip
            key={chip.key}
            label={chip.label}
            icon={chip.icon}
            palette={palette}
            onRemove={onRemove ? () => onRemove(chip) : undefined}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cite: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // No texto, o número sobe 2 pt da linha de base (vertical-align do design).
  inline: { marginHorizontal: 2, transform: [{ translateY: 1 }] },
  citeText: { fontFamily: MONO, fontSize: 10.5, lineHeight: 12, color: INK },
  corner: { position: 'absolute', left: -8, top: -8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1
  },
  photo: { width: 62, height: 62, borderRadius: 3 },
  nameRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  meta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  km: { flexDirection: 'row', gap: 2, alignItems: 'center' },
  when: { alignItems: 'flex-end', paddingRight: 4, gap: 3 },
  time: { fontFamily: 'Anton', fontSize: 24, marginVertical: -7 },
  flash: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: ACID
  },
  sources: { borderRadius: 7, borderWidth: 1, overflow: 'hidden' },
  sourcesHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 11
  },
  sourcesHeadOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 9,
    paddingBottom: 3,
    paddingHorizontal: 11
  },
  faces: { flexDirection: 'row' },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    marginHorizontal: 11
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    height: 28,
    paddingLeft: 9,
    paddingRight: 6,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  x: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
