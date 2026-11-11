import {
  PHOTO_CATEGORIES,
  type PhotoCategory
} from '@findsports_oficial/db/bar-gallery'
import { useMutation, useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { alertFailure, PlanNudge } from '@/components/bar-owner'
import { HardShadow, Photo } from '@/components/explore'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  errorMessage,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { BarPhotoError, pickBarPhoto, uploadBarPhoto } from '@/lib/bar-photo'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Fotos (rodada 10, tela 5, 28b): a capa grande ("assim aparece no mapa e na
 * busca"), o placar (no ar, em revisão, recusadas), a recusada com o motivo
 * e "Trocar", as categorias mostrando o que falta e a grade. Toda foto passa
 * pela revisão da Onside antes de o torcedor ver (WEB-462).
 *
 * "+" escolhe a foto, pergunta a categoria e sobe (em revisão). Segurar uma
 * foto aprovada a põe como capa. Reordenar arrastando fica no painel do site.
 */

const ask = (title: string, options: string[]) =>
  new Promise<number | null>((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [...options, 'Cancelar'],
          cancelButtonIndex: options.length
        },
        (index) => resolve(index === options.length ? null : index)
      )
      return
    }
    Alert.alert(title, undefined, [
      ...options.map((label, index) => ({
        text: label,
        onPress: () => resolve(index)
      })),
      {
        text: 'Cancelar',
        style: 'cancel' as const,
        onPress: () => resolve(null)
      }
    ])
  })

export default function FotosDoBar() {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const owner = useOwnerBar()
  const bar = owner.bar
  const photos = useQuery(trpc.pub.photos.queryOptions())
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const add = useMutation(trpc.pub.addPhoto.mutationOptions())
  const cover = useMutation(
    trpc.pub.setPhotoCover.mutationOptions({
      onError: alertFailure('Não deu para trocar a capa'),
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries()
      }
    })
  )
  const all = photos.data ?? []
  const live = all.filter((p) => p.status === 'approved')
  const review = all.filter((p) => p.status === 'pending')
  const rejected = all.filter((p) => p.status === 'rejected')
  const gallery = owner.plan === 'pro' || owner.plan === 'elite'
  const cell = (width - 32 - 16) / 3

  const addPhoto = async (category?: PhotoCategory) => {
    setProblem(null)
    const which =
      category ??
      (await ask(
        'Que foto é?',
        PHOTO_CATEGORIES.map((c) => c.label)
      ).then((index) => (index === null ? null : PHOTO_CATEGORIES[index]?.id)))
    if (!which) return
    const source = await ask('Foto', ['Escolher da galeria', 'Tirar agora'])
    if (source === null) return
    const asset = await pickBarPhoto(source === 0 ? 'library' : 'camera')
    if (!asset) return
    setBusy(true)
    try {
      const asCover = !bar?.photoUrl
      const url = await uploadBarPhoto(asset, asCover || !gallery)
      await add.mutateAsync({
        url,
        category: which,
        cover: asCover || !gallery
      })
      haptic.success()
      queryClient.invalidateQueries()
    } catch (error) {
      haptic.error()
      setProblem(
        error instanceof BarPhotoError
          ? error.message
          : errorMessage(error, 'Não foi possível enviar a foto.')
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 16,
          gap: 14
        }}
      >
        <View style={styles.top}>
          <BackButton />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Adicionar foto"
            disabled={busy}
            onPress={() => addPhoto()}
            style={[styles.plus, { backgroundColor: palette.card }]}
          >
            <Icon name="plus" size={22} color={palette.ink} />
          </Pressable>
        </View>
        <View>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            MEU ESPAÇO
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: palette.ink }]}
          >
            Fotos
          </Text>
        </View>

        <View>
          <HardShadow color={palette.drop} offset={4} radius={24} />
          <View style={styles.cover}>
            <Photo
              uri={bar?.photoUrl ?? null}
              name={bar?.name ?? ''}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={['transparent', 'rgba(12,12,10,.88)']}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.capa}>
              <Text style={styles.capaText}>CAPA</Text>
            </View>
            <View style={{ padding: 16, gap: 2 }}>
              <Text style={[text(17, 'Bold', 1.25), { color: PAPER }]}>
                Assim aparece no mapa e na busca
              </Text>
              <Text style={[text(14, 'Regular', 1.35), { color: '#c9c7c0' }]}>
                Segure outra foto para trocar.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.counts}>
          <Count value={live.length} label="no ar" />
          <Count value={review.length} label="em revisão" />
          <Count
            value={rejected.length}
            label={rejected.length === 1 ? 'recusada' : 'recusadas'}
          />
        </View>

        {rejected[0] ? (
          <View
            style={[
              styles.rejected,
              { backgroundColor: palette.card, borderColor: palette.line }
            ]}
          >
            <Icon name="eye" size={18} color={palette.muted} />
            <Text
              style={[
                text(14.5, 'Regular', 1.4),
                { color: palette.ink, flex: 1 }
              ]}
            >
              <Text style={text(14.5, 'Bold', 1.4)}>
                {`${rejected.length} ${rejected.length === 1 ? 'recusada' : 'recusadas'}`}
              </Text>
              {rejected[0].rejectionReason
                ? ` · ${rejected[0].rejectionReason}`
                : ''}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => addPhoto(rejected[0]?.category as PhotoCategory)}
            >
              <Text
                style={[
                  text(15, 'Bold', 1.3),
                  { color: palette.ink, textDecorationLine: 'underline' }
                ]}
              >
                Trocar
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Categorias só onde há galeria: no Starter vale a capa. */}
        {gallery ? (
          <>
            <Text
              style={[
                styles.kicker,
                { color: palette.muted, marginBottom: -4 }
              ]}
            >
              POR CATEGORIA · O QUE FALTA
            </Text>
            <View style={styles.categories}>
              {PHOTO_CATEGORIES.map((category) => {
                const n = all.filter(
                  (p) => p.category === category.id && p.status !== 'rejected'
                ).length
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${category.label}: ${n ? `${n} fotos` : 'adicionar'}`}
                    onPress={() => (n ? null : addPhoto(category.id))}
                    style={[
                      styles.category,
                      { width: cell, backgroundColor: palette.card }
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={[text(15, 'Bold', 1.2), { color: palette.ink }]}
                    >
                      {category.label}
                    </Text>
                    <Text
                      style={[
                        styles.categoryMeta,
                        {
                          color: n
                            ? palette.muted
                            : palette.dark
                              ? ACID
                              : '#5b6d0c'
                        }
                      ]}
                    >
                      {n ? `${n} ${n === 1 ? 'foto' : 'fotos'}` : 'adicionar'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </>
        ) : null}

        {problem ? (
          <Text style={[text(14, 'SemiBold', 1.4), { color: palette.live }]}>
            {problem}
          </Text>
        ) : null}
        {busy ? (
          <Text style={[text(14, 'SemiBold', 1.4), { color: palette.muted }]}>
            Enviando a foto…
          </Text>
        ) : null}

        <View style={styles.grid}>
          {all
            .filter((p) => p.status !== 'rejected')
            .map((photo) => (
              <Pressable
                key={photo.id}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Foto ${photo.status === 'pending' ? 'em revisão' : 'no ar'}${photo.status === 'approved' ? '. Segure para usar como capa' : ''}`}
                delayLongPress={350}
                onLongPress={async () => {
                  if (
                    photo.status !== 'approved' ||
                    photo.url === bar?.photoUrl
                  )
                    return
                  haptic.pick()
                  const choice = await ask('Esta foto', ['Usar como capa'])
                  if (choice === 0) cover.mutate({ id: photo.id })
                }}
                style={{ width: cell, height: cell }}
              >
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: photo.url }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
                {photo.status === 'pending' ? (
                  <View style={styles.pending}>
                    <Text style={styles.pendingText}>Em revisão</Text>
                  </View>
                ) : photo.url === bar?.photoUrl ? (
                  <View style={styles.pending}>
                    <Text style={[styles.pendingText, { color: ACID }]}>
                      Capa
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
        </View>
        {!gallery ? (
          <PlanNudge
            to="pro"
            title="Mostre o bar inteiro"
            body="No Starter vale a capa. No Pro e no Elite entram até 12 fotos: telão, área externa, balcão, comida."
          />
        ) : null}
      </ScrollView>
    </View>
  )
}

function Count({ value, label }: { value: number; label: string }) {
  const palette = usePalette()
  return (
    <View
      style={{ flex: 1 }}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      <HardShadow color={palette.drop} offset={4} radius={20} />
      <View style={[styles.count, { backgroundColor: palette.card }]}>
        <Text style={[styles.countValue, { color: palette.ink }]}>{value}</Text>
        <Text style={[styles.countLabel, { color: palette.muted }]}>
          {label}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  plus: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    marginBottom: 8
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 46,
    textTransform: 'uppercase',
    marginVertical: -11
  },
  cover: {
    height: 210,
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: INK
  },
  capa: {
    position: 'absolute',
    top: 14,
    left: 14,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 7,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  capaText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.8,
    color: INK
  },
  counts: { flexDirection: 'row', gap: 10 },
  count: { borderRadius: 20, padding: 14, gap: 2 },
  countValue: { fontFamily: 'Anton', fontSize: 34, marginVertical: -8.2 },
  countLabel: { marginTop: 12, fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  rejected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.5
  },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  category: { borderRadius: 16, padding: 12, gap: 6 },
  categoryMeta: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: '100%', height: '100%', borderRadius: 14 },
  pending: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(18,18,15,.82)',
    justifyContent: 'center'
  },
  pendingText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    color: PAPER
  }
})
