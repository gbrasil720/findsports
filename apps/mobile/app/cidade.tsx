import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import MapView from 'react-native-maps'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { haptic, SWAP } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  BlockButton,
  FG,
  FIELD,
  Field,
  Icon,
  INK,
  LINE_STRONG,
  LIVE,
  PAPER,
  Screen,
  SUB,
  Text,
  TextInput,
  Title,
  text,
  themed,
  useAccountSheet,
  useStatusBar
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

  if (!asSheet)
    return (
      <CityPhone
        current={current ?? null}
        typed={typed}
        setTyped={setTyped}
        query={query}
        results={suggestions.data ?? []}
        busy={save.isPending}
        failed={save.isError}
        onPick={pick}
      />
    )

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

type Found = {
  name: string
  uf: string
  lat: number
  lng: number
  bars: number
  today: number
}

/**
 * "Sua cidade" no celular (rodada 6, tela 6b): a de agora num cartão de
 * tinta com os bares e quantos têm jogo hoje, a busca com o trecho marcado,
 * cada cidade com os jogos de hoje (ou "avisamos quando chegar" sem bar), a
 * localização do aparelho e "Mudar para X" no pé.
 */
function CityPhone({
  current,
  typed,
  setTyped,
  query,
  results,
  busy,
  failed,
  onPick
}: {
  current: { name: string; uf: string } | null
  typed: string
  setTyped: (value: string) => void
  query: string
  results: Found[]
  busy: boolean
  failed: boolean
  onPick: (city: Found) => void
}) {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const state = useExploreState()
  useStatusBar('auto')
  const [chosen, setChosen] = useState<Found | null>(null)
  // Os números da cidade de agora vêm da mesma busca.
  const now = useQuery({
    ...trpc.pubs.searchCities.queryOptions({ query: current?.name ?? '' }),
    enabled: !!current
  })
  const here = now.data?.find(
    (city) => city.name === current?.name && city.uf === current?.uf
  )
  const typedNorm = query.toLocaleLowerCase('pt-BR')
  const picked =
    chosen && results.some((city) => same(city, chosen)) ? chosen : null
  const useDevice = async () => {
    const asked = await Location.requestForegroundPermissionsAsync()
    if (asked.granted) {
      haptic.success()
      await state.locate()
      router.back()
    } else if (!asked.canAskAgain) Linking.openSettings()
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 12, paddingBottom: 120 + insets.bottom }
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
          <Text style={[styles.kicker, { color: palette.muted }]}>CONTA</Text>
          <View style={{ width: 44 }} />
        </View>
        <Title lines={[['Sua ', 'cidade']]} size={40} />

        {current ? (
          <View style={styles.now}>
            <Icon name="pin" size={26} color={ACID} accent={INK} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text(13, 'Regular', 1.2), { color: '#aaa9a4' }]}>
                AGORA
              </Text>
              <Text numberOfLines={1} style={styles.nowName}>
                {current.name}
              </Text>
              <Text style={[text(13.5, 'Regular', 1.3), { color: '#aaa9a4' }]}>
                {here
                  ? `${here.bars} ${here.bars === 1 ? 'bar' : 'bares'} · ${here.today} com jogo hoje`
                  : current.uf}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.field,
            { backgroundColor: palette.card, borderColor: palette.ink }
          ]}
        >
          <Icon name="search" size={20} color={palette.ink} />
          <TextInput
            autoCorrect={false}
            value={typed}
            onChangeText={setTyped}
            placeholder="Buscar cidade"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            selectionColor={palette.dark ? ACID : '#5b6d0c'}
            style={[
              text(16, 'Regular', 1.2),
              styles.input,
              { color: palette.ink }
            ]}
          />
          {typed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apagar"
              hitSlop={8}
              onPress={() => setTyped('')}
            >
              <Icon name="close" size={16} color={palette.ink} />
            </Pressable>
          ) : null}
        </View>

        {results.length ? (
          <View
            style={[
              styles.results,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            {results.map((city, index) => {
              const on = picked ? same(city, picked) : false
              const ink = on ? PAPER : palette.ink
              const muted = on ? '#aaa9a4' : palette.muted
              return (
                <Pressable
                  key={`${city.name}-${city.uf}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic.select()
                    // O "Mudar para" fica no pé, por baixo do teclado.
                    Keyboard.dismiss()
                    setChosen(city)
                  }}
                  style={[
                    styles.result,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.line
                    },
                    on && { backgroundColor: INK }
                  ]}
                >
                  <Icon name="pin" size={22} color={ink} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Highlighted
                      name={city.name}
                      typed={typedNorm}
                      color={ink}
                      size={16}
                    />
                    <Text
                      style={[text(13.5, 'Regular', 1.3), { color: muted }]}
                    >
                      {city.uf} ·{' '}
                      {city.bars
                        ? `${city.bars} ${city.bars === 1 ? 'bar' : 'bares'}`
                        : '0 bares ainda'}
                    </Text>
                  </View>
                  {city.bars ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.today, { color: ink }]}>
                        {city.today}
                      </Text>
                      <Text style={[styles.mono, { color: muted }]}>
                        {index === 0 ? 'com jogo hoje' : 'hoje'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.mono, styles.later, { color: muted }]}>
                      avisamos{'\n'}quando chegar
                    </Text>
                  )}
                </Pressable>
              )
            })}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={useDevice}
          style={({ pressed }) => [
            styles.device,
            { backgroundColor: palette.card, shadowColor: palette.drop },
            pressed && { opacity: 0.8 }
          ]}
        >
          <Icon name="map" size={22} color={palette.muted} accent={LIVE} />
          <View style={{ flex: 1 }}>
            <Text style={[text(15.5, 'Bold', 1.3), { color: palette.ink }]}>
              Usar a localização atual
            </Text>
            <Text
              style={[text(13.5, 'Regular', 1.4), { color: palette.muted }]}
            >
              {state.device
                ? 'Ligada: o mapa segue você'
                : 'o mapa segue você e a cidade vira a de onde estiver'}
            </Text>
          </View>
          <Icon name="next" size={16} color={palette.muted} />
        </Pressable>

        <View style={[styles.note, { backgroundColor: palette.mark }]}>
          <Icon name="pin" size={20} color={palette.ink} />
          <Text
            style={[text(14, 'Regular', 1.45), { color: palette.ink, flex: 1 }]}
          >
            A cidade vale quando a localização está desligada: o mapa abre nela
            e a distância conta do centro.
          </Text>
        </View>
        {failed ? (
          <Text style={[text(13.5), { color: LIVE }]}>
            Não foi possível salvar a cidade. Tente de novo.
          </Text>
        ) : null}
      </ScrollView>
      {picked ? (
        <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
          <BlockButton
            label={busy ? 'Salvando…' : `Mudar para ${picked.name}`}
            busy={busy}
            onPress={() => onPick(picked)}
          />
        </View>
      ) : null}
    </View>
  )
}

const same = (a: Found, b: Found) => a.name === b.name && a.uf === b.uf

/** O nome com o trecho digitado marcado em acid, como no design. */
function Highlighted({
  name,
  typed,
  color = FG,
  size = 15
}: {
  name: string
  typed: string
  color?: string
  size?: number
}) {
  const at = typed ? name.toLocaleLowerCase('pt-BR').indexOf(typed) : -1
  if (at < 0)
    return <Text style={[text(size, 'SemiBold'), { color }]}>{name}</Text>
  return (
    <Text style={[text(size, 'SemiBold'), { color }]}>
      {name.slice(0, at)}
      <Text style={styles.mark}>{name.slice(at, at + typed.length)}</Text>
      {name.slice(at + typed.length)}
    </Text>
  )
}

const PRESSED = themed('rgba(18,18,15,.05)', 'rgba(241,238,230,.06)')
const CHOSEN = themed('rgba(201,241,53,.28)', 'rgba(201,241,53,.12)')

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
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1.04
  },
  now: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: INK,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  // Anton 32: margem negativa no lugar do entrelinha curto.
  nowName: {
    fontFamily: 'Anton',
    fontSize: 32,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -6
  },
  field: {
    height: 52,
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16
  },
  input: { flex: 1, height: 48 },
  results: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  // Anton 28 com a margem negativa.
  today: { fontFamily: 'Anton', fontSize: 28, marginVertical: -6.8 },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  later: { textAlign: 'right' },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  note: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 22
  },
  foot: { position: 'absolute', left: 16, right: 16, bottom: 0 },
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
