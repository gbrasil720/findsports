import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Brightness from 'expo-brightness'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import QRCode from 'react-qr-code'
import { dayLabel, PALETTE, Perforation } from '@/components/explore'
import { Glass } from '@/components/glass'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  MUTED,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import { env } from '@/lib/env'
import { formatTime } from '@/lib/explore'
import { formatCode, gameTitle } from '@/lib/my-games'
import { trpc } from '@/lib/trpc'

/*
 * "Código no balcão" (3f do design): o código grande, o QR e a oferta da
 * casa, sempre no escuro e com o brilho no máximo enquanto a tela está
 * aberta. O QR abre a validação do painel do bar com o código preenchido
 * (`/admin/validate?code=`): o bar escaneia com a câmera do celular.
 */

/** O papel do ingresso sobre a tinta: o picote recorta na cor do fundo. */
const TICKET = { ...PALETTE.light, sheet: INK }

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

export default function CounterCode() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const insets = useSafeAreaInsets()
  useStatusBar('light')
  useMaxBrightness()
  const queryClient = useQueryClient()
  // Enquanto o código espera o balcão, a tela pergunta de tempos em tempos:
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
  const game = mine.data?.find((item) => item.eventId === eventId)
  const validated = Boolean(game?.validated)
  useEffect(() => {
    if (validated)
      queryClient.invalidateQueries({
        queryKey: trpc.achievements.mine.queryKey()
      })
  }, [validated, queryClient])
  const now = Date.now()

  const top = (
    <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
      <BackButton tone="dark" icon="close" />
      <Text style={[text(13), styles.bright]}>Brilho no máximo</Text>
      {game?.code ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar o código"
          hitSlop={8}
          onPress={() =>
            Share.share({
              message: `Meu código da Onside no ${game.barName} (${gameTitle(game)}): ${formatCode(game.code ?? '')}`
            })
          }
        >
          <Glass tone="dark" interactive style={styles.round}>
            <Icon name="share" size={18} color={PAPER} />
          </Glass>
        </Pressable>
      ) : (
        <View style={styles.round} />
      )}
    </View>
  )

  if (!game?.code) {
    return (
      <View style={styles.screen}>
        {top}
        <View style={styles.center}>
          {mine.isPending ? (
            <ActivityIndicator color={PAPER} />
          ) : (
            <Text style={[text(15, 'SemiBold'), styles.empty]}>
              {mine.isError
                ? 'Não deu para abrir o código.'
                : 'Este jogo não tem código.'}
            </Text>
          )}
        </View>
      </View>
    )
  }

  const day = dayLabel(game.startsAt, now).toLowerCase()
  const when = `${day} ${formatTime(game.startsAt)}`
  const window = game.window
    ? `Vale ${day}, das ${formatTime(game.window.opensAt)} às ${formatTime(game.window.closesAt)}, uma vez só.`
    : null

  return (
    <View style={styles.screen}>
      {top}
      <View style={styles.body}>
        <View>
          <View style={styles.shadow} />
          {/* Sem recorte: o furo do picote passa por cima da sombra. */}
          <View style={styles.ticket}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[text(19, 'Bold', 1.3), { color: INK }]}
                  numberOfLines={1}
                >
                  {game.barName}
                </Text>
                <Text
                  style={[text(13.5, 'Regular', 1.4), { color: MUTED }]}
                  numberOfLines={1}
                >
                  {gameTitle(game)} · {when}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: game.validated ? INK : ACID }
                ]}
              >
                <Text
                  style={[
                    text(10.5, 'Bold', 1.2),
                    { color: game.validated ? PAPER : INK }
                  ]}
                >
                  {game.validated ? 'Validado' : 'Você vai'}
                </Text>
              </View>
            </View>
            <Perforation
              palette={TICKET}
              shadow={{ color: ACID, offset: 6 }}
              inset={20}
              radius={10}
            />
            <View style={styles.codeBox}>
              <Text style={[text(13, 'SemiBold'), { color: MUTED }]}>
                {/* Bar que confirma pela comanda (WEB-412): fala com o garçom. */}
                {game.confirmsCodesLater
                  ? 'Para o garçom: anote na comanda'
                  : 'Mostre no balcão ou deixe escanear'}
              </Text>
              <Text
                style={styles.code}
                numberOfLines={1}
                adjustsFontSizeToFit
                accessibilityLabel={`Código ${game.code.split('').join(' ')}`}
              >
                {formatCode(game.code)}
              </Text>
              <View style={styles.qr}>
                <QRCode
                  value={`${env.EXPO_PUBLIC_SERVER_URL}/admin/validate?code=${game.code}`}
                  size={118}
                  bgColor="#ffffff"
                  fgColor={INK}
                />
              </View>
            </View>
            {game.offer ? (
              <View style={styles.offer}>
                <Icon name="ticket" size={22} color={INK} accent={LIVE} />
                <Text style={[text(14, 'Regular', 1.4), styles.offerText]}>
                  <Text style={text(14, 'Bold', 1.4)}>Oferta da casa: </Text>
                  {game.offer}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <Text
        style={[
          text(13, 'Regular', 1.45),
          styles.foot,
          { paddingBottom: insets.bottom + 18 }
        ]}
      >
        {game.validated
          ? 'Código validado. A oferta da casa é sua.'
          : game.confirmsCodesLater
            ? 'Mostre ao garçom: ele anota na comanda e a oferta da casa sai na hora. O bar confirma depois do jogo.'
            : `${window ?? ''} Quando o bar valida, a oferta da casa é sua.`.trim()}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  bright: { color: '#aaa9a4' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: PAPER },
  body: { flex: 1, paddingHorizontal: 22, paddingTop: 28 },
  shadow: {
    ...StyleSheet.absoluteFill,
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    borderRadius: 10,
    backgroundColor: ACID
  },
  ticket: { backgroundColor: PAPER, borderRadius: 10 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6
  },
  badge: { paddingVertical: 3, paddingHorizontal: 6, borderRadius: 3 },
  codeBox: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 22
  },
  // Anton 80 do design, sem `lineHeight` (corta no iOS): margem negativa.
  code: {
    fontFamily: 'Anton',
    fontSize: 80,
    letterSpacing: 4.8,
    color: INK,
    marginTop: -6,
    marginBottom: -14
  },
  qr: {
    marginTop: 4,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(18,18,15,.08)'
  },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#e5e1d8',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10
  },
  offerText: { flex: 1, color: INK },
  foot: { color: '#aaa9a4', textAlign: 'center', paddingHorizontal: 36 }
})
