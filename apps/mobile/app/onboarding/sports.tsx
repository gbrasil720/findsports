import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Text, View } from 'react-native'
import { ErrorText } from '@/components/motion'
import {
  OnboardingTop,
  SportTile,
  useOnboarding
} from '@/components/onboarding'
import { LIVE, PillButton, Screen, SUB, Title, text } from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * 4j, "Esportes": pelo menos um. Tirar um esporte tira junto os times dele.
 */

// A ordem do design; o que não está aqui vem depois, por nome.
const ORDER = ['futebol', 'basquete', 'volei', 'formula-1', 'mma-ufc']
const rank = (slug: string) => {
  const index = ORDER.indexOf(slug)
  return index === -1 ? ORDER.length : index
}

const countLabel = (count: number) =>
  count === 0
    ? 'Escolha pelo menos 1.'
    : `${count} ${count === 1 ? 'selecionado' : 'selecionados'} — escolha pelo menos 1.`

export default function Sports() {
  const router = useRouter()
  const { choices, set } = useOnboarding()
  const query = useQuery(trpc.pubs.getSports.queryOptions())
  const sports = [...(query.data ?? [])].sort(
    (a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name)
  )

  const toggle = (id: string) => {
    const on = choices.sportIds.includes(id)
    set({
      sportIds: on
        ? choices.sportIds.filter((sportId) => sportId !== id)
        : [...choices.sportIds, id],
      teams: on
        ? choices.teams.filter((team) => team.sportId !== id)
        : choices.teams
    })
  }

  const rows: (typeof sports)[] = []
  for (let index = 0; index < sports.length; index += 2)
    rows.push(sports.slice(index, index + 2))

  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <PillButton
          label="Continuar"
          disabled={choices.sportIds.length === 0}
          onPress={() => router.push('/onboarding/teams')}
        />
      }
    >
      <OnboardingTop step={2} />
      <View style={{ marginTop: 8 }}>
        <Title lines={[['Quais esportes'], ['você curte?']]} size={36} />
      </View>
      <Text style={[text(15, 'Regular', 1.45), { color: SUB, marginTop: -4 }]}>
        Marque tudo que você acompanha — a gente filtra os bares pra você.
      </Text>
      {query.isError ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>
          Não foi possível carregar os esportes. Puxe para tentar de novo.
        </ErrorText>
      ) : null}
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <View key={row[0].id} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map((sport) => (
              <SportTile
                key={sport.id}
                name={sport.name}
                selected={choices.sportIds.includes(sport.id)}
                onPress={() => toggle(sport.id)}
              />
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </View>
      <Text style={[text(13), { color: SUB }]}>
        {countLabel(choices.sportIds.length)}
      </Text>
    </Screen>
  )
}
