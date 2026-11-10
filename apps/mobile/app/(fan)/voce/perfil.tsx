import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Photo } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { cardNumber, FanCard } from '@/components/fan-card'
import { GroupLabel, LineList } from '@/components/game-line'
import { useLayout } from '@/components/layout'
import { MedalImage } from '@/components/medal'
import { sportMark } from '@/components/onboarding'
import { useTabBarSpace } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import { Icon, Text, text, useStatusBar } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import type { MedalId } from '@/lib/medals'
import { topBars } from '@/lib/profile'
import { trpc } from '@/lib/trpc'

/*
 * Perfil (rodada 6, tela 2l): a carteirinha do onboarding inteira, o placar
 * (visitas, bares, conquistas, posição no mês), as medalhas recentes e os
 * bares mais visitados. É o que a pessoa perderia ao sair (perda percebida).
 * A engrenagem abre as Configurações; cada campo da carteirinha se edita nas
 * Preferências.
 */

export default function Profile() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const layout = useLayout()
  const state = useExploreState()
  useStatusBar('auto')
  const session = authClient.useSession()
  const user = session.data?.user
  const achievements = useQuery(trpc.achievements.mine.queryOptions())
  const visits = useQuery(trpc.attendance.visits.queryOptions())
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const teams = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const ranking = useQuery(
    trpc.ranking.friends.queryOptions({ metric: 'bars' })
  )

  const now = Date.now()
  const list = visits.data ?? []
  const medals = achievements.data?.achievements ?? []
  const unlocked = medals
    .filter((medal) => medal.unlockedAt)
    .sort((a, b) => String(b.unlockedAt).localeCompare(String(a.unlockedAt)))
  const position = ranking.data?.rows.find((row) => row.id === user?.id)
  const top = topBars(list, now)
  const since = user
    ? new Date(user.createdAt)
        .toLocaleDateString('pt-BR', {
          month: 'short',
          year: 'numeric',
          timeZone: 'America/Sao_Paulo'
        })
        .replace(' de ', ' ')
        .replace('.', '')
        .toLocaleUpperCase('pt-BR')
    : undefined
  const stats: [string, string][] = [
    [String(list.length), 'visitas'],
    [String(new Set(list.map((v) => v.barId)).size), 'bares'],
    [String(unlocked.length), 'conquistas'],
    [position ? `${position.position}º` : '—', 'no mês']
  ]
  // Fora do celular, a mesma coluna no meio (até 560).
  const column = layout.kind === 'phone' ? undefined : 560

  return (
    <ScrollView
      style={{ backgroundColor: palette.bg }}
      contentContainerStyle={[
        styles.body,
        { paddingTop: insets.top + 8, paddingBottom: tabBar + 32 },
        column ? { width: column, alignSelf: 'center' } : null
      ]}
    >
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          onPress={() =>
            router.canGoBack() ? router.back() : router.navigate('/voce')
          }
          style={[
            styles.round,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Icon name="back" size={20} color={palette.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          hitSlop={8}
          onPress={() => router.push('/configuracoes')}
          style={[
            styles.round,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Icon name="gear" size={20} color={palette.ink} />
        </Pressable>
      </View>

      <FanCard
        name={user?.name ?? 'Torcedor'}
        teams={(teams.data ?? [])
          .filter((team) => team.kind !== 'race')
          .map((team) => team.name)}
        sports={(prefs.data ?? []).map((pref) => sportMark(pref.sport.name))}
        radius={`${user?.searchRadiusKm ?? 3} km`}
        base={(state.device && state.district) || city.data?.name || null}
        validated
        number={user ? cardNumber(user.id) : undefined}
        since={since}
      />

      <View style={styles.stats}>
        {stats.map(([value, label]) => (
          <View
            key={label}
            style={[
              styles.stat,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Text style={[styles.statValue, { color: palette.ink }]}>
              {value}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.statLabel, { color: palette.muted }]}
            >
              {label.toLocaleUpperCase('pt-BR')}
            </Text>
          </View>
        ))}
      </View>

      {unlocked.length ? (
        <>
          <GroupLabel>Medalhas recentes</GroupLabel>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver as ${medals.length} conquistas`}
            onPress={() => router.navigate('/voce/conquistas')}
            style={styles.medals}
          >
            {unlocked.slice(0, 4).map((medal) => (
              <View key={medal.id} style={styles.medal}>
                <MedalImage id={medal.id as MedalId} size={56} />
              </View>
            ))}
            <Text style={[styles.more, { color: palette.muted }]}>
              ver as {medals.length}
            </Text>
          </Pressable>
        </>
      ) : null}

      {top.bars.length ? (
        <>
          <GroupLabel>Bares mais visitados</GroupLabel>
          <LineList>
            {top.bars.map((bar, i) => (
              <Pressable
                key={bar.barId}
                accessibilityRole="button"
                onPress={() => router.push(`/bar/${bar.barId}` as Href)}
                style={({ pressed }) => [
                  styles.bar,
                  i > 0 && { borderTopWidth: 1, borderTopColor: palette.line },
                  pressed && { opacity: 0.7 }
                ]}
              >
                <Photo
                  uri={bar.photoUrl}
                  name={bar.barName}
                  style={styles.photo}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={[text(15.5, 'Bold', 1.2), { color: palette.ink }]}
                  >
                    {bar.barName}
                  </Text>
                  {bar.neighborhood ? (
                    <Text
                      style={[
                        text(12.5, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {bar.neighborhood}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.times, { color: palette.ink }]}>
                    {bar.games}×
                  </Text>
                  <Text style={[styles.went, { color: palette.muted }]}>
                    FOI
                  </Text>
                </View>
              </Pressable>
            ))}
          </LineList>
        </>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 14 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    gap: 2,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  // Anton 30/1: margem negativa no lugar do entrelinha curto.
  statValue: { fontFamily: 'Anton', fontSize: 30, marginVertical: -7.3 },
  statLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.42,
    marginTop: 2
  },
  medals: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  medal: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 4 }
  },
  more: { marginLeft: 'auto', fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10
  },
  photo: { width: 52, height: 52, borderRadius: 12 },
  times: { fontFamily: 'GeistMono-SemiBold', fontSize: 14 },
  went: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6
  }
})
