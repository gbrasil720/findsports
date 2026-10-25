import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { OnboardingTop } from '@/components/onboarding'
import {
  CARD,
  DROP,
  FG,
  HOT,
  Icon,
  LINE,
  PillButton,
  Screen,
  SUB,
  Text,
  Title,
  text,
  themed
} from '@/components/ui'

/*
 * 4i, "Boas-vindas" do onboarding do torcedor: o primeiro passo depois de
 * confirmar o e-mail, para quem ainda não escolheu esportes e distância.
 */

const FEATURES = [
  { icon: 'fire', label: 'Veja jogos ao vivo perto de você' },
  { icon: 'map', label: 'Bares dentro do seu raio' },
  { icon: 'people', label: 'Leve a galera junto' }
] as const

export default function Welcome() {
  const router = useRouter()
  return (
    <Screen
      gap={16}
      padding={18}
      footer={
        <PillButton
          label="Começar"
          trailing
          onPress={() => router.push('/onboarding/sports')}
        />
      }
    >
      <OnboardingTop step={1} />
      <View style={{ marginTop: 20, gap: 6 }}>
        <Text style={[text(14, 'Bold'), { color: HOT }]}>
          É torcedor? Chegou no lugar certo.
        </Text>
        <Title
          lines={[
            ['Vamos achar os'],
            ['', 'melhores bares'],
            ['pro seu jogo.']
          ]}
          size={42}
        />
      </View>
      <Text style={[text(16.5, 'Regular', 1.48), { color: SUB }]}>
        Em 3 passos a gente calibra sua busca: esportes favoritos, quem você
        acompanha e raio de localização.
      </Text>
      <View style={{ gap: 8, marginTop: 6 }}>
        {FEATURES.map((feature, index) => (
          <View key={feature.label}>
            <View
              style={[
                styles.shadow,
                index === 0 && {
                  top: 5,
                  left: 5,
                  right: -5,
                  bottom: -5,
                  backgroundColor: FIRST_DROP
                }
              ]}
            />
            <View style={styles.feature}>
              <Icon name={feature.icon} size={26} />
              <Text style={[text(15, 'Bold'), { color: FG }]}>
                {feature.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  )
}

// O primeiro item ganha a sombra do destaque: vermelho no claro, acid no escuro.
const FIRST_DROP = themed('rgba(232,50,12,.28)', 'rgba(201,241,53,.28)')

const styles = StyleSheet.create({
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 6,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: LINE
  },
  shadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6,
    backgroundColor: DROP
  }
})
