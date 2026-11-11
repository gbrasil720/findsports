import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { OwnerCard, OwnerLabel } from '@/components/bar-owner'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  errorMessage,
  Icon,
  INK,
  Text,
  TextInput,
  text
} from '@/components/ui'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * "Times da casa" no Meu espaço do app (WEB-433), o mesmo do web: até cinco,
 * opcional, pela busca de times do torcedor (`pubs.searchTeams`). Cada toque
 * grava na hora; os jogos deles vêm primeiro na semana, com "Seu time".
 */

const MAX = 5

type Team = { id: string; name: string; sportId: string }

export function HouseTeams() {
  const palette = usePalette()
  const saved = useQuery(trpc.pub.getMyHouseTeams.queryOptions())
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 250)
    return () => clearTimeout(timer)
  }, [typed])
  const sportIds = (sports.data ?? []).map((s) => s.id)
  const found = useQuery({
    ...trpc.pubs.searchTeams.queryOptions({
      sportIds,
      query,
      clubsOnly: true
    }),
    enabled: query.length >= 2 && sportIds.length > 0
  })
  const key = trpc.pub.getMyHouseTeams.queryKey()
  const save = useMutation(
    trpc.pub.updateHouseTeams.mutationOptions({
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries({
          queryKey: trpc.pub.gameSuggestions.queryKey(),
          refetchType: 'none'
        })
      },
      onError: (error, _input, previous) => {
        haptic.error()
        queryClient.setQueryData(key, previous as Team[] | undefined)
        setProblem(errorMessage(error, 'Não deu para salvar. Tente de novo.'))
      },
      onMutate: () => queryClient.getQueryData(key)
    })
  )
  const teams = saved.data ?? []
  const change = (next: Team[]) => {
    setProblem(null)
    queryClient.setQueryData(key, next)
    save.mutate({ teamIds: next.map((t) => t.id) })
  }
  const results = (found.data ?? [])
    .filter((t) => !teams.some((s) => s.id === t.id))
    .slice(0, 8)

  return (
    <>
      <OwnerLabel>Times da casa · opcional</OwnerLabel>
      <OwnerCard pad={14}>
        <View style={{ gap: 12, paddingVertical: 14 }}>
          <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
            O bar é a casa de algum time? Os jogos dele vêm primeiro nos jogos
            da semana, com “Seu time”. O torcedor não vê esta lista.
          </Text>
          {teams.length ? (
            <View style={styles.chips}>
              {teams.map((team) => (
                <Pressable
                  key={team.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Tirar ${team.name}`}
                  onPress={() => change(teams.filter((t) => t.id !== team.id))}
                  style={[styles.chip, { backgroundColor: ACID }]}
                >
                  <Icon name="check" size={14} color={INK} />
                  <Text style={[text(14, 'SemiBold', 1.2), { color: INK }]}>
                    {team.name}
                  </Text>
                  <Icon name="close" size={14} color={INK} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {teams.length >= MAX ? (
            <Text
              style={[text(13.5, 'Regular', 1.4), { color: palette.muted }]}
            >
              Até {MAX} times. Tire um para trocar.
            </Text>
          ) : (
            <>
              <View
                style={[
                  styles.search,
                  { borderColor: palette.line, backgroundColor: palette.bg }
                ]}
              >
                <Icon name="search" size={18} color={palette.muted} />
                <TextInput
                  value={typed}
                  onChangeText={setTyped}
                  placeholder="Buscar time"
                  placeholderTextColor={palette.muted}
                  autoCorrect={false}
                  returnKeyType="search"
                  style={[
                    text(16, 'Regular', 1.2),
                    { flex: 1, color: palette.ink }
                  ]}
                />
              </View>
              {results.length ? (
                <View style={styles.chips}>
                  {results.map((team) => (
                    <Pressable
                      key={team.id}
                      accessibilityRole="button"
                      onPress={() => {
                        haptic.select()
                        setTyped('')
                        change([
                          ...teams,
                          {
                            id: team.id,
                            name: team.name,
                            sportId: team.sportId
                          }
                        ])
                      }}
                      style={[styles.chip, { backgroundColor: palette.mark }]}
                    >
                      <Text
                        style={[
                          text(14, 'SemiBold', 1.2),
                          { color: palette.ink }
                        ]}
                      >
                        {team.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : query.length >= 2 && found.isFetched ? (
                <Text
                  style={[text(13.5, 'Regular', 1.4), { color: palette.muted }]}
                >
                  Nenhum time com esse nome.
                </Text>
              ) : null}
            </>
          )}
          {problem ? (
            <Text
              accessibilityRole="alert"
              style={[text(13.5, 'SemiBold', 1.4), { color: palette.live }]}
            >
              {problem}
            </Text>
          ) : null}
        </View>
      </OwnerCard>
    </>
  )
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5
  }
})
