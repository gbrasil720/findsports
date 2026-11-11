import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { AcidButton, ObPage, ObTitle } from '@/components/ob-frame'
import { clearDraft, OnboardingCard } from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { Icon, Text, text } from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * 1 · Boas-vindas do onboarding B (rodada 2 do redesign): a carteirinha vazia
 * com o nome, o que ela dá e "3 perguntas · 30 segundos". "Pular" conclui sem
 * escolher nada (`completeFan` aceita vazio).
 */

const USES = [
  { icon: 'calendar', label: 'Os jogos dos seus times aparecem primeiro' },
  { icon: 'bell', label: 'Aviso quando um bar perto passar o jogo deles' },
  { icon: 'medal', label: 'Conquistas e ranking com o seu nome' }
] as const

export default function Welcome() {
  const router = useRouter()
  const palette = usePalette()
  const skip = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        clearDraft()
        await refreshSession()
        await queryClient.invalidateQueries()
        router.dismissAll()
        router.replace('/explore')
      }
    })
  )
  return (
    <ObPage
      step={1}
      back={false}
      onSkip={() => skip.mutate({})}
      note="3 perguntas · 30 segundos"
      cta={
        <AcidButton
          label="Começar"
          onPress={() => router.push('/onboarding/sports')}
        />
      }
    >
      <ObTitle plain="Sua carteirinha" hot="de torcedor" size={38} breakLine />
      <OnboardingCard lit={null} />
      <View style={{ gap: 8 }}>
        {USES.map((use) => (
          <View
            key={use.label}
            style={[
              styles.use,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Icon name={use.icon} size={20} color={palette.ink} />
            <Text
              style={[
                text(14.5, 'SemiBold', 1.3),
                { color: palette.ink, flex: 1 }
              ]}
            >
              {use.label}
            </Text>
          </View>
        ))}
      </View>
    </ObPage>
  )
}

const styles = StyleSheet.create({
  use: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  }
})
