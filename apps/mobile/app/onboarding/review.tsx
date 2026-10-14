import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { ErrorText, haptic, POP_LATE } from '@/components/motion'
import { OnboardingTop, useOnboarding } from '@/components/onboarding'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  MUTED,
  PillButton,
  Screen,
  Title,
  text
} from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * 4n, "Revisão": o resumo e o envio único (`onboarding.completeFan`). Depois,
 * a sessão é relida (ver `refreshSession`) e o app segue para o início.
 */

function Chip({
  icon,
  label
}: {
  icon: 'tv' | 'fan' | 'map' | 'pin'
  label: string
}) {
  return (
    <View>
      <View style={styles.chipShadow} />
      <View style={styles.chip}>
        <Icon name={icon} size={15} />
        <Text style={text(13.5, 'SemiBold')}>{label}</Text>
      </View>
    </View>
  )
}

export default function Review() {
  const router = useRouter()
  const { choices } = useOnboarding()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const complete = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        haptic.success()
        await refreshSession()
        await queryClient.invalidateQueries()
        router.dismissAll()
        router.replace('/')
      }
    })
  )

  const chosenSports = (sports.data ?? []).filter((sport) =>
    choices.sportIds.includes(sport.id)
  )
  const save = () =>
    complete.mutate({
      sportIds: choices.sportIds,
      searchRadiusKm: choices.radius,
      teamIds: choices.teams.map((team) => team.id),
      city: choices.city
        ? { name: choices.city.name, uf: choices.city.uf }
        : undefined
    })

  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <PillButton
          label={complete.isPending ? 'Salvando…' : 'Salvar e encontrar bares'}
          disabled={complete.isPending || choices.sportIds.length === 0}
          onPress={save}
        />
      }
    >
      <OnboardingTop step={5} />
      <View style={styles.art}>
        <View style={styles.orbShadow} />
        <View style={styles.orb} />
        <Animated.View entering={POP_LATE} style={styles.check}>
          <Icon name="check" size={90} />
        </Animated.View>
      </View>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Title lines={[['Pronto para salvar']]} size={38} />
        <Text
          style={[
            text(15.5, 'Regular', 1.48),
            { color: MUTED, textAlign: 'center', maxWidth: 320 }
          ]}
        >
          Confira sua seleção. Ao continuar, salvamos preferências e abrimos o
          mapa de bares.
        </Text>
      </View>
      <View style={styles.chips}>
        {chosenSports.map((sport) => (
          <Chip key={sport.id} icon="tv" label={sport.name} />
        ))}
        {choices.teams.map((team) => (
          <Chip key={team.id} icon="fan" label={team.name} />
        ))}
        <Chip icon="map" label={`${choices.radius} km`} />
        {choices.city ? <Chip icon="pin" label={choices.city.name} /> : null}
      </View>
      {choices.sportIds.length === 0 ? (
        <Text style={[text(13.5), { color: MUTED, textAlign: 'center' }]}>
          Volte e escolha pelo menos um esporte.
        </Text>
      ) : null}
      {complete.error ? (
        <ErrorText style={[text(13.5), { color: LIVE, textAlign: 'center' }]}>
          {complete.error.message || 'Não foi possível salvar. Tente de novo.'}
        </ErrorText>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  art: {
    height: 210,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4
  },
  orb: {
    position: 'absolute',
    bottom: 6,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: ACID
  },
  orbShadow: {
    position: 'absolute',
    bottom: 1,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: INK,
    transform: [{ translateX: 5 }]
  },
  check: {
    width: 190,
    height: 196,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center'
  },
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#faf8f3',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)'
  },
  chipShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 4,
    backgroundColor: 'rgba(18,18,15,.09)'
  }
})
