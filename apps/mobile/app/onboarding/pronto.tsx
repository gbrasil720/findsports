import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { dayLabel, Photo } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { cardNumber, FanCard } from '@/components/fan-card'
import { AcidButton, ObPage } from '@/components/ob-frame'
import { sportMark, useOnboarding } from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { Icon, Text, text } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime, SAO_PAULO } from '@/lib/explore'
import { distance, gameRow } from '@/lib/explore-board'
import { trpc } from '@/lib/trpc'

/*
 * A carteirinha validada (rodada 2 do redesign, fim do onboarding B): o selo
 * carimbado, o número e "Hoje pra você", os jogos de hoje dos times (e dos
 * esportes) nos bares do raio. Sem jogo, "Nada marcado pros seus times
 * ainda" e o aviso ligado: nada some e nada mostra zero.
 */

const SINCE = new Date()
  .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  .replace('.', '')
  .replace(' de ', ' ')
  .toLocaleUpperCase('pt-BR')

export default function Pronto() {
  const router = useRouter()
  const palette = usePalette()
  const user = authClient.useSession().data?.user
  // O que acabou de ser enviado vale antes do servidor: o cache das
  // preferências podia vir da abertura do app, ainda vazio.
  const { choices } = useOnboarding()
  const { device, district, localCity } = useExploreState()
  const teams = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    enabled: !!user
  })
  const prefs = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    enabled: !!user
  })
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    enabled: !!user
  })
  const center = device ?? city.data ?? localCity ?? SAO_PAULO
  const radius = choices.radius || user?.searchRadiusKm || 3
  const sportList = useQuery(trpc.pubs.getSports.queryOptions())
  const [now] = useState(() => Date.now())
  const board = useQuery(
    trpc.pubs.gameBoard.queryOptions({
      lat: center.lat,
      lng: center.lng,
      radiusKm: radius,
      day: brasiliaDay(now)
    })
  )

  const all = choices.teams.length ? choices.teams : (teams.data ?? [])
  const clubs = all.filter((team) => team.kind !== 'race').map((t) => t.name)
  const gps = all.filter((team) => team.kind === 'race').map((t) => t.name)
  const slugs = choices.sportIds.length
    ? choices.sportIds.flatMap(
        (id) => sportList.data?.find((item) => item.id === id)?.slug ?? []
      )
    : (prefs.data ?? []).map((pref) => pref.sport.slug)
  const mine = (title: string) => clubs.some((name) => title.includes(name))
  // Os jogos dos times primeiro, depois os dos esportes; até três.
  const row = gameRow(board.data?.games ?? [], null, now)
  const games = [
    ...row.filter((game) => mine(game.title)),
    ...row.filter(
      (game) => !mine(game.title) && slugs.includes(game.sport.slug)
    )
  ].slice(0, 3)
  const finish = () => {
    if (router.canDismiss()) router.dismissAll()
    router.replace('/explore')
  }
  // "do Flamengo ou um dos GPs que você escolheu".
  const who = [
    ...clubs.map((name) => `do ${name}`),
    ...(gps.length
      ? [
          gps.length === 1
            ? 'do GP que você escolheu'
            : 'de um dos GPs que você escolheu'
        ]
      : [])
  ]
  // "o Flamengo e os GPs de Las Vegas e do Catar".
  const gpNames = gps.map((name) => name.replace(/^GP /, ''))
  const alerted = [
    ...clubs.map((name) => `o ${name}`),
    ...(gpNames.length === 1
      ? [`o GP ${gpNames[0]}`]
      : gpNames.length
        ? [
            `os GPs ${gpNames.slice(0, -1).join(', ')} e ${gpNames[gpNames.length - 1]}`
          ]
        : [])
  ]

  return (
    <ObPage
      step={5}
      back={false}
      cta={
        <AcidButton
          label={games.length ? 'Ver os bares de hoje' : 'Ver bares perto'}
          onPress={finish}
        />
      }
    >
      <FanCard
        name={user?.name ?? 'Torcedor'}
        teams={clubs}
        sports={
          choices.sportIds.length
            ? choices.sportIds.flatMap((id) => {
                const sport = sportList.data?.find((item) => item.id === id)
                return sport ? [sportMark(sport.name)] : []
              })
            : (prefs.data ?? []).map((pref) => sportMark(pref.sport.name))
        }
        radius={`${radius} km`}
        base={(device && district) || city.data?.name || null}
        validated
        number={user ? cardNumber(user.id) : undefined}
        since={SINCE}
      />
      {games.length ? (
        <>
          <Text style={[styles.kicker, { color: palette.muted }]}>
            HOJE PRA VOCÊ
          </Text>
          <View
            style={[
              styles.list,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            {games.map((game, i) => {
              const bar = game.bars[0]
              return (
                <Pressable
                  key={game.key}
                  accessibilityRole="button"
                  onPress={() => {
                    if (!bar) return
                    finish()
                    router.push({
                      pathname: '/bar/[id]',
                      params: { id: bar.barId }
                    })
                  }}
                  style={[
                    styles.game,
                    i > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: palette.line
                    }
                  ]}
                >
                  <View style={{ width: 54 }}>
                    <Text style={[styles.time, { color: palette.ink }]}>
                      {formatTime(game.startsAt)}
                    </Text>
                    <Text style={[styles.day, { color: palette.muted }]}>
                      {game.live
                        ? 'AO VIVO'
                        : dayLabel(game.startsAt, now)
                            .replace('.', '')
                            .toLocaleUpperCase('pt-BR')}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={[text(15, 'Bold', 1.2), { color: palette.ink }]}
                    >
                      {game.title}
                    </Text>
                    {bar ? (
                      <Text
                        numberOfLines={1}
                        style={[
                          text(12.5, 'Regular', 1.3),
                          { color: palette.muted }
                        ]}
                      >
                        {bar.name} · {distance(bar.distanceKm)}
                        {bar.going ? ` · ${bar.going.count} vão` : ''}
                      </Text>
                    ) : null}
                  </View>
                  {bar ? (
                    <Photo
                      uri={bar.photoUrl}
                      name={bar.name}
                      style={styles.photo}
                    />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        </>
      ) : board.data ? (
        <>
          <View
            style={[
              styles.empty,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            {/* Duas linhas fixas: Anton em várias linhas fica com o
                entrelinha natural, maior que o 1em do desenho. */}
            <View accessible accessibilityRole="header">
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                NADA MARCADO PROS SEUS TIMES
              </Text>
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                AINDA
              </Text>
            </View>
            <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
              Assim que um bar até {radius} km marcar jogo
              {who.length ? ` ${who.join(' ou ')}` : ' dos seus esportes'}, ele
              aparece em Avisos e no topo do Explorar.
            </Text>
          </View>
          {all.length ? (
            <View style={[styles.note, { backgroundColor: palette.mark }]}>
              <Icon name="bell" size={20} color={palette.ink} />
              <Text
                style={[
                  text(13.5, 'Regular', 1.4),
                  { color: palette.ink, flex: 1 }
                ]}
              >
                <Text style={text(13.5, 'Bold', 1.4)}>Aviso ligado</Text> para{' '}
                {alerted.join(' e ')}. Dá para desligar em Preferências.
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </ObPage>
  )
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88
  },
  list: {
    borderRadius: 22,
    paddingHorizontal: 14,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  time: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 16,
    fontVariant: ['tabular-nums']
  },
  day: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4
  },
  photo: { width: 50, height: 50, borderRadius: 12 },
  empty: {
    borderRadius: 22,
    padding: 16,
    gap: 8,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  // Anton sem `lineHeight` menor que o natural (cortava o topo).
  emptyTitle: {
    fontFamily: 'Anton',
    fontSize: 24,
    marginVertical: -5.8
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18
  }
})
