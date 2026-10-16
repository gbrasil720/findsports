import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { dayLabel, type Palette, Photo, usePalette } from '@/components/explore'
import { ErrorText, haptic, POP_FAST, usePressScale } from '@/components/motion'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { gameTitle } from '@/lib/my-games'
import { trpc } from '@/lib/trpc'

/*
 * Pós-jogo (3g do design): "Você foi ao bar?" e "Voltaria?" numa tela só.
 * A primeira é a pergunta de presença (`attendance.report`, WEB-128), que só
 * existe para quem marcou "Vou assistir aqui"; a segunda é a avaliação
 * (`ratings.submit`). Faltam, do design: "O que pesou?" entre os cartões e o
 * "Enviar" (WEB-398: o servidor não guarda o motivo) e o cartão "Sua Nª
 * resenha" (WEB-403: não há conquistas).
 */

export default function AfterGame() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  useStatusBar('auto')
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const pending = useQuery(trpc.ratings.getPending.queryOptions())
  const reports = useQuery(trpc.attendance.pendingReports.queryOptions())
  // O jogo vem de Meus jogos; quem só abriu rota ou WhatsApp chega pela
  // lista de avaliações pendentes.
  const game =
    mine.data?.find((item) => item.eventId === eventId) ??
    pending.data?.find((item) => item.eventId === eventId)
  const asksPresence = Boolean(
    reports.data?.some((item) => item.eventId === eventId)
  )
  const canRate = Boolean(
    pending.data?.some((item) => item.eventId === eventId)
  )
  const [went, setWent] = useState(true)
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null)

  const report = useMutation(trpc.attendance.report.mutationOptions())
  const rate = useMutation(trpc.ratings.submit.mutationOptions())
  const sending = report.isPending || rate.isPending
  const error = report.error?.message ?? rate.error?.message ?? null

  const send = async () => {
    if (!game) return
    try {
      if (asksPresence)
        await report.mutateAsync({ eventId: game.eventId, attended: went })
      if (went && canRate && wouldReturn !== null)
        await rate.mutateAsync({
          barId: game.barId,
          eventId: game.eventId,
          wouldReturn
        })
    } catch {
      return
    }
    haptic.success()
    await Promise.all(
      [
        trpc.ratings.getPending.queryKey(),
        trpc.attendance.pendingReports.queryKey()
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    )
    router.back()
  }

  if (!game) {
    return (
      <View
        style={[
          styles.screen,
          styles.center,
          { backgroundColor: palette.bg, paddingTop: insets.top }
        ]}
      >
        {mine.isPending || pending.isPending ? (
          <ActivityIndicator color={palette.ink} />
        ) : (
          <>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Este jogo não tem avaliação aberta.
            </Text>
            <BackButton icon="close" />
          </>
        )}
      </View>
    )
  }

  const rating = went && canRate
  const ready = !sending && (!rating || wouldReturn !== null)
  const day = dayLabel(game.startsAt, Date.now())

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.body, { paddingTop: insets.top + 8 }]}>
        <View style={styles.top}>
          <BackButton icon="close" />
          <Text
            style={[
              text(13),
              { color: palette.muted, flexShrink: 1, textAlign: 'right' }
            ]}
            numberOfLines={1}
          >
            {day} · {gameTitle(game)}
          </Text>
        </View>

        <Card palette={palette} soft>
          <View style={styles.went}>
            <Photo
              uri={'photoUrl' in game ? game.photoUrl : null}
              name={game.barName}
              palette={palette}
              style={styles.photo}
            />
            <Text
              style={[
                text(14, 'Regular', 1.4),
                { color: palette.ink, flex: 1 }
              ]}
            >
              Você foi ao{' '}
              <Text style={text(14, 'Bold', 1.4)}>{game.barName}</Text>?
            </Text>
            {asksPresence ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: went }}
                accessibilityLabel="Fui ao bar"
                hitSlop={8}
                onPress={() => {
                  haptic.select()
                  setWent(!went)
                }}
                style={[
                  styles.wentChip,
                  { backgroundColor: went ? ACID : palette.mark }
                ]}
              >
                {went ? <Icon name="check" size={13} color={INK} /> : null}
                <Text
                  style={[
                    text(13, 'Bold', 1.2),
                    { color: went ? INK : palette.ink }
                  ]}
                >
                  {went ? 'Sim, fui' : 'Não fui'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        {rating ? (
          <>
            <View style={{ marginTop: 10 }}>
              <Title lines={[['Voltaria?']]} size={48} color={palette.ink} />
            </View>
            <View style={styles.choices}>
              <Choice
                palette={palette}
                label="Voltaria"
                selected={wouldReturn === true}
                onPress={() => setWouldReturn(true)}
                icon="fan"
              />
              <Choice
                palette={palette}
                label="Não voltaria"
                selected={wouldReturn === false}
                onPress={() => setWouldReturn(false)}
                icon="close"
              />
            </View>
          </>
        ) : null}

        <ErrorText style={[text(13.5, 'SemiBold'), { color: LIVE }]}>
          {error}
        </ErrorText>
      </View>

      <View
        style={[styles.foot, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <PillButton
          label={sending ? 'Enviando…' : 'Enviar'}
          onPress={send}
          disabled={!ready}
        />
      </View>
    </View>
  )
}

/** O cartão grande de "Voltaria" e "Não voltaria". */
function Choice({
  palette,
  label,
  selected,
  onPress,
  icon
}: {
  palette: Palette
  label: string
  selected: boolean
  onPress: () => void
  icon: 'fan' | 'close'
}) {
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={() => {
        if (!selected) haptic.select()
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ flex: 1 }}
    >
      <Animated.View style={press.style}>
        <View
          style={[
            styles.choiceShadow,
            { backgroundColor: selected ? INK : palette.mark }
          ]}
        />
        <View
          style={[
            styles.choice,
            selected
              ? { backgroundColor: ACID, borderColor: ACID }
              : { backgroundColor: palette.card, borderColor: palette.ring }
          ]}
        >
          {selected ? (
            <Animated.View key="on" entering={POP_FAST}>
              <Icon name={icon} size={30} color={INK} accent={INK} />
            </Animated.View>
          ) : (
            <Icon
              name={icon}
              size={30}
              color={palette.ink}
              accent={palette.accent}
            />
          )}
          <Text
            style={[
              text(17, 'Bold', 1.3),
              { color: selected ? INK : palette.ink }
            ]}
          >
            {label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  body: { flex: 1, paddingHorizontal: 18, gap: 16 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  went: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12
  },
  photo: { width: 44, height: 44, borderRadius: 4 },
  wentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4
  },
  choices: { flexDirection: 'row', gap: 12 },
  choiceShadow: {
    ...StyleSheet.absoluteFill,
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 6
  },
  choice: {
    height: 146,
    borderRadius: 6,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between'
  },
  foot: { paddingHorizontal: 16, paddingTop: 12 }
})
