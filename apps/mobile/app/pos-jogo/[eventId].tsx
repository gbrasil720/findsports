import {
  RATING_REASONS,
  type RatingReasonId
} from '@findsports_oficial/api/lib/rating-reasons'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeOut } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { dayLabel, Photo } from '@/components/explore'
import { MedalImage } from '@/components/medal'
import {
  ErrorText,
  haptic,
  POP_FAST,
  ScalePress,
  SWAP,
  usePressScale
} from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { type Achievement, reviewLine } from '@/lib/achievements'
import { trpc } from '@/lib/trpc'

/*
 * Pós-jogo (3g do design): "Você foi ao bar?" e "Voltaria?" numa tela só,
 * um item de `postGame.pending`. A primeira (WEB-128) só existe para quem
 * marcou "Vou assistir aqui"; a segunda conta para as medalhas de resenha (o
 * cartão "Sua Nª resenha"). "O que pesou?" (WEB-398) são só etiquetas,
 * opcionais. Tudo vai num `postGame.answer`, que grava junto ou nada.
 */

export default function AfterGame() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  useStatusBar('auto')
  const pending = useQuery(trpc.postGame.pending.queryOptions())
  const achievements = useQuery(trpc.achievements.mine.queryOptions())
  const game = pending.data?.find((item) => item.eventId === eventId)
  const asksPresence = Boolean(game?.presence)
  const canRate = Boolean(game?.rating)
  const [went, setWent] = useState(true)
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null)
  const [reasons, setReasons] = useState<RatingReasonId[]>([])

  const answer = useMutation(trpc.postGame.answer.mutationOptions())
  const sending = answer.isPending
  const error = answer.error?.message ?? null

  const send = async () => {
    if (!game) return
    try {
      // "Não fui" não leva nota: o servidor recusaria a resposta inteira.
      await answer.mutateAsync({
        eventId: game.eventId,
        attended: asksPresence ? went : undefined,
        rating:
          went && canRate && wouldReturn !== null
            ? { wouldReturn, reasons }
            : undefined
      })
    } catch {
      return
    }
    haptic.success()
    await Promise.all(
      [
        trpc.postGame.pending.queryKey(),
        // A resenha pode dar medalha: a conquista nova abre sozinha.
        trpc.achievements.mine.queryKey()
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
        {pending.isPending ? (
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

        <Card soft>
          <View style={styles.went}>
            <Photo
              uri={game.photoUrl}
              name={game.barName}
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
                label="Voltaria"
                selected={wouldReturn === true}
                onPress={() => setWouldReturn(true)}
                icon="fan"
              />
              <Choice
                label="Não voltaria"
                selected={wouldReturn === false}
                onPress={() => setWouldReturn(false)}
                icon="close"
              />
            </View>
            <View style={styles.weighed}>
              <Text style={[text(14, 'Bold', 1.4), { color: palette.ink }]}>
                O que pesou?{' '}
                <Text
                  style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
                >
                  opcional
                </Text>
              </Text>
              <View style={styles.reasons}>
                {RATING_REASONS.map((reason) => {
                  const on = reasons.includes(reason.id)
                  return (
                    <ScalePress
                      key={reason.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      hitSlop={4}
                      onPress={() => {
                        haptic.select()
                        setReasons(
                          on
                            ? reasons.filter((id) => id !== reason.id)
                            : [...reasons, reason.id]
                        )
                      }}
                      style={[
                        styles.reason,
                        on
                          ? {
                              backgroundColor: palette.ink,
                              borderColor: palette.ink
                            }
                          : { borderColor: palette.line }
                      ]}
                    >
                      <Text
                        style={[
                          text(13, 'SemiBold', 1.3),
                          { color: on ? palette.bg : palette.ink }
                        ]}
                      >
                        {reason.label}
                      </Text>
                    </ScalePress>
                  )
                })}
              </View>
            </View>
          </>
        ) : null}

        {rating && achievements.data ? (
          // Some e volta com "Não fui"/"Sim, fui": fade curto, sem salto.
          <Animated.View entering={SWAP} exiting={CARD_OUT}>
            <ReviewCount list={achievements.data.achievements} />
          </Animated.View>
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

const CARD_OUT = FadeOut.duration(120)

/** "Sua 7ª resenha. Faltam 3 para a medalha Crítico." (3g). */
function ReviewCount({ list }: { list: Achievement[] }) {
  const palette = usePalette()
  const { head, tail, next } = reviewLine(list)
  return (
    <Card
      fill={palette.dark ? palette.card : INK}
      shadow="rgba(201,241,53,.85)"
      offset={5}
    >
      <View style={styles.review}>
        {next ? <MedalImage id={next.id} locked size={60} /> : null}
        <Text style={[text(13, 'Regular', 1.4), styles.reviewText]}>
          <Text style={[text(13, 'Bold', 1.4), { color: PAPER }]}>{head}</Text>
          {tail ? ` ${tail}` : ''}
        </Text>
      </View>
    </Card>
  )
}

/** O cartão grande de "Voltaria" e "Não voltaria". */
function Choice({
  label,
  selected,
  onPress,
  icon
}: {
  label: string
  selected: boolean
  onPress: () => void
  icon: 'fan' | 'close'
}) {
  const palette = usePalette()
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
    height: 120,
    borderRadius: 6,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between'
  },
  weighed: { gap: 10, marginTop: 2 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 4,
    borderWidth: 1
  },
  foot: { paddingHorizontal: 16, paddingTop: 12 },
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 6,
    paddingRight: 14
  },
  reviewText: { flex: 1, color: '#d6d3cb' }
})
