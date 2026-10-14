import { Stack } from 'expo-router'
import { OnboardingProvider } from '@/components/onboarding'

/** Os passos do onboarding do torcedor dividem as escolhas pelo contexto. */
export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OnboardingProvider>
  )
}
