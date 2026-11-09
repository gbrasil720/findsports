import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { MapDrop, MeDot, QuietDot, RadiusCircle } from '@/components/explore'
import { DayRow } from '@/components/explore-board'
import { useExploreState } from '@/components/explore-state'
import { haptic } from '@/components/motion'
import { AcidButton, NoteStrong, ObPage, ObTitle } from '@/components/ob-frame'
import {
  OnboardingCard,
  type Radius,
  useOnboarding
} from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, TextInput, text } from '@/components/ui'
import { SAO_PAULO } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * 4 · Onde, depois do pedido (rodada 2 do redesign, tela 4b):
 * - sem a localização, "Qual cidade?": a busca de cidades com quantos bares
 *   têm jogo hoje em cada uma, e "Continuar com São Paulo";
 * - com ela (ou com a cidade escolhida), o raio: o mapa com as gotas de
 *   verdade, o círculo tracejado e o seu ponto, e o seletor de distância. A
 *   nota conta os bares com jogo hoje no raio (`pubs.countTodayNear`).
 * A carteirinha acende a Base na cidade e o Raio no raio.
 */

const RADII: Radius[] = [1, 3, 5, 10]
const MAP_HEIGHT = 220
/** O diâmetro do círculo na tela; o zoom sai dele. */
const CIRCLE: Record<Radius, number> = { 1: 110, 3: 190, 5: 230, 10: 300 }

/** O texto digitado, só depois de 200 ms parado. */
function useDebounced(value: string) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), 200)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

type City = { name: string; uf: string; lat: number; lng: number }

/** Destaca no nome o que foi digitado ("São" em "São Paulo"). */
function Marked({
  name,
  typed,
  on
}: {
  name: string
  typed: string
  on: boolean
}) {
  // Sem acento dos dois lados: "sao" acende "São". Tirar o acento não muda
  // o tamanho, então a posição vale no nome original.
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
  const at = fold(name).indexOf(fold(typed))
  if (!typed || at < 0) return <>{name}</>
  return (
    <>
      {name.slice(0, at)}
      <Text style={[styles.mark, on && { backgroundColor: ACID }]}>
        {name.slice(at, at + typed.length)}
      </Text>
      {name.slice(at + typed.length)}
    </>
  )
}

function CityStep({ onPick }: { onPick: (city: City) => void }) {
  const palette = usePalette()
  const { choices, set } = useOnboarding()
  const [typed, setTyped] = useState(choices.city?.name ?? '')
  const query = useDebounced(typed.trim())
  const found = useQuery({
    ...trpc.pubs.searchCities.queryOptions({ query }),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData
  })
  const cities = (found.data ?? []).slice(0, 4)
  const counts = useQueries({
    queries: cities.map((city) =>
      trpc.pubs.countTodayNear.queryOptions({
        lat: city.lat,
        lng: city.lng,
        radiusKm: 10
      })
    )
  })
  const chosen = choices.city ?? cities[0] ?? null
  const chosenCount = counts[cities.findIndex((c) => c === chosen)]?.data?.bars
  return (
    <ObPage
      step={4}
      onSkip={() => chosen && onPick(chosen)}
      note={
        chosen ? (
          <>
            O mapa abre no centro da cidade
            {chosenCount !== undefined ? (
              <>
                {' · '}
                <NoteStrong>
                  {chosenCount} {chosenCount === 1 ? 'bar' : 'bares'}
                </NoteStrong>{' '}
                com jogo hoje
              </>
            ) : null}
          </>
        ) : undefined
      }
      cta={
        <AcidButton
          label={chosen ? `Continuar com ${chosen.name}` : 'Continuar'}
          disabled={!chosen}
          onPress={() => chosen && onPick(chosen)}
        />
      }
    >
      <OnboardingCard lit="base" base baseName={chosen?.name} />
      <ObTitle plain="Qual" hot="cidade?" size={32} />
      <View
        style={[
          styles.field,
          { backgroundColor: palette.card, borderColor: palette.ink }
        ]}
      >
        <Icon name="search" size={20} color={palette.muted} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Sua cidade"
          placeholderTextColor={palette.muted}
          autoCorrect={false}
          style={[styles.input, { color: palette.ink }]}
        />
        {typed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apagar"
            hitSlop={10}
            onPress={() => setTyped('')}
          >
            <Icon name="close" size={18} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
      {cities.length ? (
        <View
          style={[
            styles.cities,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          {cities.map((city, index) => {
            const on =
              chosen === city ||
              (choices.city?.name === city.name && choices.city?.uf === city.uf)
            const bars = counts[index]?.data?.bars
            const fg = on ? palette.bg : palette.ink
            return (
              <Pressable
                key={`${city.name}-${city.uf}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select()
                  set({ city })
                }}
                style={[
                  styles.city,
                  on && { backgroundColor: palette.ink, borderRadius: 16 },
                  index > 0 &&
                    !on && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: palette.line
                    }
                ]}
              >
                <Icon name="pin" size={20} color={fg} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={[text(15, 'SemiBold', 1.25), { color: fg }]}
                  >
                    <Marked name={city.name} typed={query} on={on} />
                  </Text>
                  <Text
                    style={[
                      text(12.5, 'Regular', 1.3),
                      { color: fg, opacity: 0.75 }
                    ]}
                  >
                    {city.uf} ·{' '}
                    {city.bars
                      ? `${city.bars} ${city.bars === 1 ? 'bar' : 'bares'}`
                      : '0 bares ainda'}
                  </Text>
                </View>
                {bars === undefined ? null : bars ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.cityCount,
                        { color: on ? fg : palette.ink }
                      ]}
                    >
                      {bars}
                    </Text>
                    <Text
                      style={[styles.cityLabel, { color: fg, opacity: 0.75 }]}
                    >
                      {index === 0 ? 'com jogo hoje' : 'hoje'}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.cityLabel,
                      { color: fg, opacity: 0.6, textAlign: 'right' }
                    ]}
                  >
                    {'avisamos\nquando chegar'}
                  </Text>
                )}
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </ObPage>
  )
}

function RadiusStep({ center }: { center: { lat: number; lng: number } }) {
  const router = useRouter()
  const palette = usePalette()
  const { choices, set } = useOnboarding()
  const { volta } = useLocalSearchParams<{ volta?: string }>()
  const [day] = useState(() => brasiliaDay(Date.now()))
  const count = useQuery({
    ...trpc.pubs.countTodayNear.queryOptions({
      ...center,
      radiusKm: choices.radius
    }),
    placeholderData: keepPreviousData
  })
  const board = useQuery({
    ...trpc.pubs.gameBoard.queryOptions({
      ...center,
      radiusKm: choices.radius,
      day
    }),
    placeholderData: keepPreviousData
  })
  const quiet = useQuery({
    ...trpc.pubs.barsWithoutGame.queryOptions({
      ...center,
      radiusKm: choices.radius,
      day
    }),
    enabled: count.data?.bars === 0
  })
  const bars = [
    ...new Map(
      (board.data?.games ?? []).flatMap((game) =>
        game.bars.map((bar) => [bar.barId, bar] as const)
      )
    ).values()
  ]
  const span =
    ((choices.radius * 2) / 111) * (MAP_HEIGHT / CIRCLE[choices.radius])
  const n = count.data?.bars
  const quietCount = quiet.data?.length ?? 0
  const next = () => (volta ? router.back() : router.push('/onboarding/review'))
  return (
    <ObPage
      step={4}
      onSkip={volta ? undefined : next}
      note={
        n === undefined ? undefined : n ? (
          <>
            <NoteStrong>
              {n} {n === 1 ? 'bar' : 'bares'}
            </NoteStrong>{' '}
            com jogo hoje no raio
          </>
        ) : quietCount ? (
          <>
            <NoteStrong>
              {quietCount} {quietCount === 1 ? 'bar' : 'bares'}
            </NoteStrong>{' '}
            no raio · nenhum com jogo marcado hoje
          </>
        ) : (
          `Nenhum bar até ${choices.radius} km ainda`
        )
      }
      cta={<AcidButton label="Continuar" onPress={next} />}
    >
      <OnboardingCard lit="radius" radius base />
      <View style={[styles.map, { backgroundColor: palette.mark }]}>
        <MapView
          style={StyleSheet.absoluteFill}
          region={{
            latitude: center.lat,
            longitude: center.lng,
            latitudeDelta: span,
            longitudeDelta: span
          }}
          mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
          customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
          userInterfaceStyle={palette.dark ? 'dark' : 'light'}
          showsPointsOfInterests={false}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          pointerEvents="none"
        >
          <RadiusCircle
            center={{ latitude: center.lat, longitude: center.lng }}
            km={choices.radius}
            dark={palette.dark}
          />
          {bars.slice(0, 12).map((bar) => (
            <Marker
              key={bar.barId}
              coordinate={{ latitude: bar.latitude, longitude: bar.longitude }}
              tracksViewChanges={false}
            >
              <MapDrop live={false} elite={bar.elite} dark={palette.dark} />
            </Marker>
          ))}
          {(quiet.data ?? []).slice(0, 12).map((bar) => (
            <Marker
              key={bar.barId}
              coordinate={{ latitude: bar.latitude, longitude: bar.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <QuietDot dark={palette.dark} />
            </Marker>
          ))}
        </MapView>
        <View pointerEvents="none" style={styles.me}>
          <MeDot />
        </View>
      </View>
      <DayRow
        days={RADII.map((km) => ({ day: String(km), label: `${km} km` }))}
        value={String(choices.radius)}
        onChange={(km) => set({ radius: Number(km) as Radius })}
        stretch
      />
    </ObPage>
  )
}

export default function Distance() {
  const { choices } = useOnboarding()
  const { device } = useExploreState()
  const { cidade } = useLocalSearchParams<{ cidade?: string }>()
  // Sem a localização, a cidade primeiro; escolhida, o raio dela.
  const [confirmed, setConfirmed] = useState(!cidade && Boolean(choices.city))
  if (device) return <RadiusStep center={device} />
  if (!confirmed || !choices.city)
    return (
      <CityStep
        onPick={() => {
          haptic.select()
          setConfirmed(true)
        }}
      />
    )
  return <RadiusStep center={choices.city ?? SAO_PAULO} />
}

const styles = StyleSheet.create({
  field: {
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14
  },
  input: { flex: 1, fontFamily: 'Archivo-Regular', fontSize: 16 },
  cities: {
    borderRadius: 20,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  city: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 52
  },
  mark: { backgroundColor: ACID, color: INK },
  cityCount: { fontFamily: 'Anton', fontSize: 22, marginVertical: -5 },
  cityLabel: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  map: { height: MAP_HEIGHT, borderRadius: 24, overflow: 'hidden' },
  me: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
