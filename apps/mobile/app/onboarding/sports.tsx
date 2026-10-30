import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { ErrorText } from '@/components/motion'
import {
  OnboardingTop,
  SportTile,
  StepFooter,
  TableTile,
  useEditing,
  useFrameKind,
  useOnboarding,
  usePane
} from '@/components/onboarding'
import {
  LIVE,
  PillButton,
  Screen,
  SUB,
  Text,
  Title,
  text
} from '@/components/ui'
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
  const edit = useEditing()
  // Na mesa a pergunta já está na metade de cima (Adaptativo 09).
  const table = useFrameKind() === 'table'
  const wide = usePane()?.wide ?? false
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

  // Na mesa, a grade de 4 colunas do design (`table9`); no resto, a de 2.
  const columns = table ? 4 : 2
  const rows: (typeof sports)[] = []
  for (let index = 0; index < sports.length; index += columns)
    rows.push(sports.slice(index, index + columns))
  const chosen = choices.sportIds.length

  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <StepFooter>
          <PillButton
            label={
              table && chosen
                ? `Continuar · ${chosen} ${chosen === 1 ? 'escolhido' : 'escolhidos'}`
                : 'Continuar'
            }
            disabled={chosen === 0}
            onPress={() =>
              router.push(
                edit.editing
                  ? {
                      pathname: '/onboarding/teams',
                      params: { edit: '1', from: 'sports' }
                    }
                  : '/onboarding/teams'
              )
            }
          />
        </StepFooter>
      }
    >
      {edit.back ?? <OnboardingTop step={2} />}
      {table ? null : (
        <View style={{ marginTop: 8 }}>
          {/* Na coluna mais larga de fora do celular, numa linha só. */}
          <Title
            lines={
              wide
                ? [['Quais esportes você curte?']]
                : [['Quais esportes'], ['você curte?']]
            }
            size={36}
          />
        </View>
      )}
      {table ? null : (
        <Text
          style={[text(15, 'Regular', 1.45), { color: SUB, marginTop: -4 }]}
        >
          Marque tudo que você acompanha — a gente filtra os bares pra você.
        </Text>
      )}
      {query.isError ? (
        <ErrorText style={[text(13.5), { color: LIVE }]}>
          Não foi possível carregar os esportes. Puxe para tentar de novo.
        </ErrorText>
      ) : null}
      <View style={{ gap: 10 }}>
        {rows.map((row) => (
          <View key={row[0].id} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map((sport) =>
              table ? (
                <TableTile
                  key={sport.id}
                  name={sport.name}
                  selected={choices.sportIds.includes(sport.id)}
                  onPress={() => toggle(sport.id)}
                />
              ) : (
                <SportTile
                  key={sport.id}
                  name={sport.name}
                  selected={choices.sportIds.includes(sport.id)}
                  onPress={() => toggle(sport.id)}
                />
              )
            )}
            {Array.from({ length: columns - row.length }, (_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: vaga da grade
              <View key={index} style={{ flex: 1 }} />
            ))}
          </View>
        ))}
      </View>
      {table ? null : (
        <Text style={[text(13), { color: SUB }]}>
          {countLabel(choices.sportIds.length)}
        </Text>
      )}
    </Screen>
  )
}
