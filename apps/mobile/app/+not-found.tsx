import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import Svg, { Path } from 'react-native-svg'
import { EASE } from '@/components/motion'
import {
  ACID,
  BlockButton,
  FG,
  LIVE,
  Screen,
  SUB,
  Text,
  Title,
  text,
  themed
} from '@/components/ui'

/*
 * 11w, a página que não existe: um link velho ou de bar que saiu da Onside.
 * "Lance impedido", com a bandeira do bandeirinha subindo no mastro. O
 * design manda para o Explorar e para a busca com IA; os dois ainda não
 * existem no app, então o botão volta ao início.
 */

// A bandeira sobe pelo mastro uma vez, ao abrir.
const RAISE = FadeInDown.delay(120)
  .duration(520)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 90 }] })

export default function NotFound() {
  const router = useRouter()
  return (
    <View style={{ flex: 1 }}>
      <Screen
        gap={18}
        padding={22}
        top={96}
        footer={
          <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
            <BlockButton
              label="Voltar para o início"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace('/')
              }
            />
          </View>
        }
      >
        <View style={styles.flag}>
          <View style={styles.pole} />
          {/* Fora anima a subida; dentro fica a inclinação do pano. */}
          <Animated.View entering={RAISE} style={styles.cloth}>
            <View style={{ transform: [{ skewY: '-4deg' }] }}>
              <View style={styles.clothShadow} />
              <Svg width={116} height={84} viewBox="0 0 116 84">
                {/* Preso ao mastro do lado esquerdo: só a ponta é redonda. */}
                <Path
                  d="M0 0h110a6 6 0 0 1 6 6v72a6 6 0 0 1-6 6H0z"
                  fill={ACID}
                />
                <Path d="M116 6v72a6 6 0 0 1-6 6H0L116 0z" fill={LIVE} />
              </Svg>
            </View>
          </Animated.View>
        </View>
        <Text style={styles.code}>ERRO 404</Text>
        <Title lines={[['Lance ', 'impedido.']]} size={56} />
        <Text style={[text(16.5, 'Regular', 1.5), { color: SUB }]}>
          Essa página não existe ou saiu do ar. O link pode estar errado, ou o
          bar deixou a Onside.
        </Text>
      </Screen>
      {/* Por cima, em 6% de tinta: atrás, o fundo da tela a cobriria. */}
      <Text style={styles.watermark} pointerEvents="none">
        404
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  watermark: {
    position: 'absolute',
    right: -20,
    top: 120,
    fontFamily: 'Anton',
    fontSize: 260,
    lineHeight: 260 * 1.505,
    marginTop: -0.3 * 260,
    color: themed('rgba(18,18,15,.06)', 'rgba(241,238,230,.06)')
  },
  flag: { width: 150, height: 190 },
  pole: {
    position: 'absolute',
    left: 18,
    top: 0,
    width: 7,
    height: 190,
    borderRadius: 3,
    backgroundColor: FG
  },
  cloth: {
    position: 'absolute',
    left: 25,
    top: 8
  },
  clothShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 116,
    height: 84,
    borderRadius: 6,
    backgroundColor: themed('rgba(18,18,15,.15)', '#000')
  },
  code: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    color: SUB
  }
})
