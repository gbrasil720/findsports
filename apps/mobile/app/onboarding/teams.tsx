import { useQueries, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import {
  fold,
  OnboardingTop,
  SportBadge,
  TeamChip,
  useOnboarding
} from '@/components/onboarding'
import { Field, MUTED, PillButton, Screen, Title, text } from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * 4k, "Times": opcional. Os times dos esportes escolhidos, por esporte, com
 * busca por nome (sem acento).
 */

export default function Teams() {
  const router = useRouter()
  const { choices, set } = useOnboarding()
  const [search, setSearch] = useState('')
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const lists = useQueries({
    queries: choices.sportIds.map((sportId) =>
      trpc.pubs.getTeamsBySport.queryOptions({ sportId })
    )
  })

  const needle = fold(search)
  const groups = choices.sportIds.map((sportId, index) => ({
    sport: sports.data?.find((sport) => sport.id === sportId),
    teams: (lists[index]?.data ?? []).filter(
      (team) => !needle || fold(team.name).includes(needle)
    )
  }))

  const selected = (id: string) => choices.teams.some((team) => team.id === id)
  const toggle = (team: { id: string; name: string; sportId: string }) =>
    set({
      teams: selected(team.id)
        ? choices.teams.filter((chosen) => chosen.id !== team.id)
        : [...choices.teams, team]
    })

  const count = choices.teams.length
  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <PillButton
          label={
            count === 0
              ? 'Pular'
              : `Continuar · ${count} ${count === 1 ? 'time' : 'times'}`
          }
          onPress={() => router.push('/onboarding/distance')}
        />
      }
    >
      <OnboardingTop step={3} />
      <View style={{ marginTop: 8 }}>
        <Title lines={[['Quem você acompanha?']]} size={36} />
      </View>
      <Text style={[text(15), { color: MUTED, marginTop: -4 }]}>
        Opcional — marque quantos quiser em cada esporte, ou pule.
      </Text>
      <Field
        bare
        label="Buscar time ou piloto"
        icon="search"
        placeholder="Buscar time ou piloto"
        autoCorrect={false}
        value={search}
        onChangeText={setSearch}
      />
      {groups.map(({ sport, teams }) =>
        sport && teams.length > 0 ? (
          <View key={sport.id} style={{ gap: 8 }}>
            <View
              style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
            >
              <SportBadge name={sport.name} />
              <Text style={text(14, 'Bold')}>{sport.name}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {teams.map((team) => (
                <TeamChip
                  key={team.id}
                  name={team.name}
                  selected={selected(team.id)}
                  onPress={() =>
                    toggle({ id: team.id, name: team.name, sportId: sport.id })
                  }
                />
              ))}
            </View>
          </View>
        ) : null
      )}
      {!needle &&
      lists.every((list) => list.isSuccess) &&
      groups.every((group) => group.teams.length === 0) ? (
        <Text style={[text(14), { color: MUTED }]}>
          Ainda não temos times desses esportes. Pode pular este passo.
        </Text>
      ) : null}
      {needle && groups.every((group) => group.teams.length === 0) ? (
        <Text style={[text(14), { color: MUTED }]}>
          Nenhum time com “{search.trim()}”.
        </Text>
      ) : null}
    </Screen>
  )
}
