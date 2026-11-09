import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { useExploreState } from '@/components/explore-state'
import { EASE, ErrorText, haptic } from '@/components/motion'
import {
  clearDraft,
  OnboardingCard,
  OnboardingTop,
  StepFooter,
  useFrameKind,
  useOnboarding
} from '@/components/onboarding'
import { usePalette } from '@/components/theme'
import {
  ACID,
  CARD,
  EDGE,
  FG,
  Icon,
  INK,
  LINE,
  LIVE,
  Screen,
  SUB,
  Text,
  Title,
  text,
  themed
} from '@/components/ui'
import { refreshSession } from '@/lib/auth-client'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * "Confere e valida" (rodada 2 do redesign, onboarding B): a carteirinha
 * inteira, cada linha com "Trocar", e o botão de segurar. Segurar é lento e
 * honesto (a barra enche em 1,2 s, linear); soltar antes volta rápido (200
 * ms). Cheia, o envio único (`onboarding.completeFan`) e o selo carimba a
 * carteirinha na tela seguinte (`pronto`). Com menos movimento, segurar vira
 * toque.
 */

const HOLD_MS = 1200
/** O trilho do botão antes de encher: o acid apagado, nos dois temas. */
const HOLD_TRACK = themed('#e3f1a6', '#4d5a1c')

function Row({
  icon,
  title,
  sub,
  onChange
}: {
  icon: 'tv' | 'fan' | 'pin' | 'bell'
  title: string
  sub: string
  onChange?: () => void
}) {
  return (
    <View style={[styles.row, { borderTopColor: LINE }]}>
      <Icon name={icon} size={17} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={2}
          style={[text(14.5, 'Bold', 1.25), { color: FG }]}
        >
          {title}
        </Text>
        <Text style={[text(12.5, 'Regular', 1.3), { color: SUB }]}>{sub}</Text>
      </View>
      {onChange ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onChange}>
          <Text style={[text(13, 'Bold'), styles.change, { color: FG }]}>
            Trocar
          </Text>
        </Pressable>
      ) : (
        <Icon name="check" size={16} color={FG} />
      )}
    </View>
  )
}

/** "Segure para validar": a barra enche enquanto o dedo fica. */
function HoldButton({
  busy,
  disabled,
  onDone
}: {
  busy: boolean
  disabled: boolean
  onDone: () => void
}) {
  const reduced = useReducedMotion()
  const fill = useSharedValue(0)
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.get() }]
  }))
  const start = () => {
    if (disabled || busy || reduced) return
    fill.set(
      withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (done) => {
        if (done) scheduleOnRN(onDone)
      })
    )
  }
  // O envio falhou: a barra volta, para segurar de novo.
  useEffect(() => {
    if (!busy && fill.get() >= 1)
      fill.set(withTiming(0, { duration: 200, easing: EASE }))
  }, [busy, fill])
  const stop = () => {
    if (fill.get() >= 1) return
    cancelAnimation(fill)
    fill.set(withTiming(0, { duration: 200, easing: EASE }))
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={reduced ? undefined : 'Segure até a barra encher'}
      accessibilityState={{ disabled, busy }}
      disabled={disabled || busy}
      onPressIn={start}
      onPressOut={stop}
      // Com menos movimento, um toque basta.
      onPress={reduced ? onDone : undefined}
    >
      <View style={styles.holdEdge} />
      <View style={[styles.hold, disabled && { opacity: 0.45 }]}>
        <Animated.View style={[styles.holdFill, style]} />
        <Text style={[text(15.5, 'Bold', 1.2), { color: INK }]}>
          {busy
            ? 'Validando…'
            : reduced
              ? 'Toque para validar'
              : 'Segure para validar'}
        </Text>
      </View>
    </Pressable>
  )
}

export default function Review() {
  // Na mesa a pergunta já está na metade de cima (Adaptativo 09).
  const table = useFrameKind() === 'table'
  const router = useRouter()
  const palette = usePalette()
  const { choices } = useOnboarding()
  const { device, district } = useExploreState()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const near = device ?? choices.city
  const count = useQuery({
    ...trpc.pubs.countTodayNear.queryOptions({
      lat: near?.lat ?? 0,
      lng: near?.lng ?? 0,
      radiusKm: choices.radius
    }),
    enabled: Boolean(near)
  })
  const complete = useMutation(
    trpc.onboarding.completeFan.mutationOptions({
      onSuccess: async () => {
        haptic.success()
        clearDraft()
        await refreshSession()
        await queryClient.invalidateQueries()
        router.replace('/onboarding/pronto')
      },
      onError: () => haptic.error()
    })
  )

  const chosenSports = (sports.data ?? []).filter((sport) =>
    choices.sportIds.includes(sport.id)
  )
  const save = () =>
    complete.mutate({
      sportIds: choices.sportIds,
      searchRadiusKm: choices.radius,
      teamIds: choices.teams.map((team) => team.id),
      city: choices.city
        ? { name: choices.city.name, uf: choices.city.uf }
        : undefined
    })
  // "Trocar" volta ao passo; o "Continuar" de lá devolve aqui.
  const change = (route: 'sports' | 'teams' | 'distance') => () =>
    router.push({ pathname: `/onboarding/${route}`, params: { volta: '1' } })
  const place = (device && district) || choices.city?.name

  return (
    <Screen
      gap={14}
      padding={18}
      footer={
        <StepFooter>
          <View style={{ gap: 8 }}>
            <Text style={[styles.hint, { color: SUB }]}>
              Segure o botão: o selo carimba a carteirinha
            </Text>
            <HoldButton
              busy={complete.isPending}
              disabled={choices.sportIds.length === 0}
              onDone={save}
            />
          </View>
        </StepFooter>
      }
    >
      <OnboardingTop step={5} />
      {table ? null : <OnboardingCard lit={null} step={5} />}
      {table ? null : (
        <Title
          lines={[['Confere ', 'e valida']]}
          size={34}
          accentColor={palette.dark ? ACID : LIVE}
        />
      )}
      <View style={[styles.list, { backgroundColor: CARD }]}>
        <Row
          icon="tv"
          title={
            chosenSports.map((sport) => sport.name).join(' · ') ||
            'Nenhum esporte'
          }
          sub="os outros esportes aparecem depois"
          onChange={change('sports')}
        />
        <Row
          icon="fan"
          title={
            choices.teams.map((team) => team.name).join(' · ') ||
            'Nenhum time por enquanto'
          }
          sub="avisamos quando um bar perto marcar"
          onChange={change('teams')}
        />
        <Row
          icon="pin"
          title={`${choices.radius} km${place ? ` · ${place}` : ''}`}
          sub={
            count.data
              ? `${count.data.bars} ${count.data.bars === 1 ? 'bar' : 'bares'} com jogo hoje no raio`
              : 'o raio do Explorar'
          }
          onChange={change('distance')}
        />
        {choices.teams.length ? (
          <Row
            icon="bell"
            title="Aviso do jogo dos seus times"
            sub="quando um bar perto marcar, em Avisos"
          />
        ) : null}
      </View>
      {choices.sportIds.length === 0 ? (
        <Text style={[text(13.5), { color: SUB, textAlign: 'center' }]}>
          Volte e escolha pelo menos um esporte.
        </Text>
      ) : null}
      {complete.error ? (
        <ErrorText style={[text(13.5), { color: LIVE, textAlign: 'center' }]}>
          {complete.error.message || 'Não foi possível salvar. Tente de novo.'}
        </ErrorText>
      ) : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  change: { textDecorationLine: 'underline' },
  hint: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    textAlign: 'center'
  },
  holdEdge: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    bottom: -3,
    borderRadius: 28,
    backgroundColor: EDGE
  },
  hold: {
    height: 56,
    borderRadius: 28,
    // Sólida: translúcida, a sombra de tinta aparecia através.
    backgroundColor: HOLD_TRACK,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  holdFill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: ACID,
    transformOrigin: 'left'
  }
})
