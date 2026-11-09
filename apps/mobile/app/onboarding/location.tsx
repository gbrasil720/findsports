import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { MapDrop } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { haptic } from '@/components/motion'
import { AcidButton, ObPage, ObTitle } from '@/components/ob-frame'
import { OnboardingCard, useOnboarding } from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { Icon, Text, text } from '@/components/ui'
import { SAO_PAULO } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * 4 · Onde (rodada 2 do redesign, tela 4b "pedir a localização"): a
 * carteirinha com a Base acesa e o mapa apagado com as gotas de verdade e
 * quantos bares perto passam hoje o que a pessoa escolheu, antes do pedido.
 * O alerta do sistema só abre no toque de "Usar minha localização". Negar ou
 * "Prefiro escolher a cidade" leva à cidade, sem tela de erro. Com a permissão
 * já dada, segue direto para o raio.
 */

/** "Flamengo, F1 ou NBA". */
const either = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? 'o seu jogo')
    : `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`

export default function Where() {
  const router = useRouter()
  const palette = usePalette()
  const { choices } = useOnboarding()
  const { device, locate } = useExploreState()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const center = choices.city ?? SAO_PAULO
  const [day] = useState(() => brasiliaDay(Date.now()))
  const board = useQuery(
    trpc.pubs.gameBoard.queryOptions({ ...center, radiusKm: 10, day })
  )
  // Os bares com jogo hoje (um por bar), as gotas do mapa.
  const bars = [
    ...new Map(
      (board.data?.games ?? []).flatMap((game) =>
        game.bars.map((bar) => [bar.barId, bar] as const)
      )
    ).values()
  ]
  // Os times e os esportes sem time escolhido (o time já diz o esporte):
  // "Flamengo, F1 ou Basquete".
  const clubs = choices.teams.filter((t) => t.kind !== 'race')
  const names = [
    ...clubs.map((t) => t.name),
    ...choices.sportIds.flatMap((id) => {
      if (clubs.some((t) => t.sportId === id)) return []
      const sport = sports.data?.find((item) => item.id === id)
      return sport ? [sport.slug === 'formula-1' ? 'F1' : sport.name] : []
    })
  ].slice(0, 3)
  // O mapa no meio dos bares com jogo, perto como o de um bairro.
  const focus = bars.length
    ? {
        lat: bars.reduce((sum, bar) => sum + bar.latitude, 0) / bars.length,
        lng: bars.reduce((sum, bar) => sum + bar.longitude, 0) / bars.length
      }
    : center

  // Já com a permissão, este passo não pergunta nada.
  useEffect(() => {
    if (device) router.replace('/onboarding/distance')
  }, [device, router])

  const city = () =>
    router.replace({
      pathname: '/onboarding/distance',
      params: { cidade: '1' }
    })
  const allow = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return city()
    haptic.success()
    await locate()
    router.replace('/onboarding/distance')
  }

  return (
    <ObPage
      step={4}
      onSkip={city}
      action={
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={city}
          style={{ alignSelf: 'center' }}
        >
          <Text
            style={[
              styles.link,
              { color: palette.muted, textDecorationColor: palette.muted }
            ]}
          >
            Prefiro escolher a cidade
          </Text>
        </Pressable>
      }
      cta={
        <AcidButton
          label="Usar minha localização"
          leading="pin"
          onPress={allow}
        />
      }
    >
      <OnboardingCard lit="base" />
      <ObTitle plain="Onde você" hot="assiste?" size={32} />
      <View
        style={[
          styles.map,
          { backgroundColor: palette.mark, borderColor: palette.line }
        ]}
      >
        <MapView
          style={StyleSheet.absoluteFill}
          region={{
            // O cartão da contagem cobre o pé: as gotas ficam no alto.
            latitude: focus.lat - 0.006,
            longitude: focus.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03
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
          {bars.slice(0, 8).map((bar) => (
            <Marker
              key={bar.barId}
              coordinate={{ latitude: bar.latitude, longitude: bar.longitude }}
              tracksViewChanges={false}
            >
              <View style={{ opacity: 0.9 }}>
                <MapDrop live={false} elite={bar.elite} dark={palette.dark} />
              </View>
            </Marker>
          ))}
        </MapView>
        {/* O desenho desfoca o mapa: sem desfoque nativo no Expo Go, um véu
            da cor do fundo o apaga. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: palette.dark
                ? 'rgba(18,18,15,.35)'
                : 'rgba(241,238,230,.35)'
            }
          ]}
        />
        {board.data ? (
          <View
            style={[
              styles.count,
              { backgroundColor: palette.bg, shadowColor: palette.drop }
            ]}
          >
            <Text
              style={[
                styles.countNumber,
                { color: palette.dark ? '#c9f135' : '#e8320c' }
              ]}
            >
              {bars.length}
            </Text>
            <Text
              style={[
                text(13, 'Regular', 1.35),
                { color: palette.ink, flex: 1 }
              ]}
            >
              {bars.length
                ? `${bars.length === 1 ? 'bar perto passa' : 'bares perto passam'} hoje ${either(names)}.`
                : 'Nenhum bar perto marcou jogo hoje ainda.'}
              {'\n'}
              <Text style={{ color: palette.muted }}>
                A gente mostra quando souber onde.
              </Text>
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        {[
          ['lock', 'Fica no aparelho. Não aparece no perfil nem para amigos.'],
          ['pin', 'Só para medir a distância até o bar e montar o mapa.']
        ].map(([icon, line]) => (
          <View key={line} style={styles.why}>
            <Icon name={icon as 'lock' | 'pin'} size={18} color={palette.ink} />
            <Text
              style={[
                text(13.5, 'Regular', 1.4),
                { color: palette.ink, flex: 1, opacity: 0.85 }
              ]}
            >
              {line}
            </Text>
          </View>
        ))}
      </View>
    </ObPage>
  )
}

const styles = StyleSheet.create({
  map: {
    height: 196,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5
  },
  count: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  countNumber: { fontFamily: 'Anton', fontSize: 26, marginVertical: -6 },
  why: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  link: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    textDecorationLine: 'underline'
  }
})
