import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { F1_TRACKS } from '@findsports_oficial/db/f1-tracks'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { dayLabel } from '@/components/explore'
import { haptic } from '@/components/motion'
import { AcidButton, NoteStrong, ObPage, ObTitle } from '@/components/ob-frame'
import {
  OnboardingCard,
  type Team,
  useEditing,
  useOnboarding
} from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import {
  ACID,
  FG,
  Icon,
  INK,
  SUB,
  Text,
  TextInput,
  text
} from '@/components/ui'
import { formatTime } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * 3 · Times do onboarding B (rodada 2 do redesign): a carteirinha com "Torce
 * para" aceso, a busca e a lista dos times dos esportes escolhidos, cada um
 * com o próximo jogo nos bares e quantos na semana (`pubs.onboardingHints`).
 * A F1 vem por GP (WEB-520), em blocos com o traçado da pista e a data, só os
 * que ainda vão correr. Sem busca, os escolhidos e os em destaque do
 * catálogo; com busca, o catálogo inteiro. Quem não acha sugere.
 */

/** Linhas de time sem busca: os escolhidos e os em destaque, até aqui. */
const SHOWN = 6

const CALENDAR = Object.entries(F1_TRACKS)

/** "Flamengo e 2 GPs", "3 times", "2 GPs". */
function countLabel(teams: Team[]) {
  const races = teams.filter((team) => team.kind === 'race').length
  const others = teams.filter((team) => team.kind !== 'race')
  const gps = `${races} ${races === 1 ? 'GP' : 'GPs'}`
  if (!others.length) return gps
  const names =
    others.length === 1
      ? (others[0]?.name ?? '')
      : `${others.length} ${others.every((t) => t.kind === 'athlete') ? 'atletas' : 'times'}`
  return races ? `${names} e ${gps}` : names
}

/** "× Palmeiras": o adversário, do título "Flamengo × Palmeiras". */
function opponent(title: string, team: string) {
  const sides = title.split(' × ')
  if (sides.length !== 2) return title
  return `× ${sides[0] === team ? sides[1] : sides[0]}`
}

function TeamRow({
  name,
  line,
  quiet,
  on,
  first,
  onPress
}: {
  name: string
  line: string
  quiet: boolean
  on: boolean
  first: boolean
  onPress: () => void
}) {
  const palette = usePalette()
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
        styles.row,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.line
        }
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(15.5, 'Bold', 1.2), { color: palette.ink }]}
        >
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.rowLine, { color: palette.muted }]}
        >
          {quiet ? line : line}
        </Text>
      </View>
      <View
        style={[styles.toggle, { backgroundColor: on ? ACID : palette.mark }]}
      >
        <Icon
          name={on ? 'check' : 'plus'}
          size={18}
          color={on ? INK : palette.ink}
        />
      </View>
    </Pressable>
  )
}

function RaceBlock({
  track,
  date,
  on,
  onPress
}: {
  track: { gp: string; d: string }
  date: string
  on: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`GP ${track.gp}, ${date}`}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[
        styles.gp,
        {
          backgroundColor: on ? palette.ink : palette.card,
          shadowColor: palette.drop
        }
      ]}
    >
      <Svg width={44} height={44} viewBox="0 0 24 24">
        <Path
          d={track.d}
          fill="none"
          stroke={on ? ACID : palette.ink}
          strokeWidth={1.7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.gpName, { color: on ? palette.bg : palette.ink }]}
      >
        {track.gp.toLocaleUpperCase('pt-BR')}
      </Text>
      <Text
        style={[
          styles.gpDate,
          { color: on ? palette.bg : palette.muted, opacity: on ? 0.7 : 1 }
        ]}
      >
        {date}
      </Text>
      {on ? (
        <View style={styles.gpCheck}>
          <Icon name="check" size={12} color={INK} />
        </View>
      ) : null}
    </Pressable>
  )
}

/** "21 nov": a data do GP no calendário. */
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC'
    })
    .replace('.', '')
    .replace(' de ', ' ')

export default function Teams() {
  const router = useRouter()
  const palette = usePalette()
  const { choices, set } = useOnboarding()
  const edit = useEditing()
  // Veio do "Trocar" da revisão: "Continuar" devolve para lá.
  const { volta } = useLocalSearchParams<{ volta?: string }>()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const searching = query.length >= 2

  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const f1 = sports.data?.find((sport) => sport.slug === 'formula-1')
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
    enabled: searching,
    placeholderData: (previous) => previous
  })
  const all = featured.flatMap((list) => list.data ?? [])
  const races = all.filter((team) => team.kind === 'race')

  const selected = (id: string) => choices.teams.some((team) => team.id === id)
  const toggle = (team: Team) =>
    set({
      teams: selected(team.id)
        ? choices.teams.filter((chosen) => chosen.id !== team.id)
        : [...choices.teams, team]
    })

  // Os times da lista: com busca, o catálogo; sem, os escolhidos primeiro,
  // depois os que têm jogo marcado nos bares e o resto dos em destaque, sem
  // GP (eles vêm em blocos).
  // Os escolhidos de antes (voltando ao passo) vêm primeiro; escolher agora
  // não muda nada de lugar (dezenas de toques: só a cor).
  const [before] = useState(() =>
    choices.teams.filter((team) => team.kind !== 'race')
  )
  const chosenRows = [
    ...before,
    ...choices.teams.filter(
      (team) => team.kind !== 'race' && !before.some((b) => b.id === team.id)
    )
  ]
  // Na busca entra tudo do catálogo, GP também ("las vegas"); sem busca, os
  // GPs ficam nos blocos de baixo.
  const pool = searching
    ? (results.data ?? [])
    : all.filter((team) => team.kind !== 'race')
  const hints = useQuery(
    trpc.pubs.onboardingHints.queryOptions({
      teamIds: [...chosenRows, ...pool, ...races]
        .map((team) => team.id)
        .filter((id, i, list) => list.indexOf(id) === i)
        .slice(0, 60)
    })
  )
  const hint = (id: string) =>
    hints.data?.teams.find((team) => team.teamId === id)
  const rows = searching
    ? pool
    : [
        ...before,
        // Escolhido pela busca, que não está entre os em destaque.
        ...chosenRows.filter(
          (team) =>
            !before.some((b) => b.id === team.id) &&
            !pool.some((p) => p.id === team.id)
        ),
        ...pool
          .filter((team) => !before.some((c) => c.id === team.id))
          .sort(
            (a, b) => Number(Boolean(hint(b.id))) - Number(Boolean(hint(a.id)))
          )
      ].slice(0, Math.max(SHOWN, chosenRows.length))
  const now = Date.now()
  const line = (team: Team) => {
    const h = hint(team.id)
    if (!h) return 'sem jogo marcado nos bares'
    // "hoje", "amanhã", "qua": o dia curto, como no desenho.
    const day = dayLabel(h.next.startsAt, now)
      .split(',')[0]
      ?.replace('.', '')
      .toLocaleLowerCase('pt-BR')
    return `${day} ${formatTime(h.next.startsAt)} ${opponent(h.next.title, team.name)} · ${h.games} na semana`
  }
  // Os GPs que ainda vão correr, na ordem do calendário.
  const today = brasiliaDay(now)
  const upcoming = CALENDAR.filter(([, track]) => track.date >= today)
    .map(([key, track]) => ({
      team: races.find((race) => race.catalogKey === key),
      track
    }))
    .filter((item) => item.team)
  const chosenRaces = choices.teams.filter(
    (team) => team.kind === 'race'
  ).length
  const anyGame = Boolean(hints.data?.teams.length)
  const next = () =>
    volta ? router.back() : router.push('/onboarding/location')

  return (
    <ObPage
      step={3}
      progress={!edit.editing}
      onSkip={edit.editing || volta ? undefined : next}
      note={
        choices.teams.length ? (
          <>
            <NoteStrong>{countLabel(choices.teams)}</NoteStrong> · dos seus
            esportes
          </>
        ) : hints.data && !anyGame ? (
          'Avisamos quando um bar marcar jogo deles'
        ) : undefined
      }
      cta={
        edit.editing ? (
          <AcidButton
            label={edit.saving ? 'Salvando…' : 'Salvar'}
            disabled={!edit.ready || edit.saving}
            onPress={() => edit.save().catch(() => {})}
          />
        ) : (
          <AcidButton label="Continuar" onPress={next} />
        )
      }
    >
      {edit.editing ? null : <OnboardingCard lit="teams" />}
      <ObTitle plain="E pra quem" hot="torce?" size={32} />
      <View
        style={[
          styles.search,
          { backgroundColor: palette.card, borderColor: palette.line }
        ]}
      >
        <Icon name="search" size={20} color={palette.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={
            f1 && choices.sportIds.includes(f1.id)
              ? 'Time, seleção ou GP'
              : 'Time ou seleção'
          }
          placeholderTextColor={palette.muted}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: palette.ink }]}
        />
      </View>
      {rows.length ? (
        <View
          style={[
            styles.list,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          {rows.map((team, index) => (
            <TeamRow
              key={team.id}
              name={team.name}
              line={line(team)}
              quiet={!hint(team.id)}
              on={selected(team.id)}
              first={index === 0}
              onPress={() => toggle(team)}
            />
          ))}
        </View>
      ) : searching && results.data ? (
        <Text style={[text(14), { color: SUB }]}>Nada com “{query}”.</Text>
      ) : null}
      {upcoming.length && !searching ? (
        <View style={{ gap: 10 }}>
          <View style={styles.gpHead}>
            <Text style={[styles.gpLabel, { color: palette.muted }]}>
              FÓRMULA 1 · POR GP
            </Text>
            <Text style={[styles.gpLabel, { color: palette.muted }]}>
              {chosenRaces
                ? `${chosenRaces} ${chosenRaces === 1 ? 'ESCOLHIDO' : 'ESCOLHIDOS'}`
                : hints.data && !races.some((race) => hint(race.id))
                  ? 'NENHUM BAR MARCOU AINDA'
                  : ''}
            </Text>
          </View>
          <View style={styles.gps}>
            {upcoming.map(({ team, track }) =>
              team ? (
                <View key={team.id} style={styles.gpCell}>
                  <RaceBlock
                    track={track}
                    date={shortDate(track.date)}
                    on={selected(team.id)}
                    onPress={() => toggle(team)}
                  />
                </View>
              ) : null
            )}
          </View>
        </View>
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
    </ObPage>
  )
}

const styles = StyleSheet.create({
  search: {
    height: 50,
    borderRadius: 24,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18
  },
  searchInput: { flex: 1, fontFamily: 'Archivo-SemiBold', fontSize: 17 },
  list: {
    borderRadius: 22,
    paddingHorizontal: 14,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  rowLine: { fontFamily: 'GeistMono-SemiBold', fontSize: 12, marginTop: 2 },
  toggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gpHead: { flexDirection: 'row', justifyContent: 'space-between' },
  gpLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88
  },
  gps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gpCell: { width: '31.6%' },
  gp: {
    borderRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 9,
    gap: 4,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  gpName: {
    fontFamily: 'Anton',
    fontSize: 22,
    letterSpacing: -0.22,
    marginVertical: -5
  },
  gpDate: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  gpCheck: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})

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
