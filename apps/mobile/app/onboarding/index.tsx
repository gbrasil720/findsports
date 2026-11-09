import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import {
  OnboardingCard,
  OnboardingTop,
  StepFooter,
  useFrameKind,
  useStepTitle
} from '@/components/onboarding'
import {
  CARD,
  DROP,
  FG,
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
  { icon: 'calendar', label: 'Os jogos dos seus times aparecem primeiro' },
  { icon: 'bell', label: 'Aviso quando um bar perto passar o jogo deles' },
  { icon: 'medal', label: 'Conquistas e ranking com o seu nome' }
] as const

export default function Welcome() {
  // Na mesa a pergunta já está na metade de cima (Adaptativo 09).
  const table = useFrameKind() === 'table'
  // Fora do celular, com coluna larga, o título corre como no design
  // ("Vamos achar os melhores / bares pro seu jogo.").
  const title = useStepTitle(
    [['Sua carteirinha ', 'de torcedor']],
    [['Sua carteirinha'], ['', 'de torcedor']]
  )
  const router = useRouter()
  return (
    <Screen
      gap={16}
      padding={18}
      footer={
        <StepFooter back={false}>
          <PillButton
            label="Começar"
            trailing
            onPress={() => router.push('/onboarding/sports')}
          />
        </StepFooter>
      }
    >
      <OnboardingTop step={1} />
      {table ? null : (
        <View style={{ marginTop: 8 }}>
          <Title lines={title} size={40} />
        </View>
      )}
      {table ? null : <OnboardingCard lit={null} step={1} />}
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
      <Text
        style={[
          text(12.5),
          { color: SUB, textAlign: 'center', fontFamily: 'GeistMono-SemiBold' }
        ]}
      >
        3 perguntas · 30 segundos
      </Text>
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
