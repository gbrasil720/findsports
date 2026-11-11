import { useEffect, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { dropBox, MapDrop, MeDot } from '@/components/explore'
import { Glass } from '@/components/glass'
import { Icon, Text, text } from '@/components/ui'
import type { ChatBar } from '@/lib/ai-events'
import type { MapFrame } from '@/lib/map-layers'
import { MAP_STYLE } from '@/lib/map-style'
import type { AiPalette } from './theme'

/*
 * O mapa da resposta (Adaptativo 03, WEB-488): fora do celular, os bares
 * que a IA achou aparecem num mapa ao lado (ou abaixo) da conversa,
 * numerados como na resposta ("1 · Bar do Zé"), com o ponto da busca.
 */
export function AnswerMap({
  bars,
  frame,
  origin,
  palette,
  pillTop = 14,
  onBar
}: {
  bars: ChatBar[]
  /** O quadro dos bares e do ponto da busca (`mapFocus`). */
  frame: MapFrame | null
  origin: { lat: number; lng: number } | null
  palette: AiPalette
  /** Onde fica a pílula "N bares da resposta" (abaixo da barra de status). */
  pillTop?: number
  onBar: (bar: ChatBar) => void
}) {
  const map = useRef<MapView>(null)
  const region =
    toRegion(frame) ?? toRegion(origin && { ...origin, kmTall: 6, kmWide: 6 })
  const key = region
    ? `${region.latitude.toFixed(4)},${region.longitude.toFixed(4)},${region.latitudeDelta.toFixed(4)}`
    : ''
  // Resposta nova: o mapa vai até os bares dela.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando o quadro muda
  useEffect(() => {
    if (region) map.current?.animateToRegion(region, 350)
  }, [key])
  // Com `tracksViewChanges` desligado o iOS guarda uma foto do desenho; tirada
  // cedo demais, a gota sai em branco. Acompanha só um instante.
  const ids = bars.map((b) => b.id).join()
  const [tracking, setTracking] = useState(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: redesenha quando os bares mudam
  useEffect(() => {
    setTracking(true)
    const stop = setTimeout(() => setTracking(false), 500)
    return () => clearTimeout(stop)
  }, [ids])

  return (
    <View style={styles.wrap}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={region ?? undefined}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
        userInterfaceStyle={palette.dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        toolbarEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {origin ? (
          <Marker
            coordinate={{ latitude: origin.lat, longitude: origin.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={tracking}
            zIndex={0}
          >
            <MeDot />
          </Marker>
        ) : null}
        {bars.map((bar, i) => {
          const label = `${i + 1} · ${bar.name}`
          const live = !!bar.game?.live
          const box = dropBox({ live, label })
          return (
            <Marker
              key={bar.id}
              coordinate={{ latitude: bar.latitude, longitude: bar.longitude }}
              anchor={box.anchor}
              centerOffset={box.centerOffset}
              tracksViewChanges={tracking}
              zIndex={bars.length - i}
              onPress={() => onBar(bar)}
            >
              <MapDrop
                live={live}
                elite={bar.plan === 'elite'}
                dark={palette.dark}
                label={label}
              />
            </Marker>
          )
        })}
      </MapView>
      {bars.length ? (
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          style={[styles.pill, { top: pillTop }]}
        >
          <Icon
            name="sparkle"
            size={15}
            color={palette.ink}
            accent={palette.accent}
          />
          <Text style={[text(13, 'Bold', 1.2), { color: palette.ink }]}>
            {bars.length} {bars.length === 1 ? 'bar' : 'bares'} da resposta
          </Text>
        </Glass>
      ) : null}
    </View>
  )
}

function toRegion(frame: MapFrame | null) {
  if (!frame) return null
  const cos = Math.cos((frame.lat * Math.PI) / 180)
  return {
    latitude: frame.lat,
    longitude: frame.lng,
    latitudeDelta: frame.kmTall / 111,
    longitudeDelta: frame.kmWide / (111.32 * cos)
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  pill: {
    position: 'absolute',
    left: 16,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    overflow: 'hidden'
  }
})
