import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChipRow } from '@/components/gallery'
import { Glass } from '@/components/glass'
import { haptic } from '@/components/motion'
import {
  ACID,
  BackButton,
  GlassRound,
  Icon,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import {
  categoryLabel,
  filterPhotos,
  type GalleryFilter,
  parseFilter,
  sentMonth
} from '@/lib/gallery'
import { trpc } from '@/lib/trpc'

/*
 * Foto em tela cheia (25b, WEB-462): no preto, nos dois temas. Arrastar de
 * lado troca a foto; os chips no topo trocam a categoria; embaixo, o tipo, a
 * legenda do bar, quando e quem enviou, e a tira de miniaturas.
 */

const BLACK = '#0b0b09'
const THUMB = 40
/** A legenda nova entra num esmaecer curto quando a foto troca. */
const CAPTION_IN = FadeIn.duration(140)

export default function Foto() {
  const { barId, i, cat } = useLocalSearchParams<{
    barId: string
    i?: string
    cat?: string
  }>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  useStatusBar('light')
  const bar = useQuery(trpc.pubs.getById.queryOptions({ id: barId }))
  const all = bar.data?.photos ?? []
  const [chosen, setChosen] = useState<GalleryFilter | null>(null)
  const filter = chosen ?? parseFilter(all, cat)
  const photos = filterPhotos(all, filter)
  const [index, setIndex] = useState(() => Math.max(0, Number(i) || 0))
  const current = photos[Math.min(index, photos.length - 1)]
  const pager = useRef<FlatList>(null)
  const strip = useRef<ScrollView>(null)

  const goTo = (next: number, animated = true) => {
    pager.current?.scrollToIndex({ index: next, animated })
    setIndex(next)
  }
  const settle = (next: number) => {
    if (next === index) return
    haptic.select()
    setIndex(next)
    // A miniatura da foto aberta fica à vista na tira.
    strip.current?.scrollTo({
      x: Math.max(0, next * (THUMB + 6) - width / 2 + THUMB),
      animated: true
    })
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.top}>
        <BackButton tone="dark" icon="close" />
        {photos.length ? (
          <Glass tone="dark" style={styles.counter}>
            <Text
              accessibilityLabel={`Foto ${index + 1} de ${photos.length}`}
              style={[
                text(16, 'Bold', 1.2),
                { color: PAPER, fontFamily: 'GeistMono-SemiBold' }
              ]}
            >
              {index + 1} / {photos.length}
            </Text>
          </Glass>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar foto"
          hitSlop={8}
          disabled={!current}
          onPress={() => {
            if (current) Share.share({ url: current.url }).catch(() => {})
          }}
        >
          <GlassRound tone="dark">
            <Icon name="share" size={18} color={PAPER} />
          </GlassRound>
        </Pressable>
      </View>

      <View style={styles.chips}>
        <ChipRow
          photos={all}
          filter={filter}
          dark
          onChange={(next) => {
            setChosen(next)
            setIndex(0)
            pager.current?.scrollToOffset({ offset: 0, animated: false })
          }}
        />
      </View>

      <FlatList
        ref={pager}
        key={filter}
        data={photos}
        keyExtractor={(p) => p.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={Math.min(index, Math.max(0, photos.length - 1))}
        getItemLayout={(_, n) => ({
          length: width,
          offset: width * n,
          index: n
        })}
        onMomentumScrollEnd={(e) =>
          settle(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        style={styles.pager}
        renderItem={({ item, index: n }) => (
          <Image
            source={{ uri: item.url }}
            accessibilityLabel={
              item.caption ?? `Foto ${n + 1} de ${photos.length}`
            }
            style={{ width, height: '100%' }}
            resizeMode="cover"
          />
        )}
      />

      {current ? (
        <View style={[styles.info, { paddingBottom: insets.bottom + 12 }]}>
          <Animated.View
            key={current.id}
            entering={CAPTION_IN}
            style={styles.caption}
          >
            <Text style={styles.kind}>
              {categoryLabel(current.category).toUpperCase()}
            </Text>
            {current.caption ? (
              <Text style={[text(21, 'Bold', 1.3), { color: PAPER }]}>
                {current.caption}
              </Text>
            ) : null}
            <Text style={[text(15, 'Regular', 1.4), { color: '#8f8e88' }]}>
              Enviada pelo {bar.data?.name} · {sentMonth(current.createdAt)}
            </Text>
          </Animated.View>
          {photos.length > 1 ? (
            <ScrollView
              ref={strip}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
            >
              {photos.map((p, n) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver a foto ${n + 1}`}
                  accessibilityState={{ selected: n === index }}
                  onPress={() => goTo(n)}
                >
                  <Image
                    source={{ uri: p.url }}
                    style={[
                      styles.thumb,
                      n === index ? styles.thumbOn : styles.thumbOff
                    ]}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BLACK },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  counter: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center'
  },
  chips: { paddingHorizontal: 16, marginTop: 14, marginBottom: 18 },
  pager: { flex: 1 },
  info: { paddingHorizontal: 16, paddingTop: 22, gap: 18 },
  caption: { gap: 6 },
  kind: {
    fontFamily: 'GeistMono-Bold',
    fontSize: 14,
    letterSpacing: 0.6,
    color: ACID
  },
  strip: {
    gap: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    minWidth: '100%',
    justifyContent: 'center'
  },
  thumb: { width: THUMB, height: THUMB, borderRadius: 5 },
  thumbOn: {
    width: THUMB + 8,
    height: THUMB + 8,
    borderWidth: 2,
    borderColor: ACID
  },
  thumbOff: { opacity: 0.55 }
})
