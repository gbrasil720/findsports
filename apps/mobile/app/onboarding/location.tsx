import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import {
  Platform,
  Pressable,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View
} from 'react-native'
import MapView from 'react-native-maps'
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MeDot, RadiusCircle } from '@/components/explore'
import { EASE, haptic } from '@/components/motion'
import { useOnboarding } from '@/components/onboarding'
import {
  ACID,
  BG,
  EDGE,
  FG,
  Icon,
  INK,
  LIVE,
  PillButton,
  SUB,
  Text,
  Title,
  text,
  themed,
  useStatusBar
} from '@/components/ui'
import { SAO_PAULO } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'

/*
 * 4m, "Localização": o pedido do sistema, explicado antes. Só aparece se o
 * aparelho ainda não respondeu (ver `distance.tsx`). Com ou sem permissão,
 * segue para a revisão: a localização não é salva, só usada na busca.
 */

// A folha sobe como as do iOS; o mapa atrás só escurece.
const SHEET_IN = SlideInDown.duration(380).easing(EASE)
const DIM_IN = FadeIn.duration(260)
// O raio em volta de você, acima da folha: centro a 300 do topo, 230 de
// diâmetro, como no design.
const RING_Y = 300
const RING = 230

export default function LocationAsk() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { choices } = useOnboarding()
  useStatusBar('auto')
  const dark = useColorScheme() === 'dark'
  const { width, height: screen } = useWindowDimensions()
  const center = choices.city ? `de ${choices.city.name}` : 'da sua cidade'
  const { lat, lng } = choices.city ?? SAO_PAULO
  // O Apple Maps encaixa a região na área segura, não na tela toda: a conta
  // usa a altura e o meio dela. Graus de latitude nessa altura para o raio
  // sair com `RING`; o centro do mapa desce para a cidade ficar em `RING_Y`.
  const height = screen - insets.top - insets.bottom
  const middle = insets.top + height / 2
  const span = ((choices.radius * 2) / 111) * (height / RING)

  const proceed = () => router.replace('/onboarding/review')
  const allow = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status === 'granted') haptic.success()
    proceed()
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* O mapa do Explorar, parado, com o raio escolhido na distância. */}
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: lat - ((middle - RING_Y) / height) * span,
          longitude: lng,
          latitudeDelta: span,
          longitudeDelta: (span * width) / height
        }}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={dark ? MAP_STYLE.dark : MAP_STYLE.light}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        showsCompass={false}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        pointerEvents="none"
      >
        <RadiusCircle
          center={{ latitude: lat, longitude: lng }}
          km={choices.radius}
          dark={dark}
        />
      </MapView>
      <Animated.View entering={DIM_IN} style={styles.dim} />
      <View style={styles.area} pointerEvents="none">
        <MeDot />
      </View>
      <Animated.View
        entering={SHEET_IN}
        style={[
          styles.sheet,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 }
        ]}
      >
        <View style={styles.grabber} />
        <View style={styles.head}>
          <View>
            <View style={styles.badgeShadow} />
            <View style={styles.badge}>
              <Icon name="pin" size={26} color={INK} accent={LIVE} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Title lines={[['Usar sua localização?']]} size={30} />
          </View>
        </View>
        <Text style={[text(15.5, 'Regular', 1.48), { color: SUB }]}>
          Com ela, a distância conta a partir de onde você está. Sem ela, a
          busca parte do centro {center}.
        </Text>
        <View style={{ gap: 6 }}>
          {['Só enquanto você usa o app', 'Nunca aparece para os bares'].map(
            (line) => (
              <View key={line} style={styles.point}>
                <Icon name="check" size={15} />
                <Text style={[text(13.5), { color: FG }]}>{line}</Text>
              </View>
            )
          )}
        </View>
        <View style={{ marginTop: 6 }}>
          <PillButton label="Permitir localização" onPress={allow} />
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={proceed}
          hitSlop={10}
          style={{ paddingVertical: 4 }}
        >
          <Text
            style={[text(14.5, 'Bold'), { color: FG, textAlign: 'center' }]}
          >
            Agora não
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,18,15,.28)' },
  area: {
    position: 'absolute',
    top: RING_Y - RING / 2,
    alignSelf: 'center',
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center'
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: BG,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 12
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
    backgroundColor: themed('rgba(18,18,15,.18)', 'rgba(241,238,230,.2)')
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: EDGE
  },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8 }
})
