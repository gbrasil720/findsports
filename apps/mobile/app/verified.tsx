import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dayLabel, Photo } from '@/components/explore'
import { EASE, haptic } from '@/components/motion'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { adoptSessionCookie, authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { latestURL } from '@/lib/latest-url'
import { type Acao, finishPending } from '@/lib/pending-action'
import { rawParam } from '@/lib/raw-param'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Destino do link de confirmação de e-mail (rodada 8, tela 5). O servidor
 * confirma, entra e redireciona para cá com a sessão em `?cookie=…`; sem ela
 * (link vencido ou já usado), o login pede outro link.
 *
 * "Tudo certo, Lucas": curta e escura. O check entra (.9 → 1 e opacidade,
 * 240 ms EASE, com o háptico de sucesso) e, 80 ms depois, o cartão da
 * presença já marcada (12 pt e opacidade, 200 ms). Segue sozinha em 1,2 s ou
 * no toque. Sem barra de carregamento: não há espera real para medir.
 * Movimento reduzido: só a opacidade.
 */

const FOLLOW_MS = 1200

export default function Verified() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  useStatusBar('light')
  const [name, setName] = useState<string | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)
  const go = useRef<(() => void) | null>(null)
  const bar = useQuery({
    ...trpc.pubs.getById.queryOptions({
      id: acao && 'barId' in acao ? acao.barId : ''
    }),
    enabled: !!acao && 'barId' in acao
  })
  const game =
    acao?.kind === 'vou'
      ? bar.data?.events.find((event) => event.id === acao.eventId)
      : undefined

  const check = useSharedValue(0)
  const card = useSharedValue(0)
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.get(),
    transform: [{ scale: reduced ? 1 : 0.9 + 0.1 * check.get() }]
  }))
  const cardStyle = useAnimatedStyle(() => ({
    opacity: card.get(),
    transform: [{ translateY: reduced ? 0 : 12 * (1 - card.get()) }]
  }))

  useEffect(() => {
    latestURL().then(async (url) => {
      const cookie = url ? rawParam(url, 'cookie') : undefined
      if (!cookie) {
        router.replace({ pathname: '/sign-in', params: { notice: 'expired' } })
        return
      }
      await adoptSessionCookie(cookie)
      // Busca a sessão antes de sair daqui, para a tela inicial já a ver.
      const session = await authClient.getSession()
      await queryClient.invalidateQueries()
      const user = session.data?.user
      // A ação que pediu a conta (rodada 2): sai feita, e a pessoa volta ao
      // bar dela, sem o onboarding na frente (a ação primeiro).
      const done = user ? await finishPending(user) : null
      setName(user?.name?.trim().split(/\s+/)[0] ?? '')
      setAcao(done)
      haptic.success()
      check.set(withTiming(1, { duration: 240, easing: EASE }))
      card.set(withDelay(80, withTiming(1, { duration: 200, easing: EASE })))
      let left = false
      const leave = () => {
        if (left) return
        left = true
        // A folha de entrar ainda está aberta: fecha antes, senão o bar abre
        // dentro dela e o cartão da ação fica escondido atrás.
        if (router.canDismiss()) router.dismissAll()
        if (done && 'barId' in done) {
          router.replace('/explore')
          router.push({ pathname: '/bar/[id]', params: { id: done.barId } })
          return
        }
        router.replace('/')
      }
      go.current = leave
      setTimeout(leave, FOLLOW_MS)
    })
  }, [router, check, card])

  const line =
    acao?.kind === 'vou'
      ? 'E-mail confirmado. A presença que você pediu já está marcada.'
      : acao?.kind === 'fav'
        ? 'E-mail confirmado. O bar que você pediu já está salvo.'
        : 'E-mail confirmado. Sua conta está pronta.'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continuar"
      onPress={() => go.current?.()}
      style={[styles.screen, { paddingBottom: insets.bottom + 24 }]}
    >
      {name === null ? null : (
        <>
          <Animated.View style={[styles.check, checkStyle]}>
            <Icon name="check" size={40} color={INK} />
          </Animated.View>
          <View accessible accessibilityRole="header">
            <Text style={[styles.title, { color: PAPER }]}>
              {name ? 'Tudo certo,' : 'Tudo certo'}
            </Text>
            {name ? (
              <Text style={[styles.title, { color: ACID }]}>{name}</Text>
            ) : null}
          </View>
          <Text style={[text(15, 'Regular', 1.45), styles.line]}>{line}</Text>
          {acao && 'barId' in acao && bar.data ? (
            <Animated.View style={[styles.card, cardStyle]}>
              <Photo
                uri={bar.data.photoUrl}
                name={bar.data.name}
                style={styles.photo}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.kicker}>
                  {acao.kind === 'vou' ? 'PRESENÇA MARCADA' : 'BAR SALVO'}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[text(15, 'Bold', 1.3), { color: PAPER }]}
                >
                  {game ? gameTitle(game) : bar.data.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[text(12.5, 'Regular', 1.3), { color: '#aaa9a4' }]}
                >
                  {[
                    bar.data.name,
                    game
                      ? `${dayLabel(game.startsAt, Date.now()).toLowerCase()} ${formatTime(game.startsAt)}`
                      : null,
                    game?.going?.count ? `${game.going.count} vão` : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </Animated.View>
          ) : null}
          <Text style={[text(13, 'Regular', 1.4), { color: '#aaa9a4' }]}>
            {acao && 'barId' in acao ? 'Voltando ao bar · ' : 'Entrando · '}
            <Text style={[text(13, 'Bold', 1.4), styles.underline]}>
              ir agora
            </Text>
          </Text>
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    gap: 18
  },
  check: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 6 }
  },
  // Anton 52: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 52,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginVertical: -12.6
  },
  line: { color: '#aaa9a4', textAlign: 'center', maxWidth: 300 },
  card: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#1c1c18',
    borderWidth: 1.5,
    borderColor: 'rgba(201,241,53,.35)'
  },
  photo: { width: 52, height: 52, borderRadius: 12 },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: ACID
  },
  underline: { color: PAPER, textDecorationLine: 'underline' }
})
