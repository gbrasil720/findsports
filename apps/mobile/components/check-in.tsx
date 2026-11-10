import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { ErrorText, haptic } from '@/components/motion'
import { AcidButton } from '@/components/ob-frame'
import { usePalette } from '@/components/theme'
import { ACID, errorMessage, Icon, INK, Text, text } from '@/components/ui'
import { useWithAccount } from '@/lib/account'
import { formatTime } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * "Estou aqui" (WEB-408; rodada 3 do redesign, tela 4): check-in por
 * localização na página do bar e em Meus jogos, no dia do jogo (3 h antes a
 * 3 h depois). Pede só a permissão "durante o uso", na hora; a posição vai ao
 * servidor, que confere distância e horário. Confirmado (ou com o código já
 * validado no balcão), o cartão vira "Presença confirmada" em tinta, com o
 * que isso libera. Longe do bar, a frase embaixo e um háptico de aviso: o
 * botão não treme, a pessoa só está longe.
 */

type Phase = 'idle' | 'locating' | 'sending'

export function CheckInCard({
  barId,
  barName,
  eventId,
  done,
  at
}: {
  barId: string
  barName?: string
  eventId: string
  done: boolean
  /** A hora da presença, para "Presença confirmada · 21:47". */
  at?: string | null
}) {
  const palette = usePalette()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const checkIn = useMutation(trpc.attendance.checkIn.mutationOptions())
  // Sem conta, o check-in leva ao "Entrar" (o app abre aberto).
  const withAccount = useWithAccount()

  const check = async () => {
    setError(null)
    setPhase('locating')
    try {
      const asked = await Location.requestForegroundPermissionsAsync()
      if (!asked.granted) {
        setDenied(true)
        return
      }
      setDenied(false)
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      })
      setPhase('sending')
      await checkIn.mutateAsync({
        eventId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      })
      haptic.success()
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.pubs.getById.queryKey({ id: barId })
        }),
        queryClient.invalidateQueries({
          queryKey: trpc.attendance.mine.queryKey()
        })
      ])
    } catch (failure) {
      // A recusa do servidor (longe, fora do horário) chega com a frase
      // dele. Não é erro da pessoa: aviso, não tremor.
      haptic.warning()
      setError(
        errorMessage(failure, 'Não deu para achar você agora. Tente de novo.')
      )
    } finally {
      setPhase('idle')
    }
  }

  if (done) {
    return (
      <Animated.View
        key="done"
        entering={FadeIn.duration(200)}
        style={[
          styles.card,
          { backgroundColor: palette.ink, shadowColor: palette.drop }
        ]}
      >
        <View style={styles.head}>
          <View style={[styles.pin, { backgroundColor: ACID }]}>
            <Icon name="check" size={22} color={INK} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[text(17, 'Bold', 1.2), { color: palette.bg }]}>
              Presença confirmada{at ? ` · ${formatTime(at)}` : ''}
            </Text>
            <Text
              style={[
                text(13.5, 'Regular', 1.4),
                { color: palette.bg, opacity: 0.75 }
              ]}
            >
              {barName
                ? `Você está no ${barName}. Isso vale como visita.`
                : 'Isso vale como visita.'}
            </Text>
          </View>
        </View>
        <View style={styles.unlocks}>
          {['AVALIAÇÃO CONTA NA NOTA', 'CONQUISTAS', 'RANKING DO MÊS'].map(
            (item) => (
              <View key={item} style={styles.unlock}>
                <Text style={[styles.unlockText, { color: palette.bg }]}>
                  {item}
                </Text>
              </View>
            )
          )}
        </View>
      </Animated.View>
    )
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <View style={styles.head}>
        <View style={[styles.pin, { backgroundColor: palette.mark }]}>
          <Icon name="pin" size={22} color={palette.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[text(17, 'Bold', 1.2), { color: palette.ink }]}>
            {denied ? 'Sem a sua localização' : 'Está no bar?'}
          </Text>
          <Text style={[text(13.5, 'Regular', 1.4), { color: palette.muted }]}>
            {denied
              ? 'Não dá para fazer o check-in sem saber que você está no bar.'
              : 'Faça o check-in e sua avaliação deste jogo conta na nota do bar.'}
          </Text>
        </View>
      </View>
      {denied ? (
        // Sem beco: os Ajustes do iOS, onde a permissão volta.
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openSettings()}
          style={[styles.settings, { backgroundColor: palette.ink }]}
        >
          <Text style={[text(14.5, 'Bold', 1.2), { color: palette.bg }]}>
            Abrir Ajustes
          </Text>
        </Pressable>
      ) : (
        <AcidButton
          leading="pin"
          label={
            phase === 'locating'
              ? 'Localizando…'
              : phase === 'sending'
                ? 'Conferindo…'
                : 'Estou aqui'
          }
          busy={phase !== 'idle'}
          onPress={() =>
            withAccount(check, { kind: 'checkin', barId, eventId })
          }
        />
      )}
      <ErrorText style={[text(13.5, 'SemiBold', 1.4), { color: palette.live }]}>
        {error}
      </ErrorText>
    </View>
  )
}

const styles = StyleSheet.create({
  // `.ckc`: raio 22, 16 de respiro, a sombra dura de 3.
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 10,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pin: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unlocks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unlock: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(127,127,120,.22)'
  },
  unlockText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.44
  },
  settings: {
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    justifyContent: 'center'
  }
})
