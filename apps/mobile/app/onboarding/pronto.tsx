import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Photo } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { cardNumber, FanCard } from '@/components/fan-card'
import { sportMark } from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import { BlockButton, Icon, Text, text, useStatusBar } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime, SAO_PAULO } from '@/lib/explore'
import { distance, gameRow } from '@/lib/explore-board'
import { trpc } from '@/lib/trpc'

/*
 * A carteirinha validada (rodada 2 do redesign, fim do onboarding B): o selo
 * carimbado, o número e "Hoje pra você", os jogos de hoje dos times e
 * esportes escolhidos nos bares perto. Sem jogo, "Nada marcado pros seus
 * times ainda" e o aviso ligado; nada some e nada mostra zero.
 */

const SINCE = new Date()
  .toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
  .replace('.', '')
  .replace(' de ', ' ')
  .toLocaleUpperCase('pt-BR')

export default function Pronto() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const user = authClient.useSession().data?.user
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
  const radius = user?.searchRadiusKm ?? 3
  const [now] = useState(() => Date.now())
  const board = useQuery(
    trpc.pubs.gameBoard.queryOptions({
      lat: center.lat,
      lng: center.lng,
      radiusKm: radius,
      day: brasiliaDay(now)
    })
  )

  const teamNames = (teams.data ?? []).map((team) => team.name)
  const sportSlugs = (prefs.data ?? []).map((pref) => pref.sport.slug)
  // Os jogos dos times primeiro; depois os dos esportes; até três.
  const row = gameRow(board.data?.games ?? [], null, now)
  const mine = [
    ...row.filter((game) =>
      teamNames.some((name) => game.title.includes(name))
    ),
    ...row.filter(
      (game) =>
        sportSlugs.includes(game.sport.slug) &&
        !teamNames.some((name) => game.title.includes(name))
    )
  ].slice(0, 3)

  const finish = () => {
    if (router.canDismiss()) router.dismissAll()
    router.replace('/explore')
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 }
        ]}
      >
        <FanCard
          name={user?.name ?? 'Torcedor'}
          teams={teamNames}
          sports={(prefs.data ?? []).map((pref) => sportMark(pref.sport.name))}
          radius={radius}
          base={(device && district) || city.data?.name || null}
          validated
          number={user ? cardNumber(user.id) : undefined}
          since={SINCE}
        />
        {mine.length ? (
          <>
            <Text style={[styles.kicker, { color: palette.muted }]}>
              HOJE PRA VOCÊ
            </Text>
            <View style={[styles.list, { backgroundColor: palette.card }]}>
              {mine.map((game, i) => {
                const bar = game.bars[0]
                return (
                  <Pressable
                    key={game.key}
                    accessibilityRole="button"
                    onPress={() => {
                      if (!bar) return
                      if (router.canDismiss()) router.dismissAll()
                      router.replace('/explore')
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
                    <View style={{ width: 56 }}>
                      <Text
                        style={[
                          styles.time,
                          { color: game.live ? palette.live : palette.ink }
                        ]}
                      >
                        {formatTime(game.startsAt)}
                      </Text>
                      <Text style={[styles.mono10, { color: palette.muted }]}>
                        {game.live ? 'AO VIVO' : 'HOJE'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[text(15, 'Bold', 1.25), { color: palette.ink }]}
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
            <View style={[styles.empty, { backgroundColor: palette.card }]}>
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                NADA MARCADO PROS SEUS TIMES AINDA
              </Text>
              <Text
                style={[text(13.5, 'Regular', 1.45), { color: palette.muted }]}
              >
                Assim que um bar até {radius} km marcar jogo
                {teamNames.length
                  ? ` do ${teamNames.join(', ')}`
                  : ' dos seus esportes'}
                , ele aparece em Avisos e no topo do Explorar.
              </Text>
            </View>
            {teamNames.length ? (
              <View style={[styles.note, { backgroundColor: palette.card }]}>
                <Icon name="bell" size={16} color={palette.ink} />
                <Text
                  style={[
                    text(13, 'Regular', 1.4),
                    { color: palette.ink, flex: 1 }
                  ]}
                >
                  <Text style={text(13, 'Bold', 1.4)}>Aviso ligado</Text> para
                  {` ${teamNames.join(', ')}`}. Dá para desligar em
                  Preferências.
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <BlockButton
          label={mine.length ? 'Ver os bares de hoje' : 'Ver bares perto'}
          onPress={finish}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 18, gap: 16 },
  kicker: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, marginTop: 4 },
  list: { borderRadius: 20, paddingHorizontal: 14 },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12
  },
  time: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 16,
    fontVariant: ['tabular-nums']
  },
  mono10: { fontFamily: 'GeistMono-SemiBold', fontSize: 10 },
  photo: { width: 44, height: 44, borderRadius: 10 },
  empty: { borderRadius: 20, padding: 16, gap: 8 },
  emptyTitle: { fontFamily: 'Anton', fontSize: 22, marginVertical: -5 },
  note: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 16,
    padding: 14,
    alignItems: 'flex-start'
  },
  footer: { position: 'absolute', left: 18, right: 18, bottom: 0 }
})
