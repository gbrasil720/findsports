import * as Location from 'expo-location'
import { useRouter } from 'expo-router'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { EASE, haptic } from '@/components/motion'
import { useOnboarding } from '@/components/onboarding'
import {
  ACID,
  Icon,
  INK,
  MUTED,
  PAPER,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'

/*
 * 4m, "Localização": o pedido do sistema, explicado antes. Só aparece se o
 * aparelho ainda não respondeu (ver `distance.tsx`). Com ou sem permissão,
 * segue para a revisão: a localização não é salva, só usada na busca.
 */

// A folha sobe como as do iOS; o mapa atrás só escurece.
const SHEET_IN = SlideInDown.duration(380).easing(EASE)
const DIM_IN = FadeIn.duration(260)

export default function LocationAsk() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { choices } = useOnboarding()
  useStatusBar('dark')
  const center = choices.city ? `de ${choices.city.name}` : 'da sua cidade'

  const proceed = () => router.replace('/onboarding/review')
  const allow = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status === 'granted') haptic.success()
    proceed()
  }

  return (
    <View style={{ flex: 1, backgroundColor: PAPER }}>
      <Image
        source={require('../../assets/images/intro/map.jpg')}
        style={{ width: '100%', height: '100%', position: 'absolute' }}
        resizeMode="cover"
      />
      <Animated.View entering={DIM_IN} style={styles.dim} />
      <View style={styles.area}>
        <View style={styles.ring} />
        <View style={styles.halo} />
        <View style={styles.you} />
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
              <Icon name="pin" size={26} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Title lines={[['Usar sua localização?']]} size={30} />
          </View>
        </View>
        <Text style={[text(15.5, 'Regular', 1.48), { color: MUTED }]}>
          Com ela, a distância conta a partir de onde você está. Sem ela, a
          busca parte do centro {center}.
        </Text>
        <View style={{ gap: 6 }}>
          {['Só enquanto você usa o app', 'Nunca aparece para os bares'].map(
            (line) => (
              <View key={line} style={styles.point}>
                <Icon name="check" size={15} />
                <Text style={text(13.5)}>{line}</Text>
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
          <Text style={[text(14.5, 'Bold'), { textAlign: 'center' }]}>
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
    top: 185,
    alignSelf: 'center',
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ring: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderRadius: 115,
    borderWidth: 2,
    borderColor: 'rgba(18,18,15,.6)',
    backgroundColor: 'rgba(201,241,53,.12)'
  },
  // Os dois anéis acid em volta do ponto, como no design.
  halo: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(201,241,53,.18)'
  },
  you: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: ACID
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: PAPER,
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
    backgroundColor: 'rgba(18,18,15,.18)'
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
    backgroundColor: INK
  },
  point: { flexDirection: 'row', alignItems: 'center', gap: 8 }
})
