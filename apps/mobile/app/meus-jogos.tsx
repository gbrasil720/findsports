import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import {
  dayLabel,
  type Palette,
  Perforation,
  Photo,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { haptic, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  PAPER,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { formatTime } from '@/lib/explore'
import {
  formatCode,
  gameTitle,
  type MyGame,
  pastLabel,
  shortDate,
  thisMonth
} from '@/lib/my-games'
import { trpc } from '@/lib/trpc'

/*
 * "Meus jogos" (3e do design): onde o torcedor marcou "Vou assistir aqui".
 * O próximo jogo vem grande, com o código do balcão (bar Elite); os outros
 * próximos, compactos; os que passaram, numa lista com o desfecho ou
 * "Avaliar". O código abre em tela cheia (3f), a avaliação no pós-jogo (3g).
 */

export default function MyGames() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  useStatusBar('auto')
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const ratings = useQuery({
    ...trpc.ratings.getPending.queryOptions(),
    meta: { errorToast: false }
  })
  const reports = useQuery({
    ...trpc.attendance.pendingReports.queryOptions(),
    meta: { errorToast: false }
  })
  const now = Date.now()
  const games = mine.data ?? []
  // O servidor manda do mais recente ao mais antigo; os próximos vão do mais
  // perto ao mais longe.
  const upcoming = games.filter((game) => !game.ended).reverse()
  const past = games.filter((game) => game.ended)
  const toRate = new Set([
    ...(ratings.data ?? []).map((item) => item.eventId),
    ...(reports.data ?? []).map((item) => item.eventId)
  ])
  const [first, ...rest] = upcoming

  // "Próximas" e "Anteriores" levam à seção, não filtram: o design mostra as
  // duas na mesma tela.
  const scroll = useRef<ScrollView>(null)
  const pastY = useRef(0)
  const [tab, setTab] = useState<'next' | 'past'>('next')
  const goTo = (target: 'next' | 'past') => {
    if (target === tab) return
    haptic.select()
    setTab(target)
    scroll.current?.scrollTo({
      y: target === 'past' ? pastY.current - 12 : 0,
      animated: true
    })
  }

  const openCode = (game: MyGame) => router.push(`/codigo/${game.eventId}`)
  const openBar = (game: MyGame) =>
    game.barActive ? router.push(`/bar/${game.barId}` as Href) : undefined

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={mine.isRefetching}
            onRefresh={() => {
              mine.refetch()
              ratings.refetch()
              reports.refetch()
            }}
            tintColor={palette.muted}
          />
        }
      >
        <View style={styles.top}>
          <BackButton />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pôr na agenda do celular"
            hitSlop={8}
            onPress={() => soon.show('A agenda do celular chega em breve')}
          >
            <Glass
              tone={palette.dark ? 'dark' : 'light'}
              interactive
              style={styles.round}
            >
              <Icon
                name="calendar"
                size={18}
                color={palette.ink}
                accent={palette.accent}
              />
            </Glass>
          </Pressable>
        </View>
        <Title lines={[['Meus jogos']]} size={40} color={palette.ink} />

        {mine.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : mine.isError ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir seus jogos.
            </Text>
            <PillButton label="Tentar de novo" onPress={() => mine.refetch()} />
          </View>
        ) : !games.length ? (
          <View style={styles.empty}>
            <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
              Você ainda não marcou nenhum jogo.
            </Text>
            <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
              Na página de um bar, toque em “Vou assistir aqui”. Nos bares Elite
              o código sai na hora e vale a oferta da casa no balcão.
            </Text>
            <PillButton
              label="Procurar bares"
              onPress={() => router.navigate('/explore')}
            />
          </View>
        ) : (
          <>
            <View style={styles.tabs}>
              <TabChip
                palette={palette}
                label={`Próximas · ${upcoming.length}`}
                selected={tab === 'next'}
                onPress={() => goTo('next')}
              />
              <TabChip
                palette={palette}
                label="Anteriores"
                selected={tab === 'past'}
                onPress={() => goTo('past')}
              />
            </View>

            {first ? (
              <NextGame
                palette={palette}
                game={first}
                now={now}
                onCode={() => openCode(first)}
                onBar={() => openBar(first)}
              />
            ) : (
              <Text style={[text(14), { color: palette.muted }]}>
                Nenhum jogo marcado daqui para a frente.
              </Text>
            )}
            {rest.map((game) => (
              <LaterGame
                key={game.eventId}
                palette={palette}
                game={game}
                now={now}
                onPress={() => (game.code ? openCode(game) : openBar(game))}
              />
            ))}
            {upcoming.some((game) => game.code) ? (
              <Text
                style={[
                  text(13, 'Regular', 1.45),
                  { color: palette.muted, textAlign: 'center' }
                ]}
              >
                O código vale só no dia do jogo, no bar que você marcou.
              </Text>
            ) : null}

            {past.length ? (
              <View
                onLayout={(event) => {
                  pastY.current = event.nativeEvent.layout.y
                }}
                style={{ gap: 12 }}
              >
                <View style={styles.heading}>
                  <Text style={[text(16, 'Bold'), { color: palette.ink }]}>
                    Anteriores
                  </Text>
                  <Text style={[text(12.5), { color: palette.muted }]}>
                    {thisMonth(past, now) ?? ''}
                  </Text>
                </View>
                <Card palette={palette} soft>
                  <View style={styles.list}>
                    {past.map((game, index) => (
                      <PastRow
                        key={game.eventId}
                        palette={palette}
                        game={game}
                        first={index === 0}
                        rate={toRate.has(game.eventId)}
                        onRate={() => router.push(`/pos-jogo/${game.eventId}`)}
                      />
                    ))}
                  </View>
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

function TabChip({
  palette,
  label,
  selected,
  onPress
}: {
  palette: Palette
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.tab,
        selected
          ? { backgroundColor: ACID, borderColor: ACID }
          : { borderColor: palette.line }
      ]}
    >
      <Text
        style={[text(13, 'SemiBold'), { color: selected ? INK : palette.ink }]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** O próximo jogo: faixa acid "Você vai", o bar e o código com "Mostrar". */
function NextGame({
  palette,
  game,
  now,
  onCode,
  onBar
}: {
  palette: Palette
  game: MyGame
  now: number
  onCode: () => void
  onBar: () => void
}) {
  const show = usePressScale()
  const when = `${dayLabel(game.startsAt, now)} · ${formatTime(game.startsAt)}`
  return (
    <Card
      palette={palette}
      shadow={palette.dark ? 'rgba(201,241,53,.32)' : 'rgba(201,241,53,.85)'}
      offset={6}
    >
      <View style={styles.band}>
        <Icon name="check" size={15} color={INK} />
        <Text style={[text(15, 'Bold', 1.2), { color: INK, flex: 1 }]}>
          {game.validated ? 'Validado' : 'Você vai'}
        </Text>
        <Text style={[styles.mono, { color: INK }]}>{when}</Text>
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${game.barName}, ${gameTitle(game)}`}
        onPress={onBar}
        style={styles.barRow}
      >
        <Photo
          uri={game.photoUrl}
          name={game.barName}
          palette={palette}
          style={styles.photo}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={[text(17, 'Bold', 1.3), { color: palette.ink }]}
            numberOfLines={1}
          >
            {game.barName}
          </Text>
          <Text
            style={[text(13, 'Regular', 1.4), { color: palette.muted }]}
            numberOfLines={1}
          >
            {gameTitle(game)} · {game.championship}
          </Text>
        </View>
      </Pressable>
      {!game.barActive ? (
        <Text style={[text(13, 'SemiBold', 1.4), styles.offAir]}>
          Este bar não está mais na Onside.
          {game.code && !game.validated
            ? ' Seu código continua valendo: mostre no balcão.'
            : ''}
        </Text>
      ) : null}
      {game.code ? (
        <>
          <Perforation palette={{ ...palette, sheet: palette.bg }} />
          <View style={styles.codeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[text(12), { color: palette.muted }]}>Código</Text>
              <Text
                style={[styles.code, { color: palette.ink }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCode(game.code)}
              </Text>
              {game.window ? (
                <Text style={[text(12), { color: palette.muted }]}>
                  Vale das {formatTime(game.window.opensAt)} às{' '}
                  {formatTime(game.window.closesAt)}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mostrar o código"
              onPress={onCode}
              onPressIn={show.onPressIn}
              onPressOut={show.onPressOut}
            >
              <Animated.View style={show.style}>
                <Glass
                  tone={palette.dark ? 'dark' : 'light'}
                  interactive
                  style={styles.show}
                >
                  <Icon
                    name="qr"
                    size={16}
                    color={palette.ink}
                    accent={palette.dark ? ACID : palette.accent}
                  />
                  <Text style={[text(15, 'Bold', 1.2), { color: palette.ink }]}>
                    Mostrar
                  </Text>
                </Glass>
              </Animated.View>
            </Pressable>
          </View>
        </>
      ) : null}
    </Card>
  )
}

/** Os outros próximos: "Você vai · amanhã", o bar e o jogo numa linha. */
function LaterGame({
  palette,
  game,
  now,
  onPress
}: {
  palette: Palette
  game: MyGame
  now: number
  onPress: () => void
}) {
  const line = [
    gameTitle(game),
    formatTime(game.startsAt),
    game.code ? `código ${formatCode(game.code)}` : null
  ]
    .filter(Boolean)
    .join(' · ')
  const press = usePressScale(0.985)
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <Card palette={palette}>
          <View style={styles.barRow}>
            <Photo
              uri={game.photoUrl}
              name={game.barName}
              palette={palette}
              style={styles.photo}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.when}>
                <Icon
                  name="calendar"
                  size={14}
                  color={palette.dark ? ACID : palette.ink}
                  accent={palette.dark ? ACID : palette.accent}
                />
                <Text
                  style={[
                    text(13.5, 'Bold', 1.3),
                    { color: palette.dark ? ACID : palette.ink }
                  ]}
                >
                  Você vai · {dayLabel(game.startsAt, now).toLowerCase()}
                </Text>
              </View>
              <Text
                style={[text(16, 'Bold', 1.3), { color: palette.ink }]}
                numberOfLines={1}
              >
                {game.barName}
              </Text>
              <Text
                style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
                numberOfLines={1}
              >
                {line}
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>
    </Pressable>
  )
}

function PastRow({
  palette,
  game,
  first,
  rate,
  onRate
}: {
  palette: Palette
  game: MyGame
  first: boolean
  rate: boolean
  onRate: () => void
}) {
  const label = pastLabel(game)
  const press = usePressScale()
  return (
    <View
      style={[
        styles.past,
        !first && { borderTopWidth: 1, borderTopColor: palette.line }
      ]}
    >
      <Icon
        name="ticket"
        size={22}
        color={palette.muted}
        accent={palette.accent}
      />
      <View style={{ flex: 1 }}>
        <Text
          style={[text(14.5, 'SemiBold', 1.3), { color: palette.ink }]}
          numberOfLines={1}
        >
          {game.barName}
        </Text>
        <Text
          style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
          numberOfLines={1}
        >
          {gameTitle(game)} · {shortDate(game.startsAt)}
        </Text>
      </View>
      {rate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Avaliar o ${game.barName}`}
          onPress={onRate}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          hitSlop={8}
        >
          <Animated.View style={[styles.rate, press.style]}>
            <Text style={[text(12.5, 'Bold', 1.2), { color: PAPER }]}>
              Avaliar
            </Text>
          </Animated.View>
        </Pressable>
      ) : (
        <View
          style={[
            styles.badge,
            { backgroundColor: game.validated ? ACID : palette.mark }
          ]}
        >
          <Text
            style={[
              text(10.5, 'Bold', 1.2),
              { color: game.validated ? INK : palette.ink }
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  empty: { gap: 14, marginTop: 24 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: ACID
  },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13
  },
  photo: { width: 52, height: 52, borderRadius: 4 },
  offAir: { color: '#c92b0c', paddingHorizontal: 14, paddingBottom: 12 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14
  },
  // Anton 40 do design, sem `lineHeight` (corta no iOS): margem negativa.
  code: {
    fontFamily: 'Anton',
    fontSize: 40,
    letterSpacing: 3.2,
    marginVertical: -6
  },
  show: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    overflow: 'hidden'
  },
  when: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 12
  },
  list: { paddingHorizontal: 14 },
  past: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12
  },
  rate: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    backgroundColor: INK
  },
  badge: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 }
})
