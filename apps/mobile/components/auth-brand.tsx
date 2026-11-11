import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { Image, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Glass } from '@/components/glass'
import { Text } from '@/components/text'
import { ACID, PAPER } from '@/components/theme'
import { formatTime, teamMark } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * A marca das telas de entrar e de conta fora do celular (a08 do design,
 * WEB-491): a foto do bar, "O jogo começa aqui." e os jogos de hoje
 * (`pubs.todayGames`, pública, a mesma da splash). Ao lado do formulário no
 * tablet deitado e no dobrável aberto (`column`); em cima dele, no tablet em pé.
 * Sem jogo hoje, só a frase. O jogo vai em siglas ("COR × PAL"), como no
 * design, com quantos bares no ar o passam.
 */

/** "Corinthians × Palmeiras" vira "COR × PAL"; sem times, o título inteiro. */
const marks = (title: string) =>
  title.includes(' × ') ? title.split(' × ').map(teamMark).join(' × ') : title

export function AuthBrand({
  column,
  width,
  height
}: {
  column?: boolean
  /** A área da marca: o título e quantos jogos cabem saem dela (brand8, brandP8). */
  width: number
  height: number
}) {
  const insets = useSafeAreaInsets()
  const games = useQuery({
    ...trpc.pubs.todayGames.queryOptions(),
    retry: false
  }).data?.slice(
    0,
    column ? (height > 700 ? 4 : height > 420 ? 3 : 2) : width > 900 ? 4 : 3
  )
  // Coluna estreita (dobrável aberto): a versão pequena da marca (brand8).
  const big = !column || (width > 460 && height > 560)
  const size = column
    ? big
      ? width > 620
        ? 84
        : 64
      : 44
    : width > 900
      ? 72
      : width > 780
        ? 64
        : 56
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
          !big && styles.contentSmall,
          { paddingTop: insets.top + (column ? 16 : 22) }
        ]}
      >
        <Image
          source={require('../assets/images/brand/wordmark-light.png')}
          accessibilityLabel="Onside"
          style={{
            height: big ? (column ? 32 : 28) : 24,
            width: ((big ? (column ? 32 : 28) : 24) * 845) / 256
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
                  style={[
                    column ? styles.row : styles.pill,
                    !big && styles.rowSmall
                  ]}
                >
                  <Text
                    style={[styles.time, column && big && { fontSize: 24 }]}
                  >
                    {formatTime(game.startsAt)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.game,
                      column && { flex: 1, fontSize: big ? 15 : 13.5 }
                    ]}
                  >
                    {marks(game.title)}
                  </Text>
                  {game.bars ? (
                    <Text
                      style={[
                        styles.bars,
                        { color: index === 0 ? PAPER : ACID }
                      ]}
                    >
                      {game.bars} {game.bars === 1 ? 'bar' : 'bares'}
                    </Text>
                  ) : null}
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
  contentSmall: { paddingHorizontal: 24, paddingBottom: 24 },
  rowSmall: { height: 44, borderRadius: 22 },
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
  bars: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  game: {
    fontFamily: 'Archivo-Bold',
    fontSize: 13.5,
    color: PAPER,
    letterSpacing: 0.3,
    flexShrink: 1
  }
})
