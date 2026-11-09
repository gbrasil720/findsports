import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DayRow } from '@/components/explore-board'
import { haptic } from '@/components/motion'
import { AcidButton } from '@/components/ob-frame'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  Text,
  TextInput,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { bySportOrder, sportChip } from '@/lib/onboarding'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * "Do que você gosta?" (rodada 2 do redesign, tela 3): esportes, times e raio
 * numa tela, tudo opcional, depois da primeira ação de uma conta nova. "Salvar"
 * e "Depois" chamam `onboarding.completeFan`, que aceita vir vazio: o app não
 * pede o onboarding de 5 passos de novo. A mesma tela do web
 * (`/dashboard/bem-vindo`).
 */

const RADII = [1, 3, 5, 10]

type Team = { id: string; name: string }

export default function Gostos() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const { tag } = useLocalSearchParams<{ tag?: string }>()
  const [sportIds, setSportIds] = useState<string[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [radius, setRadius] = useState(3)
  const [searching, setSearching] = useState(false)
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), 200)
    return () => clearTimeout(timer)
  }, [typed])

  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const featured = useQueries({
    queries: sportIds.map((sportId) =>
      trpc.pubs.getTeamsBySport.queryOptions({ sportId })
    )
  })
  const found = useQuery({
    ...trpc.pubs.searchTeams.queryOptions({ sportIds, query }),
    enabled: searching && query.length >= 2
  })
  // A lista não muda de ordem ao escolher (dezenas de toques: só a cor);
  // o escolhido que veio da busca entra no fim.
  const listed = (
    searching && query.length >= 2
      ? (found.data ?? [])
      : featured.flatMap((q) => q.data ?? [])
  ).slice(0, 12)
  const shownTeams: Team[] = [
    ...listed,
    ...teams.filter((team) => !listed.some((t) => t.id === team.id))
  ]

  const save = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        haptic.success()
        await refreshSession()
        await queryClient.invalidateQueries()
        router.back()
      }
    })
  )
  const later = () => save.mutate({})

  const chip = (on: boolean) => [
    styles.chip,
    { backgroundColor: on ? palette.ink : palette.mark }
  ]
  const chipText = (on: boolean) => [
    text(14, 'SemiBold', 1.2),
    { color: on ? palette.bg : palette.ink }
  ]

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.sheet }}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {tag ? (
        <View style={styles.tag}>
          <Icon name="check" size={13} color={INK} />
          <Text style={[text(12, 'Bold', 1.2), { color: INK }]}>{tag}</Text>
        </View>
      ) : null}
      <Title
        lines={[['Do que você'], ['', 'gosta?']]}
        size={44}
        color={palette.ink}
        accentColor={palette.dark ? ACID : palette.live}
      />
      <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
        Assim os jogos e os bares que importam pra você aparecem primeiro. Tudo
        opcional.
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
          Esportes
        </Text>
        <View style={styles.chips}>
          {bySportOrder(sports.data ?? []).map((sport) => {
            const on = sportIds.includes(sport.id)
            return (
              <Pressable
                key={sport.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select()
                  setSportIds(
                    on
                      ? sportIds.filter((id) => id !== sport.id)
                      : [...sportIds, sport.id]
                  )
                }}
                style={chip(on)}
              >
                <Text style={chipText(on)}>{sportChip(sport)}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
          Seus times
        </Text>
        <Text
          style={[
            text(13, 'Regular', 1.35),
            { color: palette.muted, marginTop: -6 }
          ]}
        >
          Avisamos quando um bar perto passar o jogo deles.
        </Text>
        {searching ? (
          <TextInput
            autoFocus
            value={typed}
            onChangeText={setTyped}
            placeholder="Nome do time"
            placeholderTextColor={palette.muted}
            style={[
              styles.search,
              { color: palette.ink, backgroundColor: palette.bg }
            ]}
          />
        ) : null}
        <View style={styles.chips}>
          {shownTeams.map((team) => {
            const on = teams.some((t) => t.id === team.id)
            return (
              <Pressable
                key={team.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  haptic.select()
                  setTeams(
                    on
                      ? teams.filter((t) => t.id !== team.id)
                      : [...teams, { id: team.id, name: team.name }]
                  )
                }}
                style={chip(on)}
              >
                <Text style={chipText(on)}>{team.name}</Text>
              </Pressable>
            )
          })}
          {searching ? null : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setSearching(true)}
              style={chip(false)}
            >
              <Icon name="search" size={14} color={palette.ink} />
              <Text style={chipText(false)}>Buscar</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
          Até onde você vai
        </Text>
        <DayRow
          days={RADII.map((km) => ({ day: String(km), label: `${km} km` }))}
          value={String(radius)}
          onChange={(km) => setRadius(Number(km))}
          stretch
        />
      </View>

      <AcidButton
        label={save.isPending ? 'Salvando…' : 'Salvar'}
        busy={save.isPending}
        onPress={() =>
          save.mutate({
            sportIds,
            teamIds: teams.map((team) => team.id),
            searchRadiusKm: radius
          })
        }
      />
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={later}
        style={{ alignSelf: 'center' }}
      >
        <Text style={[text(14.5, 'SemiBold'), { color: palette.ink }]}>
          Depois
        </Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, gap: 16 },
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: ACID
  },
  // `.box2`: raio 22, sombra dura de 3, 10 entre as linhas.
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 10,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  search: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontFamily: 'Archivo-Regular',
    fontSize: 15
  }
})
