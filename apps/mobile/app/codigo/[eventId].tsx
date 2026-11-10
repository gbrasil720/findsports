import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Brightness from 'expo-brightness'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View
} from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-qr-code'
import { dayLabel } from '@/components/explore'
import { Seal, useStamp } from '@/components/fan-card'
import { EASE } from '@/components/motion'
import { useOnline } from '@/components/offline-banner'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { env } from '@/lib/env'
import { formatTime, isLive } from '@/lib/explore'
import { readTodayCode } from '@/lib/maintenance'
import { formatCode } from '@/lib/my-games'
import { trpc } from '@/lib/trpc'

/*
 * O código no balcão (rodada 3 do redesign, telas 2, 3 e 5): um ingresso de
 * papel sobre a tinta, nos dois temas, com o brilho no máximo enquanto a tela
 * está aberta. A mesma família da carteirinha: marca e "Código do balcão", o
 * bar em Anton, o jogo, o picote com as meias-luas, o código grande e o QR
 * (que abre `/admin/validate?code=` no painel do bar), a oferta numa faixa e o
 * canhoto com a janela. Validado, o selo cai no ingresso, o código apaga e a
 * oferta acende. Pela comanda (WEB-412), fala com o garçom. Sem rede, abre o
 * código guardado no aparelho (WEB-466).
 */

const MUTED_INK = '#55554f'
const DIM = '#aaa9a4'
const RAISED = '#26261f'
const LIVE_RED = '#e8320c'

/** Brilho no máximo na tela, e o de antes de volta quando ela sai. */
function useMaxBrightness() {
  useFocusEffect(
    useCallback(() => {
      let before: number | null = null
      let left = false
      Brightness.getBrightnessAsync()
        .then((value) => {
          if (left) return
          before = value
          return Brightness.setBrightnessAsync(1)
        })
        .catch(() => {})
      return () => {
        left = true
        if (before !== null)
          Brightness.setBrightnessAsync(before).catch(() => {})
      }
    }, [])
  )
}

/** O relógio da tela, de minuto em minuto (o chip "começa em" troca seco). */
function useMinute() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

/** "hoje", "qua 11": o dia do jogo, no fuso de Brasília. */
function shortDay(startsAt: string, now: number) {
  if (dayLabel(startsAt, now) === 'Hoje') return 'hoje'
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Date(startsAt).toLocaleDateString('pt-BR', {
      ...options,
      timeZone: 'America/Sao_Paulo'
    })
  return `${part({ weekday: 'short' }).replace('.', '')} ${part({ day: 'numeric' })}`
}

/** "1h48", "12 min": quanto falta para começar. */
function until(startsAt: string, now: number) {
  const minutes = Math.max(
    1,
    Math.round((new Date(startsAt).getTime() - now) / 60_000)
  )
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`
}

export default function CounterCode() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  useStatusBar('light')
  useMaxBrightness()
  const queryClient = useQueryClient()
  const now = useMinute()
  // Enquanto o código espera o balcão, a tela pergunta de 5 em 5 s:
  // validado, ela troca para "Validado" e a conquista nova (se houver) abre.
  // Sem jogo, sem código ou com erro não há o que esperar.
  const mine = useQuery({
    ...trpc.attendance.mine.queryOptions(),
    refetchInterval: (query) => {
      const item = query.state.data?.find((each) => each.eventId === eventId)
      return query.state.status !== 'error' && item?.code && !item.validated
        ? 5000
        : false
    }
  })
  const calls = useQuery({
    ...trpc.attendance.sentCalls.queryOptions({ eventId: eventId ?? '' }),
    enabled: Boolean(eventId)
  })
  // Sem resposta do servidor (sem rede, manutenção), o código guardado no
  // aparelho (WEB-466).
  const userId = authClient.useSession().data?.user.id
  const saved = mine.data ? null : readTodayCode(userId)
  // Sem rede, o ingresso abre igual e diz de onde veio (tela 3).
  const online = useOnline()
  const fromDevice = (!mine.data && saved?.eventId === eventId) || !online
  const game =
    mine.data?.find((item) => item.eventId === eventId) ??
    (fromDevice ? saved : undefined)
  const validated = Boolean(game?.validated)
  // A medalha nova (2k) abre depois do selo: o validado é o pico da tela, e
  // a conquista entra por cima só quando o carimbo já assentou.
  useEffect(() => {
    if (!validated) return
    const timer = setTimeout(
      () =>
        queryClient.invalidateQueries({
          queryKey: trpc.achievements.mine.queryKey()
        }),
      1800
    )
    return () => clearTimeout(timer)
  }, [validated, queryClient])

  const top = (
    <View style={styles.top}>
      {/* O círculo sólido do desenho (`.tix-s .rb`), sem borda. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        hitSlop={8}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/explore')
        }
        style={styles.round}
      >
        <Icon name="close" size={20} color={PAPER} />
      </Pressable>
      <View style={styles.state}>
        {fromDevice ? null : (
          <Icon name={validated ? 'check' : 'eye'} size={16} color={DIM} />
        )}
        <Text style={styles.stateText}>
          {fromDevice
            ? 'Guardado no aparelho'
            : validated
              ? 'Validado'
              : 'Brilho no máximo'}
        </Text>
      </View>
      {game?.code && !fromDevice ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar o código"
          hitSlop={8}
          onPress={() =>
            Share.share({
              message: `Meu código da Onside no ${game.barName} (${gameTitle(game)}): ${formatCode(game.code ?? '')}`
            })
          }
          style={styles.round}
        >
          <Icon name="share" size={20} color={PAPER} />
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  )

  if (!game?.code) {
    return (
      <View
        style={[styles.screen, { paddingTop: insets.top + (online ? 12 : 72) }]}
      >
        {top}
        <View style={styles.center}>
          {mine.isPending ? (
            <ActivityIndicator color={PAPER} />
          ) : (
            <Text style={[text(15, 'SemiBold'), { color: PAPER }]}>
              {mine.isError
                ? 'Não deu para abrir o código.'
                : 'Este jogo não tem código.'}
            </Text>
          )}
        </View>
      </View>
    )
  }

  const waiter = Boolean(game.confirmsCodesLater) && !validated
  const live = isLive(game, now)
  const called = (calls.data ?? []).map((call) => ({
    ...call,
    first: call.name.trim().split(/\s+/)[0] ?? call.name
  }))
  const goingToo = called.filter((call) => call.status === 'going')
  const names = (list: { first: string }[]) =>
    list.length > 1
      ? `${list
          .slice(0, -1)
          .map((c) => c.first)
          .join(', ')} e ${list.at(-1)?.first}`
      : (list[0]?.first ?? '')

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top + (online ? 12 : 72) }]}
    >
      {top}
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 24 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Ticket
          game={game}
          waiter={waiter}
          validated={validated}
          chip={
            validated
              ? {
                  label: game.validatedAt
                    ? `validado ${formatTime(game.validatedAt)}`
                    : 'validado',
                  live: false
                }
              : live
                ? { label: 'ao vivo', live: true }
                : shortDay(game.startsAt, now) === 'hoje'
                  ? {
                      label: `começa em ${until(game.startsAt, now)}`,
                      live: false
                    }
                  : { label: shortDay(game.startsAt, now), live: false }
          }
          day={shortDay(game.startsAt, now)}
        />
        {called.length ? (
          <Animated.View
            key={goingToo.length ? 'vai' : 'chamados'}
            entering={FadeIn.duration(150)}
            style={styles.called}
          >
            <Icon name="people" size={18} color={DIM} />
            <Text style={[text(13.5, 'Regular', 1.4), { color: '#c9c7c0' }]}>
              <Text style={{ fontFamily: 'Archivo-Bold', color: PAPER }}>
                {names(goingToo.length ? goingToo : called)}
              </Text>
              {goingToo.length
                ? goingToo.length === 1
                  ? ' vai também'
                  : ' vão também'
                : called.length === 1
                  ? ' foi chamado'
                  : ' foram chamados'}
            </Text>
          </Animated.View>
        ) : null}
        <View style={{ flex: 1, minHeight: 24 }} />
        {/* Sem rede, só o ingresso (tela 3). */}
        {fromDevice ? null : (
          <Text style={styles.below}>
            {validated ? (
              <>
                Bom jogo. Depois, conta como foi:{' '}
                <Text style={styles.belowStrong}>
                  a avaliação abre em Meus jogos
                </Text>
                .
              </>
            ) : waiter ? (
              <>
                Mostre ao garçom: ele anota na comanda e a oferta sai na hora.{' '}
                <Text style={styles.belowStrong}>
                  O bar confirma depois do jogo.
                </Text>
              </>
            ) : (
              <>
                O código também fica em{' '}
                <Text style={styles.belowStrong}>Meus jogos</Text>.
              </>
            )}
          </Text>
        )}
      </ScrollView>
    </View>
  )
}

type Game = {
  barName: string
  code: string | null
  offer?: string | null
  startsAt: string
  window?: { opensAt: string; closesAt: string } | null
  championship: string
  participants: string[]
  participantFreeText: string | null
}

/** O ingresso de papel (`.tix`). */
function Ticket({
  game,
  waiter,
  validated,
  chip,
  day
}: {
  game: Game
  waiter: boolean
  validated: boolean
  chip: { label: string; live: boolean }
  day: string
}) {
  const reduced = useReducedMotion()
  // Entra uma vez por abertura: sobe pouco e aparece.
  const shown = useSharedValue(0)
  const fade = useSharedValue(validated ? 1 : 0)
  useEffect(() => {
    shown.set(withTiming(1, { duration: 260, easing: EASE }))
  }, [shown])
  // Validado: o código e o QR apagam enquanto o selo cai.
  useEffect(() => {
    fade.set(withTiming(validated ? 1 : 0, { duration: 200, easing: EASE }))
  }, [validated, fade])
  const enter = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: reduced ? 0 : 16 * (1 - shown.get()) }]
  }))
  const dim = useAnimatedStyle(() => ({ opacity: 1 - 0.68 * fade.get() }))
  const code = game.code ?? ''
  const bar = game.barName.toLocaleUpperCase('pt-BR')
  const window = game.window
    ? `${formatTime(game.window.opensAt)}–${formatTime(game.window.closesAt)}`
    : null
  return (
    <Animated.View style={[styles.ticketWrap, enter]}>
      <View style={styles.ticket}>
        {waiter ? (
          <View style={styles.waiter}>
            <Icon name="doc" size={16} color={ACID} />
            <Text style={styles.waiterText}>
              PARA O GARÇOM: ANOTE NA COMANDA
            </Text>
          </View>
        ) : null}
        <View style={styles.head}>
          <View style={styles.headRow}>
            <View style={styles.brand}>
              <Mark />
              <Text style={styles.brandName}>ONSIDE</Text>
              <Text style={styles.brandLabel}>CÓDIGO DO BALCÃO</Text>
            </View>
            <View style={[styles.chip, chip.live && styles.chipLive]}>
              <Text style={[styles.chipText, chip.live && { color: INK }]}>
                {chip.label}
              </Text>
            </View>
          </View>
          <Text
            style={styles.bar}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.79}
          >
            {bar}
          </Text>
          <Text style={styles.game} numberOfLines={2}>
            <Text style={styles.gameStrong}>{gameTitle(game)}</Text>
            {` · ${day} ${formatTime(game.startsAt)}`}
          </Text>
        </View>
        <Perf />
        <View style={styles.mid}>
          <Text style={styles.hint}>
            {waiter
              ? 'CÓDIGO PARA A COMANDA'
              : 'MOSTRE NO BALCÃO OU DEIXE ESCANEAR'}
          </Text>
          <Animated.View
            accessible
            accessibilityLabel={`Código ${code.split('').join(' ')}`}
            style={[styles.codeRow, dim]}
          >
            <Text style={[styles.code, waiter && styles.codeBig]}>
              {code.slice(0, 3)}
            </Text>
            <View style={styles.codeBar} />
            <Text style={[styles.code, waiter && styles.codeBig]}>
              {code.slice(3)}
            </Text>
          </Animated.View>
          {waiter ? null : (
            <Animated.View style={[styles.qr, dim]}>
              <QRCode
                value={`${env.EXPO_PUBLIC_SERVER_URL}/admin/validate?code=${code}`}
                size={130}
                bgColor="#ffffff"
                fgColor={INK}
              />
            </Animated.View>
          )}
        </View>
        {game.offer ? <Offer won={validated}>{game.offer}</Offer> : null}
        <View style={styles.foot}>
          <Text style={styles.footText}>
            {window ? (
              <>
                Vale{' '}
                <Text style={styles.footStrong}>{`${day}, ${window}`}</Text>
                {'\n'}uma vez só
              </>
            ) : (
              'Vale uma vez só'
            )}
          </Text>
          <Text style={[styles.footText, { textAlign: 'right' }]}>
            Também em{'\n'}
            <Text style={styles.footStrong}>Meus jogos</Text>
          </Text>
        </View>
        {validated ? <TicketSeal bar={bar} /> : null}
      </View>
    </Animated.View>
  )
}

/** O selo do validado: o da carteirinha, maior, com o bar na volta. */
function TicketSeal({ bar }: { bar: string }) {
  const motion = useStamp('success')
  const label = `VALIDADO NO BALCÃO · ${bar} ·`
  return (
    <Seal
      {...motion}
      size={108}
      fontSize={8.6}
      around
      // Nome longo não cabe na volta: fica a marca.
      label={label.length > 36 ? 'VALIDADO NO BALCÃO · ONSIDE ·' : label}
      style={styles.seal}
    />
  )
}

/** A faixa da oferta: pedra, e acid quando o código foi validado. */
function Offer({ won, children }: { won: boolean; children: ReactNode }) {
  const lit = useSharedValue(won ? 1 : 0)
  useEffect(() => {
    lit.set(withTiming(won ? 1 : 0, { duration: 200, easing: EASE }))
  }, [won, lit])
  const acid = useAnimatedStyle(() => ({ opacity: lit.get() }))
  return (
    <View style={styles.offer}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: ACID }, acid]}
      />
      <Icon name="ticket" size={22} color={INK} accent={LIVE_RED} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.offerLabel, won && { color: '#3d4a06' }]}>
          {won ? 'A OFERTA DA CASA É SUA' : 'OFERTA DA CASA · NESTE JOGO'}
        </Text>
        <Text style={[text(14, 'Regular', 1.35), { color: INK }]}>
          {children}
        </Text>
      </View>
    </View>
  )
}

/** O picote (`.tperf`): a linha tracejada e as meias-luas na cor do fundo. */
function Perf() {
  return (
    <View style={styles.perf}>
      <View style={styles.perfLine} />
      <View style={[styles.notch, { left: -8 }]} />
      <View style={[styles.notch, { right: -8 }]} />
    </View>
  )
}

/** A marca pequena (`.mk3`): o anel e a bola vermelha. */
function Mark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markRing} />
      <View style={styles.markBall} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18
  },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateText: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5, color: DIM },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: RAISED,
    alignItems: 'center',
    justifyContent: 'center'
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 14, gap: 14 },
  ticketWrap: {
    borderRadius: 24,
    backgroundColor: PAPER,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  ticket: { borderRadius: 24, overflow: 'hidden', backgroundColor: PAPER },
  waiter: {
    backgroundColor: INK,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18
  },
  waiterText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.72,
    color: ACID
  },
  head: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12, gap: 8 },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  brandName: {
    fontFamily: 'Anton',
    fontSize: 16,
    color: INK,
    marginVertical: -4
  },
  brandLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 1.2,
    color: MUTED_INK
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: INK
  },
  chipLive: { backgroundColor: '#e8320c' },
  // Mono com 1em de linha (o natural é 1,3em): margem negativa.
  chipText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    marginVertical: -1.7,
    color: ACID,
    fontVariant: ['tabular-nums']
  },
  // Anton 38/.95: margem negativa no lugar do entrelinha curto.
  bar: {
    fontFamily: 'Anton',
    fontSize: 38,
    color: INK,
    marginVertical: -10.5
  },
  game: { fontFamily: 'GeistMono-SemiBold', fontSize: 13, color: MUTED_INK },
  gameStrong: { fontFamily: 'Archivo-Bold', fontSize: 15, color: INK },
  perf: { height: 16, justifyContent: 'center' },
  perfLine: {
    marginHorizontal: 16,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#d9d4c8'
  },
  notch: {
    position: 'absolute',
    top: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: INK
  },
  mid: {
    paddingTop: 6,
    paddingHorizontal: 18,
    paddingBottom: 14,
    alignItems: 'center',
    gap: 10
  },
  hint: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    marginVertical: -1.6,
    letterSpacing: 0.88,
    color: MUTED_INK
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Anton 74/.9 do desenho: margem negativa no lugar do entrelinha curto.
  code: {
    fontFamily: 'Anton',
    fontSize: 74,
    letterSpacing: 1.5,
    color: INK,
    marginVertical: -22.4
  },
  codeBig: { fontSize: 92, marginVertical: -27.8 },
  codeBar: { width: 14, height: 6, borderRadius: 2, backgroundColor: INK },
  qr: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e7e3db'
  },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    backgroundColor: '#e7e3db'
  },
  offerLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: MUTED_INK,
    marginBottom: 4
  },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 14
  },
  footText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    lineHeight: 15.5,
    color: MUTED_INK
  },
  footStrong: { color: INK },
  seal: { position: 'absolute', right: 20, top: 150, left: undefined },
  mark: { width: 16, height: 16 },
  markRing: {
    position: 'absolute',
    top: 1,
    left: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: INK
  },
  markBall: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#e8320c'
  },
  called: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10
  },
  below: {
    fontFamily: 'Archivo-Regular',
    fontSize: 13.5,
    lineHeight: 19.5,
    color: DIM,
    textAlign: 'center',
    paddingHorizontal: 18
  },
  belowStrong: { fontFamily: 'Archivo-Bold', color: PAPER }
})
