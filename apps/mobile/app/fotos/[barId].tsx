import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptic } from '@/components/motion'
import { type Frame, PhotoViewer } from '@/components/photo-viewer'
import { usePalette } from '@/components/theme'
import { ErrorState, Icon, Text, text, useStatusBar } from '@/components/ui'
import {
  categoryIcon,
  filterPhotos,
  type GalleryFilter,
  galleryChips,
  parseFilter
} from '@/lib/gallery'
import { trpc } from '@/lib/trpc'

/*
 * "O ambiente" (rodada 7, 25c): todas as fotos do bar em tela cheia, só as
 * aprovadas pela revisão. Chips por categoria com a contagem; a grade é um
 * mosaico, a primeira grande e as outras em pares. Trocar o chip troca a
 * grade seco. Tocar numa foto a abre crescendo dela (`PhotoViewer`).
 */

type Measurable = { measureInWindow: View['measureInWindow'] }

export default function Fotos() {
  const { barId, cat } = useLocalSearchParams<{ barId: string; cat?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  const bar = useQuery(trpc.pubs.getById.queryOptions({ id: barId }))
  const photos = bar.data?.photos ?? []
  const [chosen, setChosen] = useState<GalleryFilter | null>(null)
  const filter = chosen ?? parseFilter(photos, cat)
  const shown = filterPhotos(photos, filter)
  const tiles = useRef(new Map<string, Measurable | null>())
  const [open, setOpen] = useState<{
    index: number
    frames: Map<number, Frame>
  } | null>(null)

  // Mede todas as miniaturas antes de abrir: a foto cresce da tocada e, se a
  // pessoa passar para outra, volta para a dela.
  const openAt = async (index: number) => {
    const frames = new Map<number, Frame>()
    await Promise.all(
      shown.map(
        (p, n) =>
          new Promise<void>((done) => {
            const tile = tiles.current.get(p.id)
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

  const tile = (p: (typeof shown)[number], n: number, big = false) => (
    <Pressable
      key={p.id}
      ref={(node) => {
        tiles.current.set(p.id, node)
      }}
      accessibilityRole="imagebutton"
      accessibilityLabel={p.caption ?? `Foto ${n + 1} de ${shown.length}`}
      onPress={() => openAt(n)}
      style={({ pressed }) => [
        big ? styles.big : styles.cell,
        { opacity: pressed ? 0.85 : 1 }
      ]}
    >
      <Image source={{ uri: p.url }} style={styles.fill} resizeMode="cover" />
    </Pressable>
  )
  const [first, ...rest] = shown
  const pairs = Array.from({ length: Math.ceil(rest.length / 2) }, (_, r) =>
    rest.slice(r * 2, r * 2 + 2)
  )

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            onPress={() => router.back()}
            style={[
              styles.round,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Icon name="back" size={20} color={palette.ink} />
          </Pressable>
          {photos.length ? (
            <Text style={[styles.count, { color: palette.ink }]}>
              {photos.length} {photos.length === 1 ? 'foto' : 'fotos'}
            </Text>
          ) : null}
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.ink }]}
        >
          O ambiente
        </Text>

        {bar.isError ? (
          <ErrorState
            error={bar.error}
            title="Não deu para abrir as fotos."
            onRetry={() => bar.refetch()}
            retrying={bar.isFetching}
          />
        ) : !bar.data ? (
          <ActivityIndicator color={palette.muted} style={{ marginTop: 40 }} />
        ) : (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chips}
            >
              {galleryChips(photos).map((chip) => {
                const on = chip.key === filter
                const icon = chip.key === 'all' ? null : categoryIcon(chip.key)
                return (
                  <Pressable
                    key={chip.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${chip.label}, ${chip.count} ${chip.count === 1 ? 'foto' : 'fotos'}`}
                    onPress={() => {
                      if (on) return
                      haptic.select()
                      setChosen(chip.key)
                    }}
                    style={[
                      styles.chip,
                      { backgroundColor: on ? palette.ink : palette.mark }
                    ]}
                  >
                    {icon ? (
                      <Icon
                        name={icon}
                        size={16}
                        color={on ? palette.bg : palette.ink}
                      />
                    ) : null}
                    <Text
                      style={[
                        text(13.5, 'SemiBold', 1.2),
                        { color: on ? palette.bg : palette.ink }
                      ]}
                    >
                      {chip.label} · {chip.count}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <View style={styles.mosaic}>
              {first ? tile(first, 0, true) : null}
              {pairs.map((pair, r) => (
                <View key={pair[0]?.id} style={styles.pair}>
                  {pair.map((p, k) => tile(p, 1 + r * 2 + k))}
                  {pair.length === 1 ? <View style={styles.cell} /> : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      {open ? (
        <PhotoViewer
          photos={shown}
          start={open.index}
          origin={(n) => open.frames.get(n) ?? null}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  count: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  // Anton 40: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 40,
    textTransform: 'uppercase',
    marginVertical: -9.7
  },
  chipScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 7, paddingHorizontal: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18
  },
  mosaic: { gap: 6 },
  pair: { flexDirection: 'row', gap: 6 },
  big: { height: 200, borderRadius: 14, overflow: 'hidden' },
  cell: { flex: 1, height: 120, borderRadius: 14, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' }
})
