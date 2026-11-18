import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  StyleSheet,
  View
} from 'react-native'
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
import {
  adoptSessionCookie,
  authClient,
  hasStoredSession
} from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { latestURL } from '@/lib/latest-url'
import { type Acao, finishPending } from '@/lib/pending-action'
import { queryClient, trpc } from '@/lib/trpc'
import { verifiedGate } from '@/lib/verified-gate'
import { clearVerifier, readStoredVerifier } from '@/lib/verify-link'

/*
 * Destino do link de confirmação de e-mail (rodada 8, tela 5). O servidor
 * confirma e redireciona para cá com um código de uso único (`?code=`), que o
 * app troca pela sessão com o verificador guardado ao pedir o e-mail
 * (`lib/verify-link.ts`). Sem código ou verificador, o login pede a senha.
 *
 * "Tudo certo, Lucas": curta e escura. O check entra (.9 → 1 e opacidade,
 * 240 ms EASE, com o háptico de sucesso) e, 80 ms depois, o cartão da
 * presença já marcada (12 pt e opacidade, 200 ms). Segue sozinha em 1,2 s ou
 * no toque. Sem barra de carregamento: não há espera real para medir.
 * Movimento reduzido: só a opacidade.
 */

const FOLLOW_MS = 1200

/**
 * Já há conta no aparelho: trocar pela do link só com o sim da pessoa. Sem
 * conta, segue direto.
 */
async function confirmSwitch() {
  if (!hasStoredSession()) return true
  const current = await authClient.getSession().catch(() => null)
  const name = current?.data?.user?.name?.trim()
  if (!name) return true
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      'Trocar de conta?',
      `Você está na conta de ${name}. Entrar na conta do e-mail confirmado?`,
      [
        { text: 'Continuar', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Trocar', onPress: () => resolve(true) }
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  )
}

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
    let timer: ReturnType<typeof setTimeout> | undefined
    latestURL()
      .then(async (url) => {
        const gate = verifiedGate(url, await readStoredVerifier())
        const exit = (notice: 'confirmed' | 'expired') => {
          if (hasStoredSession()) router.replace('/')
          else router.replace({ pathname: '/sign-in', params: { notice } })
        }
        if (gate.kind === 'leave') return exit(gate.notice)
        // Quem já está numa conta decide se troca.
        if (!(await confirmSwitch())) return exit('confirmed')
        const redeemed = await authClient.$fetch<{ cookie: string }>(
          '/app-session/redeem',
          {
            method: 'POST',
            body: { code: gate.code, verifier: gate.verifier }
          }
        )
        await clearVerifier()
        const cookie = redeemed.data?.cookie
        // Código vencido ou já usado: o e-mail está confirmado, falta entrar.
        if (!cookie) return exit('confirmed')
        await adoptSessionCookie(cookie)
        // Busca a sessão antes de sair daqui, para a tela inicial já a ver.
        // A sessão já está no aparelho: sem resposta aqui, a confirmação
        // segue sem o nome nem a ação, em vez de mandar entrar de novo.
        const session = await authClient.getSession().catch(() => null)
        await queryClient.invalidateQueries()
        const user = session?.data?.user
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
        // Com leitor de tela, não sai sozinha: o "ir agora" leva adiante.
        if (!(await AccessibilityInfo.isScreenReaderEnabled()))
          timer = setTimeout(leave, FOLLOW_MS)
      })
      // Sessão que não pegou: o login pede de novo, sem tela escura parada.
      .catch(() =>
        router.replace({ pathname: '/sign-in', params: { notice: 'expired' } })
      )
    return () => clearTimeout(timer)
  }, [router, check, card])

  const line =
    acao?.kind === 'vou'
      ? 'E-mail confirmado. A presença que você pediu já está marcada.'
      : acao?.kind === 'fav'
        ? 'E-mail confirmado. O bar que você pediu já está salvo.'
        : 'E-mail confirmado. Sua conta está pronta.'

  return (
    <Pressable
      accessible={false}
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
            <Text
              accessibilityRole="button"
              onPress={() => go.current?.()}
              style={[text(13, 'Bold', 1.4), styles.underline]}
            >
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
    fontSize: 11,
    letterSpacing: 0.8,
    color: ACID
  },
  underline: { color: PAPER, textDecorationLine: 'underline' }
})
