import { F1_TRACKS } from '@findsports_oficial/db/f1-tracks'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import {
  OnboardingCard,
  OnboardingTop,
  RaceTile,
  SportBadge,
  StepFooter,
  type Team,
  TeamChip,
  useEditing,
  useFrameKind,
  useOnboarding
} from '@/components/onboarding'
import {
  FG,
  Field,
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
 * 4k, "Times": opcional. Sem busca, os times em destaque de cada esporte e os
 * já escolhidos; com busca (duas letras ou mais), o catálogo inteiro pelo
 * servidor (WEB-381). Quem não acha sugere, e a sugestão vai como feedback.
 */

function countLabel(teams: Team[]) {
  const count = teams.length
  if (teams.every((team) => team.kind === 'athlete')) {
    return `${count} ${count === 1 ? 'atleta' : 'atletas'}`
  }
  if (teams.every((team) => team.kind === 'race')) {
    return `${count} ${count === 1 ? 'GP' : 'GPs'}`
  }
  if (teams.every((team) => team.kind === 'team')) {
    return `${count} ${count === 1 ? 'time' : 'times'}`
  }
  // "Flamengo e 2 GPs", como no desenho.
  const races = teams.filter((team) => team.kind === 'race').length
  const others = teams.filter((team) => team.kind !== 'race')
  if (races && others.length === 1)
    return `${others[0]?.name} e ${races} ${races === 1 ? 'GP' : 'GPs'}`
  return `${count} escolhidos`
}

const CALENDAR = Object.keys(F1_TRACKS)

export default function Teams() {
  // Na mesa a pergunta já está na metade de cima (Adaptativo 09).
  const table = useFrameKind() === 'table'
  const router = useRouter()
  const { choices, set } = useOnboarding()
  const edit = useEditing()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const searching = search.trim().length >= 2

  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const featured = useQueries({
    queries: choices.sportIds.map((sportId) =>
      trpc.pubs.getTeamsBySport.queryOptions({ sportId })
    )
  })
  const results = useQuery({
    ...trpc.pubs.searchTeams.queryOptions({
      sportIds: choices.sportIds,
      query
    }),
    enabled: searching && query.length >= 2,
    placeholderData: (previous) => previous
  })

  const selected = (id: string) => choices.teams.some((team) => team.id === id)
  const toggle = (team: Team) =>
    set({
      teams: selected(team.id)
        ? choices.teams.filter((chosen) => chosen.id !== team.id)
        : [...choices.teams, team]
    })
  const chip = (team: Team) => (
    <TeamChip
      key={team.id}
      name={team.name}
      selected={selected(team.id)}
      onPress={() => toggle(team)}
    />
  )

  const groups = choices.sportIds.map((sportId, index) => {
    const sport = sports.data?.find((item) => item.id === sportId)
    if (searching) {
      return {
        sport,
        sections: [
          {
            label: null,
            teams: (results.data ?? []).filter((t) => t.sportId === sportId)
          }
        ]
      }
    }
    const list = featured[index]?.data ?? []
    const ids = new Set(list.map((team) => team.id))
    const extra = choices.teams.filter(
      (team) => team.sportId === sportId && !ids.has(team.id)
    )
    // WEB-520: a F1 é por GP; os pilotos e escuderias antigos ficam fora.
    if (list.some((team) => team.kind === 'race'))
      return {
        sport,
        sections: [
          {
            label: 'Por GP',
            // Na ordem do calendário, não por nome.
            teams: list
              .filter((team) => team.kind === 'race')
              .sort(
                (a, b) =>
                  CALENDAR.indexOf(a.catalogKey ?? '') -
                  CALENDAR.indexOf(b.catalogKey ?? '')
              ),
            races: true
          }
        ]
      }
    const teams = list.filter((team) => team.kind !== 'athlete')
    const athletes = list.filter((team) => team.kind === 'athlete')
    // Times e atletas no mesmo esporte: cada um com seu subtítulo.
    const both = teams.length > 0 && athletes.length > 0
    return {
      sport,
      sections: [
        { label: null, teams: extra },
        { label: both ? 'Times' : null, teams },
        { label: both ? 'Atletas' : null, teams: athletes }
      ]
    }
  })
  const nothing = groups.every((group) =>
    group.sections.every((section) => section.teams.length === 0)
  )

  const count = choices.teams.length
  // Veio do "Trocar" da revisão: "Continuar" devolve para lá.
  const { volta } = useLocalSearchParams<{ volta?: string }>()
  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <StepFooter>
          {edit.editing ? (
            <PillButton
              label={edit.saving ? 'Salvando…' : 'Salvar'}
              disabled={!edit.ready || edit.saving}
              onPress={() => edit.save().catch(() => {})}
            />
          ) : (
            <PillButton
              label={
                count === 0
                  ? 'Pular'
                  : `Continuar · ${countLabel(choices.teams)}`
              }
              onPress={() =>
                volta ? router.back() : router.push('/onboarding/location')
              }
            />
          )}
        </StepFooter>
      }
    >
      {edit.back ?? <OnboardingTop step={3} />}
      {edit.editing || table ? null : <OnboardingCard lit="teams" step={3} />}
      {edit.failed ? (
        <Text style={[text(13.5), { color: LIVE }]}>
          Não foi possível salvar. Tente de novo.
        </Text>
      ) : null}
      {table ? null : (
        <View style={{ marginTop: 8 }}>
          <Title lines={[['E pra quem'], ['', 'torce?']]} size={36} />
        </View>
      )}
      <Text style={[text(15), { color: SUB, marginTop: -4 }]}>
        Opcional. Avisamos quando um bar perto marcar jogo deles.
      </Text>
      <Field
        bare
        label="Buscar time ou atleta"
        icon="search"
        placeholder="Buscar time ou atleta"
        autoCorrect={false}
        returnKeyType="search"
        value={search}
        onChangeText={setSearch}
      />
      {groups.map(({ sport, sections }) =>
        sport && sections.some((section) => section.teams.length > 0) ? (
          <View key={sport.id} style={{ gap: 8 }}>
            <View
              style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}
            >
              <SportBadge name={sport.name} />
              <Text style={[text(14, 'Bold'), { color: FG }]}>
                {sport.name}
              </Text>
            </View>
            {sections.map((section, index) =>
              section.teams.length > 0 ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: seções fixas, sempre na mesma ordem
                <View key={index} style={{ gap: 6 }}>
                  {section.label ? (
                    <Text style={[text(12), { color: SUB }]}>
                      {section.label}
                    </Text>
                  ) : null}
                  {'races' in section && section.races ? (
                    // Os GPs em ladrilhos com o traçado, em fila que rola.
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -18, flexGrow: 0 }}
                      contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
                    >
                      {section.teams.map((team) => (
                        <RaceTile
                          key={team.id}
                          name={team.name}
                          catalogKey={team.catalogKey}
                          selected={selected(team.id)}
                          onPress={() => toggle(team)}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <View
                      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}
                    >
                      {section.teams.map(chip)}
                    </View>
                  )}
                </View>
              ) : null
            )}
          </View>
        ) : null
      )}
      {searching && results.isError ? (
        <Text style={[text(14), { color: SUB }]}>
          Não foi possível buscar. Confira a conexão.
        </Text>
      ) : searching && !results.data ? (
        <Text style={[text(14), { color: SUB }]}>Buscando…</Text>
      ) : searching && nothing ? (
        <Text style={[text(14), { color: SUB }]}>Nada com “{query}”.</Text>
      ) : !searching && nothing && featured.every((list) => list.isSuccess) ? (
        <Text style={[text(14), { color: SUB }]}>Busque pelo nome acima.</Text>
      ) : null}
      {searching && results.data ? (
        <Suggest
          key={query}
          name={query}
          sports={choices.sportIds.flatMap(
            (id) => sports.data?.find((sport) => sport.id === id)?.name ?? []
          )}
        />
      ) : null}
    </Screen>
  )
}

/** O torcedor não achou: vai como feedback e entra depois de revisado. */
function Suggest({ name, sports }: { name: string; sports: string[] }) {
  const send = useMutation(trpc.feedback.send.mutationOptions())
  if (send.isSuccess) {
    return (
      <Text style={[text(14), { color: SUB }]} accessibilityLiveRegion="polite">
        Recebemos a sugestão de “{name}”. A gente revisa antes de incluir.
      </Text>
    )
  }
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}
    >
      <Text style={[text(14), { color: SUB }]}>Não achou? </Text>
      <Pressable
        accessibilityRole="button"
        disabled={send.isPending}
        hitSlop={12}
        onPress={() =>
          send.mutate({
            message: `Sugestão para o catálogo de times e atletas: “${name}” (${sports.join(', ')}).`,
            pageUrl: 'onside://onboarding/teams'
          })
        }
      >
        <Text
          style={[
            text(14, 'Bold'),
            { color: FG, textDecorationLine: 'underline' }
          ]}
        >
          Sugerir “{name}”
        </Text>
      </Pressable>
      {send.isError ? (
        <Text style={[text(14), { color: SUB }]}>
          {' '}
          Não deu para enviar. Tente de novo.
        </Text>
      ) : null}
    </View>
  )
}
