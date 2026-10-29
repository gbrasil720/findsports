import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as Location from 'expo-location'
import { useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Card } from '@/components/card'
import {
  ErrorText,
  haptic,
  LABEL_IN,
  POP_FAST,
  ScalePress,
  SWAP
} from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  errorMessage,
  Icon,
  INK,
  LIVE,
  PAPER,
  Text,
  text
} from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * "Estou aqui" (WEB-408): check-in por localização na página do bar, no dia
 * do jogo (3 h antes a 3 h depois). Pede só a permissão "durante o uso", a do
 * Explorar; a posição vai ao servidor, que confere distância e horário. Feito
 * (ou com o código já validado no balcão), a avaliação deste jogo conta na
 * nota do bar.
 */

type Phase = 'idle' | 'locating' | 'sending'

export function CheckInCard({
  barId,
  eventId,
  done
}: {
  barId: string
  eventId: string
  done: boolean
}) {
  const palette = usePalette()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const checkIn = useMutation(trpc.attendance.checkIn.mutationOptions())

  const run = async () => {
    setError(null)
    setPhase('locating')
    try {
      const asked = await Location.requestForegroundPermissionsAsync()
      if (!asked.granted) {
        if (!asked.canAskAgain) Linking.openSettings()
        setError('Sem a sua localização não dá para fazer o check-in.')
        return
      }
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
      await queryClient.invalidateQueries({
        queryKey: trpc.pubs.getById.queryKey({ id: barId })
      })
    } catch (failure) {
      // A recusa do servidor (longe, fora do horário) chega com a frase dele.
      setError(
        errorMessage(failure, 'Não deu para achar você agora. Tente de novo.')
      )
    } finally {
      setPhase('idle')
    }
  }

  const label =
    phase === 'locating'
      ? 'Localizando…'
      : phase === 'sending'
        ? 'Conferindo…'
        : 'Estou aqui'

  return (
    <Card soft>
      <View style={styles.row}>
        <View
          style={[styles.mark, { backgroundColor: done ? ACID : palette.mark }]}
        >
          {done ? (
            <Animated.View key="done" entering={POP_FAST}>
              <Icon name="check" size={16} color={INK} />
            </Animated.View>
          ) : (
            <Icon name="pin" size={16} color={palette.ink} />
          )}
        </View>
        <Animated.View
          key={done ? 'done' : 'ask'}
          entering={SWAP}
          style={{ flex: 1, gap: 2 }}
        >
          <Text style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}>
            {done ? 'Presença confirmada' : 'Está no bar?'}
          </Text>
          <Text style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}>
            {done
              ? 'Sua avaliação deste jogo vai contar na nota do bar.'
              : 'Faça o check-in e sua avaliação deste jogo conta na nota do bar.'}
          </Text>
        </Animated.View>
        {done ? null : (
          <ScalePress
            accessibilityRole="button"
            accessibilityState={{ busy: phase !== 'idle' }}
            disabled={phase !== 'idle'}
            onPress={run}
            style={[
              styles.button,
              { backgroundColor: palette.dark ? ACID : INK }
            ]}
          >
            <Animated.Text
              key={phase}
              entering={phase === 'idle' ? undefined : LABEL_IN}
              style={[
                text(13.5, 'Bold', 1.2),
                { color: palette.dark ? INK : PAPER }
              ]}
              numberOfLines={1}
            >
              {label}
            </Animated.Text>
          </ScalePress>
        )}
      </View>
      <ErrorText
        style={[text(12.5, 'SemiBold', 1.4), styles.error, { color: LIVE }]}
      >
        {error}
      </ErrorText>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  mark: {
    width: 30,
    height: 30,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  button: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 4
  },
  error: { paddingHorizontal: 12, paddingBottom: 12, marginTop: -4 }
})
