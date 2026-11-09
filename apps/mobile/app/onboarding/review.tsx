import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { useExploreState } from '@/components/explore-state'
import { ErrorText, haptic } from '@/components/motion'
import { AcidButton, ObPage, ObTitle } from '@/components/ob-frame'
import {
  clearDraft,
  OnboardingCard,
  type Team,
  useOnboarding
} from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, LIVE, Text, text } from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * 5 · "Confere e valida" (rodada 2 do redesign, tela 4b "Revisão"): a
 * carteirinha inteira e uma linha por escolha, cada uma com "Trocar" (volta
 * ao passo; o "Continuar" de lá devolve aqui). O aviso do jogo dos seus times
 * já vem ligado (é o que os times escolhidos dão em Avisos). O botão é de
 * segurar (`AcidButton hold`): cheio, o envio único (`completeFan`) e a
 * carteirinha validada (`pronto`).
 */

/** "Flamengo · GPs de Las Vegas e do Catar". */
function teamsLine(teams: Team[]) {
  const names = teams.filter((t) => t.kind !== 'race').map((t) => t.name)
  const gps = teams
    .filter((t) => t.kind === 'race')
    .map((t) => t.name.replace(/^GP /, ''))
  const gpLine = gps.length
    ? `${gps.length === 1 ? 'GP' : 'GPs'} ${gps.length === 1 ? gps[0] : `${gps.slice(0, -1).join(', ')} e ${gps[gps.length - 1]}`}`
    : ''
  return [...names, gpLine].filter(Boolean).join(' · ')
}

function Row({
  icon,
  title,
  sub,
  first,
  right
}: {
  icon: 'tv' | 'fan' | 'pin' | 'bell'
  title: string
  sub: string
  first?: boolean
  right: React.ReactNode
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.row,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.line
        }
      ]}
    >
      <Icon name={icon} size={20} color={palette.ink} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(15, 'SemiBold', 1.25), { color: palette.ink }]}>
          {title}
        </Text>
        <Text
          style={[
            text(12.5, 'Regular', 1.3),
            { color: palette.muted, marginTop: 2 }
          ]}
        >
          {sub}
        </Text>
      </View>
      {right}
    </View>
  )
}

export default function Review() {
  const router = useRouter()
  const palette = usePalette()
  const { choices } = useOnboarding()
  const { device, district } = useExploreState()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const near = device ?? choices.city
  const count = useQuery({
    ...trpc.pubs.countTodayNear.queryOptions({
      lat: near?.lat ?? 0,
      lng: near?.lng ?? 0,
      radiusKm: choices.radius
    }),
    enabled: Boolean(near)
  })
  const complete = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        haptic.success()
        clearDraft()
        await refreshSession()
        await queryClient.invalidateQueries()
        router.replace('/onboarding/pronto')
      },
      onError: () => haptic.error()
    })
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
  // "Trocar" volta ao passo; o "Continuar" de lá devolve aqui.
  const change = (route: 'sports' | 'teams' | 'distance') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Trocar ${route === 'sports' ? 'esportes' : route === 'teams' ? 'times' : 'distância'}`}
      hitSlop={10}
      onPress={() =>
        router.push({
          pathname: `/onboarding/${route}`,
          params: { volta: '1' }
        })
      }
    >
      <Text style={[text(13, 'SemiBold'), styles.link, { color: palette.ink }]}>
        Trocar
      </Text>
    </Pressable>
  )
  const place = (device && district) || choices.city?.name
  // Na ordem em que a pessoa escolheu.
  const sportNames = choices.sportIds.flatMap(
    (id) => sports.data?.find((sport) => sport.id === id)?.name ?? []
  )
  const n = count.data?.bars

  return (
    <ObPage
      step={5}
      note="Segure o botão: o selo carimba a carteirinha"
      cta={
        <AcidButton
          hold
          label={complete.isPending ? 'Validando…' : 'Segure para validar'}
          busy={complete.isPending}
          disabled={choices.sportIds.length === 0}
          onPress={save}
        />
      }
    >
      <OnboardingCard lit={null} radius base />
      <ObTitle plain="Confere" hot="e valida" size={30} />
      <View
        style={[
          styles.list,
          { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Row
          first
          icon="tv"
          title={sportNames.join(' · ') || 'Nenhum esporte'}
          sub="os outros esportes aparecem depois"
          right={change('sports')}
        />
        <Row
          icon="fan"
          title={teamsLine(choices.teams) || 'Nenhum time por enquanto'}
          sub="avisamos quando um bar perto marcar"
          right={change('teams')}
        />
        <Row
          icon="pin"
          title={`${choices.radius} km${place ? ` de ${place}` : ''}`}
          sub={
            n === undefined
              ? 'o raio do Explorar'
              : `${n} ${n === 1 ? 'bar' : 'bares'} com jogo hoje no raio`
          }
          right={change('distance')}
        />
        {choices.teams.length ? (
          <Row
            icon="bell"
            title="Aviso do jogo dos seus times"
            sub="quando um bar perto marcar"
            right={
              <View
                accessible
                accessibilityRole="switch"
                accessibilityState={{ checked: true }}
                accessibilityLabel="Aviso ligado"
                style={styles.switch}
              >
                <View style={styles.knob} />
              </View>
            }
          />
        ) : null}
      </View>
      {choices.sportIds.length === 0 ? (
        <Text
          style={[text(13.5), { color: palette.muted, textAlign: 'center' }]}
        >
          Volte e escolha pelo menos um esporte.
        </Text>
      ) : null}
      {complete.error ? (
        <ErrorText style={[text(13.5), { color: LIVE, textAlign: 'center' }]}>
          {complete.error.message || 'Não foi possível salvar. Tente de novo.'}
        </ErrorText>
      ) : null}
    </ObPage>
  )
}

const styles = StyleSheet.create({
  list: {
    borderRadius: 20,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    minHeight: 52
  },
  link: { textDecorationLine: 'underline' },
  switch: {
    width: 51,
    height: 31,
    borderRadius: 16,
    backgroundColor: ACID,
    borderWidth: 1,
    borderColor: INK
  },
  knob: {
    position: 'absolute',
    left: 21,
    top: 1,
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: INK
  }
})
