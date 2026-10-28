import { groupByCategory } from '@findsports_oficial/db/bar-gallery'
import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChipRow, openPhoto, PhotoTile } from '@/components/gallery'
import { usePalette } from '@/components/theme'
import {
  BackButton,
  ErrorState,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { filterPhotos, type GalleryFilter, parseFilter } from '@/lib/gallery'
import { trpc } from '@/lib/trpc'

/*
 * Todas as fotos do bar (25c, WEB-462): os chips por categoria e a grade
 * agrupada por tipo, só com as que a Onside aprovou. Tocar numa foto abre a
 * tela cheia (25b) com o mesmo filtro.
 */

/** A troca de filtro: a grade nova entra num esmaecer curto. */
const SWAP_IN = FadeIn.duration(160)

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
  const groups = groupByCategory(filterPhotos(photos, filter))
  // O índice da tela cheia é na lista do filtro.
  const shown = groups.flatMap((g) => g.photos)

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.top}>
          <BackButton />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[text(15, 'Regular', 1.3), { color: palette.muted }]}
              numberOfLines={1}
            >
              {bar.data?.name ?? ''}
            </Text>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.ink }]}
            >
              FOTOS
            </Text>
          </View>
        </View>

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
            <ChipRow photos={photos} filter={filter} onChange={setChosen} />
            <Animated.View
              key={filter}
              entering={SWAP_IN}
              style={styles.groups}
            >
              {groups.map((group, g) => (
                <View key={group.id} style={styles.group}>
                  <View style={styles.groupHead}>
                    <Text style={[styles.groupTitle, { color: palette.hot }]}>
                      {group.label.toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        text(13, 'Bold', 1.2),
                        {
                          fontFamily: 'GeistMono-SemiBold',
                          color: palette.muted
                        }
                      ]}
                    >
                      {group.photos.length}
                    </Text>
                  </View>
                  <Grid
                    // O primeiro grupo com três ou mais abre com a grande e
                    // duas empilhadas, como o TELÃO da 25c.
                    feature={g === 0 && group.photos.length >= 3}
                    photos={group.photos}
                    onOpen={(id) =>
                      openPhoto(
                        router,
                        barId,
                        shown.findIndex((p) => p.id === id),
                        filter
                      )
                    }
                  />
                </View>
              ))}
            </Animated.View>
            <Text
              style={[
                text(13.5, 'Regular', 1.4),
                { color: palette.muted, textAlign: 'center', marginTop: 8 }
              ]}
            >
              As fotos são enviadas pelo bar e revisadas pela Onside.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Grid({
  photos,
  feature,
  onOpen
}: {
  photos: readonly { id: string; url: string; caption: string | null }[]
  feature: boolean
  onOpen: (id: string) => void
}) {
  const tile = (p: (typeof photos)[number], style: object) => (
    <PhotoTile
      key={p.id}
      uri={p.url}
      label={p.caption ?? 'Foto do bar'}
      onPress={() => onOpen(p.id)}
      style={style}
    />
  )
  const [first, second, third, ...rest] = photos
  const cells = feature ? rest : photos
  // Linhas de três, com vaga vazia no fim: a última linha não estica.
  const rows = Array.from({ length: Math.ceil(cells.length / 3) }, (_, r) =>
    cells.slice(r * 3, r * 3 + 3)
  )
  return (
    <View style={styles.gridWrap}>
      {feature && first && second && third ? (
        <View style={styles.feature}>
          {tile(first, { flex: 2 })}
          <View style={styles.featureSide}>
            {tile(second, { flex: 1 })}
            {tile(third, { flex: 1 })}
          </View>
        </View>
      ) : null}
      {rows.map((row) => (
        <View key={row[0]?.id} style={styles.row}>
          {[0, 1, 2].map((n) => {
            const p = row[n]
            return p ? (
              tile(p, styles.cell)
            ) : (
              <View key={`vaga-${n}`} style={styles.cell} />
            )
          })}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 18 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: {
    fontFamily: 'Anton',
    fontSize: 40,
    letterSpacing: -0.8,
    marginVertical: -8
  },
  groups: { gap: 22 },
  group: { gap: 10 },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  groupTitle: { fontFamily: 'Anton', fontSize: 26, marginVertical: -6 },
  gridWrap: { gap: 5 },
  feature: { flexDirection: 'row', gap: 5, height: 226 },
  featureSide: { flex: 1, gap: 5 },
  row: { flexDirection: 'row', gap: 5 },
  cell: { flex: 1, aspectRatio: 1.04 }
})
