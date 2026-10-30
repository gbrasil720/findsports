import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { Image, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from '@/components/glass'
import { Text } from '@/components/text'
import { ACID, PAPER } from '@/components/theme'
import { formatTime } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * A marca das telas de entrar e de conta fora do celular (a08 do design,
 * WEB-491): a foto do bar, "O jogo começa aqui." e os jogos de hoje
 * (`pubs.todayGames`, pública, a mesma da splash). Ao lado do formulário no
 * tablet deitado e no dobrável aberto (`column`); em cima dele, no tablet em pé.
 * Sem jogo hoje, só a frase. O servidor não conta bares por jogo, então a
 * contagem "5 bares" do design não entra.
 */

export function AuthBrand({ column }: { column?: boolean }) {
  const insets = useSafeAreaInsets()
  const games = useQuery({
    ...trpc.pubs.todayGames.queryOptions(),
    retry: false
  }).data?.slice(0, column ? 4 : 3)
  const size = column ? 84 : 64
  const headline = {
    fontSize: size,
    letterSpacing: -0.02 * size,
    marginVertical: -0.2425 * size
  }
  return (
    <View style={styles.fill}>
      <Image
        source={require('../assets/images/intro/bar.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          'rgba(18,18,15,.55)',
          'rgba(18,18,15,.15)',
          'rgba(18,18,15,.85)'
        ]}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.content,
          column ? styles.contentColumn : styles.contentBand,
          { paddingTop: insets.top + (column ? 16 : 22) }
        ]}
      >
        <Image
          source={require('../assets/images/brand/wordmark-light.png')}
          accessibilityLabel="Onside"
          style={{
            height: column ? 32 : 28,
            width: ((column ? 32 : 28) * 845) / 256
          }}
        />
        <View style={{ gap: column ? 18 : 16 }}>
          {/* Linhas em Anton com a margem negativa do `Title`: sem ela a
              altura natural da fonte abriria um vão entre as linhas. */}
          <View accessible accessibilityRole="header">
            {(column
              ? [['O jogo'], ['começa ', 'aqui.']]
              : [['O jogo começa ', 'aqui.']]
            ).map(([plain, accent]) => (
              <Text
                key={plain}
                maxFontSizeMultiplier={1}
                style={[styles.headline, headline]}
              >
                {plain}
                {accent ? <Text style={{ color: ACID }}>{accent}</Text> : null}
              </Text>
            ))}
          </View>
          {games?.length && column ? (
            <Text style={styles.lead}>Hoje perto de você</Text>
          ) : null}
          {games?.length ? (
            <View style={column ? styles.rows : styles.pills}>
              {games.map((game, index) => (
                <Glass
                  key={`${game.title}-${game.startsAt}`}
                  tone="dark"
                  tint={index === 0 ? 'rgba(232,50,12,.55)' : undefined}
                  style={column ? styles.row : styles.pill}
                >
                  <Text style={[styles.time, column && { fontSize: 24 }]}>
                    {formatTime(game.startsAt)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.game, column && { flex: 1, fontSize: 15 }]}
                  >
                    {game.title}
                  </Text>
                </Glass>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#2a2a25', overflow: 'hidden' },
  content: { flex: 1, justifyContent: 'space-between' },
  contentColumn: { paddingHorizontal: 40, paddingBottom: 40 },
  contentBand: { paddingHorizontal: 40, paddingBottom: 58 },
  headline: {
    fontFamily: 'Anton',
    textTransform: 'uppercase',
    color: PAPER
  },
  lead: { fontFamily: 'Archivo-Regular', fontSize: 16, color: '#d6d3cb' },
  rows: { gap: 8, maxWidth: 440 },
  row: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden'
  },
  pills: { flexDirection: 'row', gap: 8, overflow: 'hidden' },
  pill: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    overflow: 'hidden'
  },
  time: { fontFamily: 'Anton', fontSize: 20, color: PAPER },
  game: {
    fontFamily: 'Archivo-Bold',
    fontSize: 13.5,
    color: PAPER,
    letterSpacing: 0.3,
    flexShrink: 1
  }
})
