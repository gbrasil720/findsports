import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import * as Calendar from 'expo-calendar/legacy'
import { type Href, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { dayLabel, Perforation, Photo } from '@/components/explore'
import { Glass } from '@/components/glass'
import { haptic, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import { PaletteProvider, usePalette } from '@/components/theme'
import {
  ACID,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { formatTime } from '@/lib/explore'
import {
  calendarEvent,
  formatCode,
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
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const soon = useSoon()
  useStatusBar('auto')
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const postGame = useQuery(trpc.postGame.pending.queryOptions())
  const now = Date.now()
  const games = mine.data ?? []
  // O servidor manda do mais recente ao mais antigo; os próximos vão do mais
  // perto ao mais longe.
  const upcoming = games.filter((game) => !game.ended).reverse()
  const past = games.filter((game) => game.ended)
  const toRate = new Set(postGame.data?.map((item) => item.eventId))
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
  // Agenda do celular (WEB-406): o formulário de evento do próprio iOS, já
  // preenchido. Não pede permissão de calendário e a pessoa confirma lá.
  const addToCalendar = (game: MyGame) =>
    Calendar.createEventInCalendarAsync(calendarEvent(game))
      .then(({ action }) => {
        if (action === 'saved') haptic.success()
      })
      .catch(() => soon.show('Não deu para abrir a agenda'))
  const pickForCalendar = () => {
    const [only] = upcoming
    if (!only) return soon.show('Marque um jogo para pôr na agenda')
    if (upcoming.length === 1) return addToCalendar(only)
    Alert.alert('Pôr na agenda', 'Qual jogo?', [
      // ponytail: os quatro mais próximos; mais que isso o alerta não comporta.
      ...upcoming.slice(0, 4).map((game) => ({
        text: `${gameTitle(game)} · ${dayLabel(game.startsAt, Date.now()).toLowerCase()}`,
        onPress: () => addToCalendar(game)
      })),
      { text: 'Cancelar', style: 'cancel' as const }
    ])
  }
  const openBar = (game: MyGame) =>
    game.barActive ? router.push(`/bar/${game.barId}` as Href) : undefined

  const pull = usePullRefresh(() =>
    Promise.all([mine.refetch(), postGame.refetch()])
  )

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        ref={scroll}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        {/* Dentro da aba "Você", sem voltar: o título divide a linha com a
            agenda, como no design. */}
        <View style={styles.top}>
          <View style={{ flex: 1 }}>
            <Title lines={[['Meus jogos']]} size={40} color={palette.ink} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pôr na agenda do celular"
            hitSlop={8}
            onPress={pickForCalendar}
          >
            <GlassRound>
              <Icon
                name="calendar"
                size={18}
                color={palette.ink}
                // O ponto vermelho do design, no claro e no escuro.
                accent={LIVE}
              />
            </GlassRound>
          </Pressable>
        </View>

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
                label={`Próximas · ${upcoming.length}`}
                selected={tab === 'next'}
                onPress={() => goTo('next')}
              />
              <TabChip
                label="Anteriores"
                selected={tab === 'past'}
                onPress={() => goTo('past')}
              />
            </View>

            {first ? (
              <NextGame
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
                <Card soft>
                  <View style={styles.list}>
                    {past.map((game, index) => (
                      <PastRow
                        key={game.eventId}
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
            <Text
              style={[
                text(12.5, 'Regular', 1.45),
                styles.note,
                { color: palette.muted }
              ]}
            >
              Cada código validado conta para as conquistas e para o{' '}
              <Text
                accessibilityRole="link"
                onPress={() => router.navigate('/voce/ranking')}
                style={[text(12.5, 'Bold', 1.45), { color: palette.ink }]}
              >
                ranking do mês
              </Text>
              .
            </Text>
          </>
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

function TabChip({
  label,
  selected,
  onPress
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  const palette = usePalette()
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
  game,
  now,
  onCode,
  onBar
}: {
  game: MyGame
  now: number
  onCode: () => void
  onBar: () => void
}) {
  const palette = usePalette()
  const show = usePressScale()
  const when = `${dayLabel(game.startsAt, now)} · ${formatTime(game.startsAt)}`
  const shadow = palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'
  return (
    <Card shadow={shadow} offset={5} notched>
      <View style={styles.band}>
        <Icon name="check" size={14} color={INK} />
        <Text style={[text(13.5, 'Bold', 1.2), { color: INK, flex: 1 }]}>
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
        <Photo uri={game.photoUrl} name={game.barName} style={styles.photo} />
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
            {/* Fora de confronto o título já é o campeonato: não repete. */}
            {gameTitle(game) === game.championship
              ? game.championship
              : `${gameTitle(game)} · ${game.championship}`}
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
          {/* O furo na cor da tela, não da folha. */}
          <PaletteProvider
            value={{
              ...palette,
              sheet: palette.bg,
              dash: palette.dark ? 'rgba(241,238,230,.18)' : palette.dash
            }}
          >
            <Perforation shadow={{ color: shadow, offset: 5 }} inset={16} />
          </PaletteProvider>
          <View style={styles.codeRow}>
            <View style={{ flex: 1 }}>
              <Text style={[text(12), { color: palette.muted }]}>
                {/* Bar que confirma pela comanda (WEB-412). */}
                {game.confirmsCodesLater
                  ? 'Para o garçom: anote na comanda'
                  : 'Código'}
              </Text>
              <Text
                style={[styles.code, { color: palette.ink }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCode(game.code)}
              </Text>
              {game.window ? (
                <Text
                  style={[text(12), { color: palette.muted, marginTop: 4 }]}
                >
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
                  <Text
                    style={[text(13.5, 'Bold', 1.2), { color: palette.ink }]}
                  >
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
  game,
  now,
  onPress
}: {
  game: MyGame
  now: number
  onPress: () => void
}) {
  const palette = usePalette()
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
        <Card soft>
          <View style={[styles.barRow, { paddingBottom: 14 }]}>
            <Photo
              uri={game.photoUrl}
              name={game.barName}
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
                    text(12.5, 'Bold', 1.3),
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
  game,
  first,
  rate,
  onRate
}: {
  game: MyGame
  first: boolean
  rate: boolean
  onRate: () => void
}) {
  const palette = usePalette()
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
    gap: 12,
    marginBottom: 4
  },
  empty: { gap: 14, marginTop: 24 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1
  },
  // Altura 38 do design; os cantos de cima são dele, já que o card do
  // ingresso não recorta (o furo do picote passa por cima da sombra).
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    marginTop: -1,
    marginHorizontal: -1,
    paddingHorizontal: 15,
    backgroundColor: ACID,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6
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
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 4
  },
  photo: { width: 54, height: 54, borderRadius: 3 },
  offAir: { color: '#c92b0c', paddingHorizontal: 14, paddingBottom: 12 },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 4,
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
    gap: 7,
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 21,
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
  note: { paddingHorizontal: 4 },
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
