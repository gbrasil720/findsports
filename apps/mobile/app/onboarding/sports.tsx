import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { haptic } from '@/components/motion'
import { AcidButton, ObPage, ObTitle } from '@/components/ob-frame'
import {
  OnboardingCard,
  sportMark,
  useEditing,
  useOnboarding
} from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text } from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * 2 · Esportes do onboarding B (rodada 2 do redesign): a carteirinha com
 * "Assiste" aceso e os esportes em blocos de 104, com quantos jogos cada um
 * tem nos próximos 7 dias (`pubs.onboardingHints`). Sem jogo, a frase, e a
 * escolha vale igual (avisos e ordem). Tirar um esporte tira os times dele.
 */

// A ordem do design; o que não está aqui vem depois, por nome.
const ORDER = ['futebol', 'formula-1', 'basquete', 'mma-ufc', 'volei']
const rank = (slug: string) => {
  const index = ORDER.indexOf(slug)
  return index === -1 ? ORDER.length : index
}

/** "64 jogos", "GP de Las Vegas", "1 evento", ou a frase sem jogo. */
function weekLine(slug: string, games: number, next: string | null) {
  if (slug === 'formula-1')
    return games && next ? next : 'sem corrida esta semana'
  if (slug === 'mma-ufc')
    return games
      ? `${games} ${games === 1 ? 'evento' : 'eventos'}`
      : 'sem evento esta semana'
  return games
    ? `${games} ${games === 1 ? 'jogo' : 'jogos'}`
    : 'sem jogo esta semana'
}

function SportBlock({
  mark,
  name,
  line,
  quiet,
  on,
  onPress
}: {
  mark: string
  name: string
  line: string
  quiet: boolean
  on: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const fg = on ? palette.bg : palette.ink
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${name}, ${line}`}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[
        styles.block,
        {
          backgroundColor: on ? palette.ink : palette.card,
          shadowColor: on ? '#000' : palette.drop,
          shadowOffset: { width: 0, height: on ? 4 : 3 }
        }
      ]}
    >
      <Text style={[styles.mark, { color: fg }]}>{mark}</Text>
      {on ? (
        <View style={styles.check}>
          <Icon name="check" size={14} color={INK} />
        </View>
      ) : null}
      <Text numberOfLines={1} style={[text(16, 'Bold', 1.2), { color: fg }]}>
        {name}
      </Text>
      <Text
        numberOfLines={2}
        style={[
          styles.line,
          {
            color: on ? fg : palette.muted,
            opacity: on ? (quiet ? 0.52 : 0.7) : quiet ? 0.75 : 1
          }
        ]}
      >
        {line}
      </Text>
    </Pressable>
  )
}

export default function Sports() {
  const router = useRouter()
  const { choices, set } = useOnboarding()
  const edit = useEditing()
  // Veio do "Trocar" da revisão: "Continuar" devolve para lá.
  const { volta } = useLocalSearchParams<{ volta?: string }>()
  const query = useQuery(trpc.pubs.getSports.queryOptions())
  const hints = useQuery(trpc.pubs.onboardingHints.queryOptions({}))
  const sports = [...(query.data ?? [])].sort(
    (a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name)
  )
  const week = (id: string) =>
    hints.data?.sports.find((sport) => sport.sportId === id)
  const none = Boolean(hints.data) && !hints.data?.sports.length

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
  const next = () =>
    volta
      ? router.back()
      : router.push(
          edit.editing
            ? {
                pathname: '/onboarding/teams',
                params: { edit: '1', from: 'sports' }
              }
            : '/onboarding/teams'
        )

  return (
    <ObPage
      step={2}
      progress={!edit.editing}
      onSkip={
        edit.editing || volta
          ? undefined
          : () => router.push('/onboarding/teams')
      }
      // Sem jogo nenhum, a nota diz para que serve a escolha.
      note={none ? 'Vale para os avisos e para a ordem dos jogos' : undefined}
      cta={
        <AcidButton
          label="Continuar"
          disabled={choices.sportIds.length === 0}
          onPress={next}
        />
      }
    >
      {edit.editing ? null : <OnboardingCard lit="sports" />}
      <ObTitle plain="O que mais" hot="assiste?" size={32} />
      <View style={styles.grid}>
        {sports.map((sport) => {
          const hint = week(sport.id)
          return (
            <View key={sport.id} style={styles.cell}>
              <SportBlock
                mark={sportMark(sport.name)}
                name={sport.name}
                line={weekLine(
                  sport.slug,
                  hint?.games ?? 0,
                  hint?.next ?? null
                )}
                quiet={!hint?.games}
                on={choices.sportIds.includes(sport.id)}
                onPress={() => toggle(sport.id)}
              />
            </View>
          )
        })}
      </View>
    </ObPage>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '48.5%' },
  block: {
    height: 104,
    borderRadius: 20,
    padding: 14,
    justifyContent: 'flex-end',
    gap: 2,
    shadowOpacity: 1,
    shadowRadius: 0
  },
  mark: {
    position: 'absolute',
    top: 12,
    left: 14,
    fontFamily: 'Anton',
    fontSize: 26,
    letterSpacing: 0.26,
    marginVertical: -6
  },
  check: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  line: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 }
})
