import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { Glass } from '@/components/glass'
import { SWAP } from '@/components/motion'
import {
  OnboardingTop,
  type Radius,
  RadiusTile,
  useOnboarding
} from '@/components/onboarding'
import {
  ACID,
  Field,
  INK,
  MUTED,
  PillButton,
  Screen,
  Title,
  text
} from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * 4l, "Distância": cidade (opcional, da lista) e raio. O círculo no mapa
 * cresce com o raio, e a contagem é real: bares no ar com jogo hoje no raio
 * em volta do centro da cidade (`pubs.countTodayNear`).
 */

const RADII: Radius[] = [1, 3, 5, 10]
// Diâmetro do círculo no mapa de 170 de altura; 10 km passa da borda.
const CIRCLE: Record<Radius, number> = { 1: 64, 3: 150, 5: 210, 10: 330 }
// Mudar de tamanho na tela é movimento sobre a tela: ease-in-out.
const MORPH = Easing.bezier(0.77, 0, 0.175, 1)

/** O texto digitado, só depois de 200 ms parado. */
function useDebounced(value: string) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), 200)
    return () => clearTimeout(timer)
  }, [value])
  return settled
}

export default function Distance() {
  const router = useRouter()
  const { choices, set } = useOnboarding()
  const label = (city: { name: string; uf: string }) =>
    `${city.name}, ${city.uf}`
  const [typed, setTyped] = useState(choices.city ? label(choices.city) : '')
  const query = useDebounced(typed.trim())
  const picking = !choices.city || typed !== label(choices.city)

  const suggestions = useQuery({
    ...trpc.pubs.searchCities.queryOptions({ query }),
    enabled: picking && query.length >= 2
  })
  const count = useQuery({
    ...trpc.pubs.countTodayNear.queryOptions({
      lat: choices.city?.lat ?? 0,
      lng: choices.city?.lng ?? 0,
      radiusKm: choices.radius
    }),
    enabled: !!choices.city
  })

  // Tamanho, e não escala: a escala engrossaria a borda junto. O círculo é
  // absoluto e sem filhos, então mudar o tamanho não refaz o layout de mais
  // ninguém.
  const size = useSharedValue(CIRCLE[choices.radius])
  useEffect(() => {
    size.value = withTiming(CIRCLE[choices.radius], {
      duration: 320,
      easing: MORPH
    })
  }, [choices.radius, size])
  const circle = useAnimatedStyle(() => ({
    width: size.value,
    height: size.value,
    borderRadius: size.value / 2
  }))

  // Texto que não é uma cidade da lista não vale: segue sem cidade.
  const pending = typed.trim().length > 0 && picking

  const next = async () => {
    const { status } = await Location.getForegroundPermissionsAsync()
    router.push(
      status === 'undetermined' ? '/onboarding/location' : '/onboarding/review'
    )
  }

  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <PillButton label="Continuar" disabled={pending} onPress={next} />
      }
    >
      <OnboardingTop step={4} />
      <View style={{ marginTop: 8 }}>
        <Title lines={[['Quão longe você topa ir?']]} size={36} />
      </View>
      <Text
        style={[text(15, 'Regular', 1.45), { color: MUTED, marginTop: -4 }]}
      >
        Sua cidade e a distância definem quais bares aparecem pra você.
      </Text>
      <View style={{ gap: 6 }}>
        <Field
          label="Sua cidade"
          icon="pin"
          placeholder="Ex: São Paulo"
          autoCorrect={false}
          value={typed}
          onChangeText={(value) => {
            setTyped(value)
            if (choices.city && value !== label(choices.city))
              set({ city: null })
          }}
        />
        {picking && (suggestions.data?.length ?? 0) > 0 ? (
          <Animated.View entering={SWAP} style={styles.suggestions}>
            {suggestions.data?.map((city) => (
              <Pressable
                key={`${city.name}-${city.uf}`}
                accessibilityRole="button"
                onPress={() => {
                  set({ city })
                  setTyped(label(city))
                }}
                style={({ pressed }) => [
                  styles.suggestion,
                  pressed && { backgroundColor: 'rgba(18,18,15,.05)' }
                ]}
              >
                <Text style={text(15, 'SemiBold')}>{city.name}</Text>
                <Text style={[text(13), { color: MUTED }]}>{city.uf}</Text>
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
        <Text style={[text(12.5), { color: MUTED }]}>
          {pending
            ? 'Escolha a cidade na lista, ou apague para seguir sem ela.'
            : 'Opcional. Sem a localização do celular, a busca parte do centro dela.'}
        </Text>
      </View>
      <View style={styles.mapWrap}>
        <View style={styles.mapShadow} />
        <View style={styles.map}>
          <Image
            source={require('../../assets/images/intro/map.jpg')}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
          <Animated.View style={[styles.circle, circle]} />
          <View style={styles.you} />
          {choices.city && count.data ? (
            <View style={styles.count}>
              <Glass tone="light" style={styles.countGlass}>
                <Animated.Text
                  key={count.data.bars}
                  entering={SWAP}
                  style={text(13.5, 'SemiBold')}
                >
                  <Text style={text(13.5, 'Bold')}>
                    {count.data.bars} {count.data.bars === 1 ? 'bar' : 'bares'}
                  </Text>{' '}
                  com jogo hoje
                </Animated.Text>
              </Glass>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {RADII.map((km) => (
          <RadiusTile
            key={km}
            km={km}
            selected={choices.radius === km}
            onPress={() => set({ radius: km })}
          />
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  suggestions: {
    borderRadius: 5,
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.14)',
    overflow: 'hidden'
  },
  suggestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  mapWrap: { height: 170 },
  mapShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6,
    backgroundColor: 'rgba(18,18,15,.09)'
  },
  map: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)'
  },
  circle: {
    position: 'absolute',
    backgroundColor: 'rgba(201,241,53,.22)',
    borderWidth: 2,
    borderColor: INK
  },
  you: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: ACID
  },
  count: { position: 'absolute', right: 10, bottom: 10 },
  countGlass: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 19,
    justifyContent: 'center'
  }
})
