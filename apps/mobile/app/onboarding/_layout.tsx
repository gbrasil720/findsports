import { Stack } from 'expo-router'
import { OnboardingProvider, usePane } from '@/components/onboarding'
import { OnboardingFrame } from '@/components/onboarding-frame'
import { BG } from '@/components/ui'

/** Os passos do onboarding do torcedor dividem as escolhas pelo contexto. */
export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <OnboardingFrame>
        <Steps />
      </OnboardingFrame>
    </OnboardingProvider>
  )
}

/**
 * Fora do celular cada passo fica na coluna do meio; a localização, que é
 * um mapa, ocupa a área toda.
 */
function Steps() {
  const side = usePane()?.side ?? 0
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: side
          ? { paddingHorizontal: side, backgroundColor: BG }
          : undefined
      }}
    >
      <Stack.Screen
        name="location"
        options={{ contentStyle: side ? { backgroundColor: BG } : undefined }}
      />
    </Stack>
  )
}
