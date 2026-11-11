import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  OwnerCard,
  OwnerLabel,
  OwnerRow,
  ownerText,
  StateTag
} from '@/components/bar-owner'
import { dayLabel } from '@/components/explore'
import { useNavInsets } from '@/components/layout'
import { usePalette } from '@/components/theme'
import { ErrorState, Text, text, useStatusBar } from '@/components/ui'
import { gameState } from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * Jogos (rodada 10, tela 3, 3j): por enquanto a agenda dos próximos jogos,
 * por dia. A semana com os pontos, a procura de cada jogo, arrastar para
 * duplicar e editar e o "Novo jogo" chegam na fase 3 da rodada.
 */

export default function Jogos() {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const nav = useNavInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const now = Date.now()
  const upcoming = (events.data ?? []).filter(
    (game) => gameState(game, now) !== 'ended'
  )
  // Agrupados pelo dia ("hoje", "sáb, 14 nov").
  const days = new Map<string, typeof upcoming>()
  for (const game of upcoming) {
    const key = dayLabel(game.startsAt, now)
    days.set(key, [...(days.get(key) ?? []), game])
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + 18,
        paddingBottom: nav.bottom + 32,
        paddingLeft: 16 + nav.left,
        paddingRight: 16 + nav.right,
        gap: 14
      }}
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: palette.ink }]}
      >
        Jogos
      </Text>
      {events.isError ? (
        <ErrorState
          title="Não deu para carregar seus jogos."
          error={events.error}
          onRetry={() => events.refetch()}
          retrying={events.isFetching}
        />
      ) : upcoming.length === 0 ? (
        <Text style={[text(15, 'Regular', 1.45), { color: palette.muted }]}>
          {events.isPending
            ? 'Carregando…'
            : 'Nenhum jogo marcado. Publique o próximo pelo painel do bar em onside.sh.'}
        </Text>
      ) : (
        [...days].map(([day, games]) => (
          <View key={day} style={{ gap: 10 }}>
            <OwnerLabel>{day}</OwnerLabel>
            <OwnerCard>
              {games.map((game, index) => (
                <OwnerRow key={game.id} first={index === 0}>
                  <Text style={[styles.time, { color: palette.muted }]}>
                    {formatTime(game.startsAt)}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={[ownerText.name, { color: palette.ink }]}
                    >
                      {gameTitle(game)}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[ownerText.line, { color: palette.muted }]}
                    >
                      {game.championship}
                    </Text>
                  </View>
                  <StateTag state={gameState(game, now)} />
                </OwnerRow>
              ))}
            </OwnerCard>
          </View>
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  title: {
    fontFamily: 'Anton',
    fontSize: 46,
    textTransform: 'uppercase',
    marginVertical: -11,
    marginBottom: -4
  },
  time: {
    width: 64,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 19,
    fontVariant: ['tabular-nums']
  }
})
