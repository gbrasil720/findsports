import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View
} from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import { EASE, haptic, POP } from '@/components/motion'
import {
  ACID,
  BackButton,
  DROP,
  FG,
  Icon,
  INK,
  LINE,
  PillButton,
  Screen,
  SUB,
  Title,
  text
} from '@/components/ui'

/*
 * "Perfil de uso" (4f do design): torcedor ou dono de bar, antes do cadastro.
 * O papel escolhido vai para `sign-up` e de lá para o servidor (`role`).
 */

type Role = 'fan' | 'pub'

const OPTIONS: {
  role: Role
  icon: 'fan' | 'bar'
  title: string
  body: string
}[] = [
  {
    role: 'fan',
    icon: 'fan',
    title: 'Sou torcedor',
    body: 'Encontrar bares que passam meus jogos, marcar que vou e ganhar a oferta da casa.'
  },
  {
    role: 'pub',
    icon: 'bar',
    title: 'Tenho um bar',
    body: 'Divulgar a programação, ver quem vai e lotar nos dias de clássico.'
  }
]

/** O fundo do cartão do bar: tinta com riscos finos em diagonal. */
function BarPattern() {
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern id="a" width={92} height={72} patternUnits="userSpaceOnUse">
          <Line
            x1={0}
            y1={72}
            x2={92}
            y2={0}
            stroke="rgba(241,238,230,.1)"
            strokeWidth={2.5}
          />
        </Pattern>
        <Pattern id="b" width={120} height={88} patternUnits="userSpaceOnUse">
          <Line
            x1={0}
            y1={0}
            x2={120}
            y2={88}
            stroke="rgba(241,238,230,.08)"
            strokeWidth={2.5}
          />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={INK} />
      <Rect width="100%" height="100%" fill="url(#a)" />
      <Rect width="100%" height="100%" fill="url(#b)" />
    </Svg>
  )
}

function Option({
  option,
  selected,
  onPress
}: {
  option: (typeof OPTIONS)[number]
  selected: boolean
  onPress: () => void
}) {
  // Escolher: a sombra acid sai de trás do cartão, o fundo clareia e a borda
  // escurece; o outro cartão faz o caminho de volta. Tocar afunda um pouco.
  const on = useSharedValue(selected ? 1 : 0)
  // Cor calculada no quadro: a dinâmica do tema não entra no `interpolateColor`.
  const [rest, lit] =
    useColorScheme() === 'dark'
      ? ['#1c1c18', '#24241f']
      : ['#faf8f3', '#ffffff']
  const down = useSharedValue(0)
  useEffect(() => {
    // Troca de estado curta: tempo fixo, sem mola (escolher não quica).
    on.value = withTiming(selected ? 1 : 0, { duration: 200, easing: EASE })
  }, [selected, on])
  const lift = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - down.value * 0.015 }]
  }))
  const acid = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ translateX: on.value * 5 }, { translateY: on.value * 5 }]
  }))
  const gray = useAnimatedStyle(() => ({ opacity: 1 - on.value }))
  const card = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [rest, lit])
  }))
  // A borda escura é uma camada por cima, só em opacidade (animar a largura
  // da borda refaria o layout a cada quadro).
  const ring = useAnimatedStyle(() => ({ opacity: on.value }))
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.title}
      onPress={onPress}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 90, easing: EASE })
      }}
      onPressOut={() => {
        down.value = withTiming(0, { duration: 160, easing: EASE })
      }}
    >
      <Animated.View style={lift}>
        <Animated.View style={[styles.idleShadow, gray]} />
        <Animated.View style={[styles.selectedShadow, acid]} />
        <Animated.View style={[styles.card, card]}>
          <View style={styles.cover}>
            {option.role === 'fan' ? (
              <Image
                source={require('../assets/images/intro/bar.jpg')}
                // Só `absoluteFill` deixa a imagem no tamanho original.
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <BarPattern />
            )}
            <View
              style={[
                styles.mark,
                selected ? styles.markOn : styles.markOff,
                // No fundo tinta do bar, a bolinha tinta precisa de contorno.
                selected && option.role === 'pub' && styles.markOnDark
              ]}
            >
              {selected ? (
                <Animated.View entering={POP}>
                  <Icon name="check" size={15} color={ACID} />
                </Animated.View>
              ) : null}
            </View>
          </View>
          <View style={styles.cardBody}>
            <Icon name={option.icon} size={28} />
            <View style={{ flex: 1 }}>
              <Text style={[text(18, 'Bold'), { color: FG }]}>
                {option.title}
              </Text>
              <Text style={[text(13.5), { color: SUB, marginTop: 2 }]}>
                {option.body}
              </Text>
            </View>
          </View>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.ring, ring]}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  )
}

export default function Profile() {
  const router = useRouter()
  const [role, setRole] = useState<Role>('fan')
  const dark = useColorScheme() === 'dark'

  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <PillButton
          label={
            role === 'fan'
              ? 'Continuar como torcedor'
              : 'Continuar como dono de bar'
          }
          onPress={() =>
            router.push({ pathname: '/sign-up', params: { role } })
          }
        />
      }
    >
      <View style={styles.top}>
        <BackButton />
        <Image
          source={
            dark
              ? require('../assets/images/brand/wordmark-light.png')
              : require('../assets/images/brand/wordmark.png')
          }
          accessibilityLabel="Onside"
          style={{ height: 20, width: (20 * 845) / 256 }}
        />
      </View>
      <Title lines={[['Como você vai'], ['usar a Onside?']]} size={36} />
      <View accessibilityRole="radiogroup" style={{ gap: 14 }}>
        {OPTIONS.map((option) => (
          <Option
            key={option.role}
            option={option}
            selected={role === option.role}
            onPress={() => {
              if (option.role !== role) haptic.select()
              setRole(option.role)
            }}
          />
        ))}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  card: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LINE
  },
  // A sombra dura acid do cartão escolhido, fora do recorte.
  selectedShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 8,
    backgroundColor: ACID
  },
  idleShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 8,
    backgroundColor: DROP
  },
  ring: { borderRadius: 8, borderWidth: 1.5, borderColor: FG },
  cover: { height: 120, backgroundColor: '#2a2a25' },
  mark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  markOn: { backgroundColor: INK },
  markOnDark: { borderWidth: 1.5, borderColor: 'rgba(241,238,230,.55)' },
  markOff: {
    backgroundColor: 'rgba(255,255,255,.7)',
    borderWidth: 1.5,
    borderColor: 'rgba(18,18,15,.3)'
  },
  cardBody: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  }
})
