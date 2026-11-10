import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { haptic, usePressScale } from '@/components/motion'
import { type Frame, PhotoViewer } from '@/components/photo-viewer'
import { usePalette } from '@/components/theme'
import { ACID, INK, PAPER, Text, text } from '@/components/ui'
import {
  type GalleryFilter,
  type GalleryPhoto,
  galleryChips
} from '@/lib/gallery'

/*
 * Fotos do bar para o torcedor (WEB-462): "O ambiente" na página do bar
 * (25a), a tela cheia (25b, `app/foto/[barId].tsx`) e todas as fotos (25c,
 * `app/fotos/[barId].tsx`). Só as aprovadas pela Onside chegam aqui.
 */

/** Abre a tela cheia numa foto, com o filtro da categoria. */
export function openPhoto(
  router: ReturnType<typeof useRouter>,
  barId: string,
  index: number,
  filter: GalleryFilter = 'all'
) {
  router.push({
    pathname: '/foto/[barId]',
    params: { barId, i: String(index), cat: filter }
  })
}

/** Uma foto que afunda de leve no toque e abre a tela cheia. */
export function PhotoTile({
  uri,
  label,
  onPress,
  style,
  children,
  tileRef
}: {
  uri: string
  label: string
  onPress: () => void
  style?: object
  children?: React.ReactNode
  /** Para medir a miniatura: a foto aberta cresce dela (rodada 7). */
  tileRef?: (node: View | null) => void
}) {
  const press = usePressScale(0.98)
  return (
    <Pressable
      ref={tileRef}
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={style}
    >
      <Animated.View style={[styles.tile, press.style]}>
        <Image source={{ uri }} style={styles.fill} resizeMode="cover" />
        {children}
      </Animated.View>
    </Pressable>
  )
}

/** "Telão 3": chip com a contagem; `on` em acid, como os filtros (25b, 25c). */
export function CountChip({
  label,
  count,
  on = false,
  dark,
  onPress
}: {
  label: string
  count: number
  on?: boolean
  /** Sobre o preto da tela cheia, independente do tema. */
  dark?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePressScale()
  const night = dark ?? palette.dark
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${count} ${count === 1 ? 'foto' : 'fotos'}`}
      onPress={() => {
        if (!on) haptic.select()
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.chip,
          on
            ? {
                backgroundColor: ACID,
                borderColor: ACID,
                shadowColor: INK,
                shadowOffset: { width: 3, height: 3 },
                shadowOpacity: 1,
                shadowRadius: 0
              }
            : {
                backgroundColor: night ? 'rgba(241,238,230,.06)' : palette.card,
                borderColor: night ? 'rgba(241,238,230,.14)' : palette.line
              },
          press.style
        ]}
      >
        <Text
          style={[
            text(14, 'Bold', 1.2),
            { color: on ? INK : night ? PAPER : palette.ink }
          ]}
        >
          {label}
        </Text>
        <Text
          style={[
            text(12, 'Bold', 1.2),
            {
              fontFamily: 'GeistMono-SemiBold',
              color: on
                ? 'rgba(18,18,15,.6)'
                : night
                  ? '#aaa9a4'
                  : palette.muted
            }
          ]}
        >
          {count}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

/** Os chips de categoria numa linha que rola de lado. */
export function ChipRow({
  photos,
  filter,
  onChange,
  dark,
  showAll = true
}: {
  photos: readonly GalleryPhoto[]
  filter?: GalleryFilter
  onChange: (filter: GalleryFilter) => void
  dark?: boolean
  showAll?: boolean
}) {
  const chips = galleryChips(photos).filter((c) => showAll || c.key !== 'all')
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}
    >
      {chips.map((chip) => (
        <CountChip
          key={chip.key}
          label={chip.label}
          count={chip.count}
          on={chip.key === filter}
          dark={dark}
          onPress={() => onChange(chip.key)}
        />
      ))}
    </ScrollView>
  )
}

/**
 * "O ambiente" (25a): uma foto grande e duas pequenas, a última com "+N
 * fotos", "Ver as N" e os chips por categoria.
 */
export function Ambiente({
  barId,
  photos
}: {
  barId: string
  photos: readonly GalleryPhoto[]
}) {
  const router = useRouter()
  const palette = usePalette()
  const tiles = useRef<(View | null)[]>([])
  const [open, setOpen] = useState<{
    index: number
    frames: Map<number, Frame>
  } | null>(null)
  const [first, second, third] = photos
  if (!first) return null
  // A foto cresce da miniatura tocada (rodada 7); passando para uma das
  // outras, fecha para a dela, ou esmaece se ela não está à vista.
  const openAt = async (index: number) => {
    const frames = new Map<number, Frame>()
    await Promise.all(
      tiles.current.map(
        (tile, n) =>
          new Promise<void>((done) => {
            if (!tile) return done()
            tile.measureInWindow((x, y, width, height) => {
              if (width) frames.set(n, { x, y, width, height })
              done()
            })
          })
      )
    )
    setOpen({ index, frames })
  }
  const rest = photos.length - 3
  const all = (filter: GalleryFilter = 'all') =>
    router.push({ pathname: '/fotos/[barId]', params: { barId, cat: filter } })
  const label = (i: number) => `Foto ${i + 1} de ${photos.length} do ambiente`

  return (
    <View style={styles.ambiente}>
      <View style={styles.heading}>
        <Text
          style={{
            fontFamily: 'Anton',
            fontSize: 26,
            marginVertical: -6.3,
            color: palette.ink
          }}
        >
          O AMBIENTE
        </Text>
        {photos.length > 1 ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => all()}
          >
            <Text style={[text(14, 'Bold', 1.4), { color: palette.hot }]}>
              Ver as {photos.length}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View>
        {/* A sombra dura do design: acid no claro, oliva no escuro. */}
        <View
          style={[
            styles.mosaicShadow,
            {
              backgroundColor: palette.dark
                ? 'rgba(201,241,53,.28)'
                : 'rgba(201,241,53,.85)'
            }
          ]}
        />
        <View style={styles.mosaic}>
          <PhotoTile
            uri={first.url}
            label={label(0)}
            onPress={() => openAt(0)}
            tileRef={(node) => {
              tiles.current[0] = node
            }}
            style={{ flex: second ? 2 : 1 }}
          />
          {second ? (
            <View style={styles.mosaicSide}>
              <PhotoTile
                uri={second.url}
                label={label(1)}
                onPress={() => openAt(1)}
                tileRef={(node) => {
                  tiles.current[1] = node
                }}
                style={{ flex: 1 }}
              />
              {third ? (
                <PhotoTile
                  uri={third.url}
                  label={rest > 0 ? `Mais ${rest} fotos` : label(2)}
                  onPress={() => (rest > 0 ? all() : openAt(2))}
                  tileRef={(node) => {
                    tiles.current[2] = node
                  }}
                  style={{ flex: 1 }}
                >
                  {rest > 0 ? (
                    <View style={styles.more}>
                      <Text style={styles.moreCount}>+{rest}</Text>
                      <Text style={[text(12, 'Bold', 1.2), { color: PAPER }]}>
                        fotos
                      </Text>
                    </View>
                  ) : null}
                </PhotoTile>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      <ChipRow photos={photos} onChange={all} showAll={false} />
      {open ? (
        <PhotoViewer
          photos={photos}
          start={open.index}
          origin={(n) => open.frames.get(n) ?? null}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  tile: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2a2a25'
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    height: 38,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderRadius: 6,
    borderWidth: 1
  },
  chipScroll: { marginHorizontal: -16, flexGrow: 0 },
  chipRow: { paddingHorizontal: 16, paddingRight: 20, gap: 8 },
  ambiente: { gap: 12, marginTop: 6 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  mosaicShadow: {
    ...StyleSheet.absoluteFill,
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 8
  },
  mosaic: { flexDirection: 'row', gap: 6, height: 200 },
  mosaicSide: { flex: 1, gap: 6 },
  more: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,18,15,.45)'
  },
  moreCount: {
    fontFamily: 'Anton',
    fontSize: 30,
    color: PAPER,
    marginVertical: -6
  }
})
