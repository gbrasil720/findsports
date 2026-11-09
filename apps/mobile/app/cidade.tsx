import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import MapView from 'react-native-maps'
import Animated from 'react-native-reanimated'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { haptic, SWAP } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  BackButton,
  FG,
  FIELD,
  Field,
  Icon,
  LINE_STRONG,
  LIVE,
  Screen,
  SUB,
  Text,
  Title,
  text,
  themed,
  useAccountSheet
} from '@/components/ui'
import { useFan } from '@/lib/account'
import { leaveFirstOpen } from '@/lib/first-open'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * A cidade das Configurações (11h, "Cidade"): de onde a busca parte quando o
 * celular não dá a localização. A mesma lista do onboarding (4l). Sem conta
 * ("escolher a cidade" de O jogo de hoje, `?de=hoje`), fica no aparelho.
 */

export default function City() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 200)
    return () => clearTimeout(timer)
  }, [typed])
  const fan = useFan()
  const { localCity, setLocalCity } = useExploreState()
  const { de } = useLocalSearchParams<{ de?: string }>()
  const mine = useQuery({ ...trpc.pubs.getMyCity.queryOptions(), enabled: fan })
  const current = fan ? mine.data : localCity
  const suggestions = useQuery({
    ...trpc.pubs.searchCities.queryOptions({ query }),
    enabled: query.length >= 2
  })
  // Na folha (tablet), tocar escolhe e "Salvar" grava, como no design; no
  // celular o toque já grava.
  const asSheet = useAccountSheet()
  type City = { name: string; uf: string; lat: number; lng: number }
  const [chosen, setChosen] = useState<City | null>(null)
  const palette = usePalette()
  // O mapa do design (a08v): o centro da cidade marcada, senão a primeira
  // sugestão. A busca de cidades já traz o centro de cada uma.
  // Só fora do celular (a08): no celular a tela é a aprovada, sem mapa.
  const shown = asSheet ? (chosen ?? suggestions.data?.[0] ?? null) : null
  // Destaca na lista o que a pessoa digitou ("Campi" em "Campinas").
  const typedNorm = asSheet ? query.toLocaleLowerCase('pt-BR') : ''
  const save = useMutation(
    trpc.pubs.updateMyCity.mutationOptions({
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getMyCity.queryKey()
        })
        router.back()
      }
    })
  )
  const pick = (city: City) => {
    if (fan) return save.mutate(city)
    haptic.success()
    setLocalCity(city)
    if (de === 'hoje') leaveFirstOpen()
    else router.back()
  }

  return (
    <Screen
      gap={14}
      padding={18}
      sheet={{
        onDone: chosen ? () => pick(chosen) : undefined,
        busy: save.isPending
      }}
    >
      <BackButton />
      <Title lines={[['Sua cidade']]} size={36} />
      <Text style={[text(15, 'Regular', 1.45), { color: SUB, marginTop: -4 }]}>
        {current ? `Hoje é ${current.name}, ${current.uf}. ` : ''}
        Sem a localização do celular, a busca parte do centro dela.
      </Text>
      <Field
        label="Cidade"
        icon="pin"
        placeholder="Ex: São Paulo"
        autoCorrect={false}
        autoFocus
        value={typed}
        onChangeText={setTyped}
      />
      {(suggestions.data?.length ?? 0) > 0 ? (
        <Animated.View entering={SWAP} style={styles.suggestions}>
          {suggestions.data?.slice(0, asSheet ? 4 : undefined).map((city) => (
            <Pressable
              key={`${city.name}-${city.uf}`}
              accessibilityRole="button"
              disabled={save.isPending}
              accessibilityState={{ selected: chosen === city }}
              onPress={() => (asSheet ? setChosen(city) : pick(city))}
              style={({ pressed }) => [
                styles.suggestion,
                pressed && { backgroundColor: PRESSED },
                asSheet &&
                  (chosen ?? suggestions.data?.[0]) === city && {
                    backgroundColor: CHOSEN
                  }
              ]}
            >
              <Highlighted name={city.name} typed={typedNorm} />
              <Text style={[text(13), { color: SUB }]}>{city.uf}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
      {shown ? (
        <View style={styles.map}>
          <MapView
            key={`${shown.name}-${shown.uf}`}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: shown.lat,
              longitude: shown.lng,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12
            }}
            mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
            customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
            userInterfaceStyle={palette.dark ? 'dark' : 'light'}
            showsPointsOfInterests={false}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            pointerEvents="none"
          />
          <View pointerEvents="none" style={styles.mapCenter}>
            <View style={[styles.mapRing, { borderColor: palette.ink }]} />
          </View>
          <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.mapPill}>
            <Icon name="pin" size={14} color={palette.ink} />
            <Text style={[text(12.5, 'Bold'), { color: palette.ink }]}>
              Centro de {shown.name}
            </Text>
          </Glass>
        </View>
      ) : null}
      {save.isError ? (
        <Text style={[text(13.5), { color: LIVE }]}>
          Não foi possível salvar a cidade. Tente de novo.
        </Text>
      ) : null}
      <View />
    </Screen>
  )
}

/** O nome com o trecho digitado marcado em acid, como no design. */
function Highlighted({ name, typed }: { name: string; typed: string }) {
  const at = typed ? name.toLocaleLowerCase('pt-BR').indexOf(typed) : -1
  if (at < 0)
    return <Text style={[text(15, 'SemiBold'), { color: FG }]}>{name}</Text>
  return (
    <Text style={[text(15, 'SemiBold'), { color: FG }]}>
      {name.slice(0, at)}
      <Text style={styles.mark}>{name.slice(at, at + typed.length)}</Text>
      {name.slice(at + typed.length)}
    </Text>
  )
}

const PRESSED = themed('rgba(18,18,15,.05)', 'rgba(241,238,230,.06)')
const CHOSEN = themed('rgba(201,241,53,.28)', 'rgba(201,241,53,.12)')

const styles = StyleSheet.create({
  mark: { backgroundColor: 'rgba(201,241,53,.7)', color: '#12120f' },
  map: { height: 180, borderRadius: 7, overflow: 'hidden' },
  mapCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mapRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    backgroundColor: 'rgba(201,241,53,.2)'
  },
  mapPill: {
    position: 'absolute',
    left: 14,
    bottom: 14,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden'
  },
  suggestions: {
    borderRadius: 5,
    backgroundColor: FIELD,
    borderWidth: 1,
    borderColor: LINE_STRONG,
    overflow: 'hidden'
  },
  suggestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingVertical: 12
  }
})
