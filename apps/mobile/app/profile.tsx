import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  MUTED,
  PillButton,
  Screen,
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
    body: 'Encontrar bares que passam meus jogos, marcar presença e reservar mesa.'
  },
  {
    role: 'pub',
    icon: 'bar',
    title: 'Tenho um bar',
    body: 'Divulgar a programação, receber reservas e lotar nos dias de clássico.'
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
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={option.title}
      onPress={onPress}
    >
      <View style={selected ? styles.selectedShadow : styles.idleShadow} />
      <View style={[styles.card, selected ? styles.selected : styles.idle]}>
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
            style={[styles.mark, selected ? styles.markOn : styles.markOff]}
          >
            {selected ? <Icon name="check" size={15} color={ACID} /> : null}
          </View>
        </View>
        <View style={styles.cardBody}>
          <Icon name={option.icon} size={28} />
          <View style={{ flex: 1 }}>
            <Text style={text(18, 'Bold')}>{option.title}</Text>
            <Text style={[text(13.5), { color: MUTED, marginTop: 2 }]}>
              {option.body}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  )
}

export default function Profile() {
  const router = useRouter()
  const [role, setRole] = useState<Role>('fan')

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
          source={require('../assets/images/brand/wordmark.png')}
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
            onPress={() => setRole(option.role)}
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
  card: { borderRadius: 8, overflow: 'hidden' },
  selected: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: INK },
  // A sombra dura acid do cartão escolhido, fora do recorte.
  selectedShadow: {
    position: 'absolute',
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
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
    backgroundColor: 'rgba(18,18,15,.09)'
  },
  idle: {
    backgroundColor: '#faf8f3',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)'
  },
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
