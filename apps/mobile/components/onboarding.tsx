import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from 'react'
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native'
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { EASE, haptic, POP } from '@/components/motion'
import {
  ACID,
  BackButton,
  BG,
  DISPLAY_FONT_SCALE,
  DROP,
  EDGE,
  FG,
  HOT,
  Icon,
  INK,
  LINE,
  LINE_STRONG,
  MAX_FONT_SCALE,
  PAPER,
  SUB,
  Text,
  text
} from '@/components/ui'
import { trpc } from '@/lib/trpc'

/*
 * Peças do onboarding do torcedor ("05 Onboarding do torcedor" do design,
 * 4i–4n): as escolhas de todos os passos num contexto, o topo com o
 * progresso e os controles de escolha (esporte, time, raio). Os passos são
 * rotas em `app/onboarding/`; o envio é um só, no fim, como no web
 * (`onboarding.completeFan`).
 */

export const STEPS = 5
export type Radius = 1 | 3 | 5 | 10
export type City = { name: string; uf: string; lat: number; lng: number }
export type Team = {
  id: string
  name: string
  sportId: string
  /** WEB-381: piloto e lutador são "atleta"; o resto, "time". */
  kind: 'team' | 'athlete'
}

type Choices = {
  sportIds: string[]
  teams: Team[]
  city: City | null
  radius: Radius
}

const Context = createContext<{
  choices: Choices
  set: (patch: Partial<Choices>) => void
} | null>(null)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  // O raio começa em 3 km, o padrão do servidor (`searchRadiusKm`).
  const [choices, setChoices] = useState<Choices>({
    sportIds: [],
    teams: [],
    city: null,
    radius: 3
  })
  const set = (patch: Partial<Choices>) =>
    setChoices((current) => ({ ...current, ...patch }))
  return (
    <Context.Provider value={{ choices, set }}>{children}</Context.Provider>
  )
}

export function useOnboarding() {
  const value = useContext(Context)
  if (!value) throw new Error('useOnboarding fora de app/onboarding')
  return value
}

/**
 * Esportes e times pelas Configurações ("Editar", 11f): as mesmas telas do
 * onboarding com `?edit=1`, começando do que a pessoa já tem e salvando no
 * fim dos times, sem passar por distância e revisão.
 */
export function useEditing() {
  const { edit } = useLocalSearchParams<{ edit?: string }>()
  const editing = edit === '1'
  const router = useRouter()
  const queryClient = useQueryClient()
  const { choices, set } = useOnboarding()
  const sports = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    enabled: editing
  })
  const teams = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    enabled: editing
  })
  // Uma vez, quando as duas chegam e o contexto ainda está vazio. Em efeito:
  // o contexto é do layout, e mudá-lo durante a renderização da tela erra.
  const ready = Boolean(sports.data && teams.data)
  const [filled, setFilled] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao chegar
  useEffect(() => {
    if (!editing || !ready || filled) return
    setFilled(true)
    if (choices.sportIds.length === 0)
      set({
        sportIds: (sports.data ?? []).map((p) => p.sportId),
        teams: (teams.data ?? []).map((t) => ({ ...t, kind: 'team' as const }))
      })
  }, [editing, ready, filled])
  const savePrefs = useMutation(trpc.pubs.updateMyPreferences.mutationOptions())
  const saveTeams = useMutation(trpc.pubs.updateMyTeams.mutationOptions())
  const save = async () => {
    await savePrefs.mutateAsync({ sportIds: choices.sportIds })
    await saveTeams.mutateAsync({ teamIds: choices.teams.map((t) => t.id) })
    haptic.success()
    for (const key of [
      trpc.pubs.getMyPreferences.queryKey(),
      trpc.pubs.getMyTeams.queryKey(),
      trpc.recommendations.get.queryKey()
    ])
      queryClient.invalidateQueries({ queryKey: key })
    router.dismissTo('/configuracoes')
  }
  // Por baixo da primeira tela da edição o expo-router põe as boas-vindas:
  // voltar (botão ou gesto) sai da edição, menos dos times para os esportes.
  const { from } = useLocalSearchParams<{ from?: string }>()
  const leave = () =>
    from === 'sports' ? router.back() : router.dismissTo('/configuracoes')
  const back = editing ? (
    <>
      <Stack.Screen options={{ gestureEnabled: from === 'sports' }} />
      <BackButton onPress={leave} />
    </>
  ) : null
  return {
    editing,
    back,
    ready: !editing || filled,
    save,
    saving: savePrefs.isPending || saveTeams.isPending,
    failed: savePrefs.isError || saveTeams.isError
  }
}

/** "FU", "BA", "F1", "MMA": a sigla grande atrás do nome do esporte. */
export function sportMark(name: string) {
  const acronym = name.match(/\b[A-Z]{2,}\b/)
  if (acronym) return acronym[0]
  const digit = name.match(/^(\p{L})\S*\s+(\d)/u)
  if (digit) return `${digit[1]}${digit[2]}`.toUpperCase()
  const words = name.split(/\s+/)
  if (words.length > 1)
    return words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// --- Topo -------------------------------------------------------------------

/** Um segmento do progresso: a tinta enche da esquerda ao chegar no passo. */
function Segment({ on }: { on: boolean }) {
  const fill = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    fill.value = withTiming(on ? 1 : 0, { duration: 260, easing: EASE })
  }, [on, fill])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.value }]
  }))
  return (
    <View style={styles.segment}>
      <Animated.View style={[styles.segmentFill, style]} />
    </View>
  )
}

/** "Conta de torcedor" (ou voltar), o progresso e "N de 5". */
export function OnboardingTop({ step }: { step: number }) {
  return (
    <View style={styles.top}>
      {step === 1 ? (
        <Text style={[text(13, 'Bold'), { color: HOT }]}>
          Conta de torcedor
        </Text>
      ) : (
        <BackButton />
      )}
      <View style={styles.segments}>
        {Array.from({ length: STEPS }, (_, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa
          <Segment key={index} on={index < step} />
        ))}
      </View>
      <Text style={[text(13, 'SemiBold'), { color: SUB }]}>
        {step} de {STEPS}
      </Text>
    </View>
  )
}

// --- Escolhas ---------------------------------------------------------------

/** Escolher acende: fundo, sombra dura e borda passam em 200 ms. */
function useSelected(selected: boolean) {
  const on = useSharedValue(selected ? 1 : 0)
  useEffect(() => {
    on.value = withTiming(selected ? 1 : 0, { duration: 200, easing: EASE })
  }, [selected, on])
  return on
}

/**
 * As cores sem escolha (fundo, texto, texto secundário) em cor pronta: o
 * `interpolateColor` não aceita a cor dinâmica do tema. O texto troca junto
 * com o fundo; trocando na hora, no escuro ele sumia nos primeiros quadros.
 */
const useIdle = () =>
  useColorScheme() === 'dark'
    ? { idle: '#1c1c18', ink: PAPER, sub: '#aaa9a4', dark: true }
    : { idle: '#faf8f3', ink: INK, sub: '#55554f', dark: false }

/** A cor de um texto que vai de `from` (sem escolha) a `to` (escolhido). */
function useTextColor(on: SharedValue<number>, from: string, to: string) {
  return useAnimatedStyle(() => ({
    color: interpolateColor(on.value, [0, 1], [from, to])
  }))
}

/** Um esporte (4j): acid com sombra de tinta quando escolhido. */
export function SportTile({
  name,
  selected,
  onPress
}: {
  name: string
  selected: boolean
  onPress: () => void
}) {
  const on = useSelected(selected)
  const { idle, ink } = useIdle()
  const card = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [idle, ACID])
  }))
  const shadow = useAnimatedStyle(() => ({ opacity: on.value }))
  const label = useTextColor(on, ink, INK)
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={name}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={({ pressed }) => [
        styles.tileWrap,
        pressed && { transform: [{ scale: 0.98 }] }
      ]}
    >
      <View style={styles.tileIdleShadow} />
      <Animated.View style={[styles.tileShadow, shadow]} />
      <Animated.View style={[styles.tile, card]}>
        <Animated.Text
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          style={[styles.tileMark, { opacity: selected ? 0.16 : 0.08 }, label]}
          numberOfLines={1}
        >
          {sportMark(name)}
        </Animated.Text>
        <Animated.Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[text(16, 'Bold'), label]}
        >
          {name}
        </Animated.Text>
        {selected ? (
          <Animated.View entering={POP} style={styles.tileCheck}>
            <Icon name="check" size={13} color={ACID} />
          </Animated.View>
        ) : null}
      </Animated.View>
    </Pressable>
  )
}

/** Um time (4k): tinta com sombra acid quando escolhido. */
export function TeamChip({
  name,
  selected,
  onPress
}: {
  name: string
  selected: boolean
  onPress: () => void
}) {
  const on = useSelected(selected)
  // Escolhido é tinta no claro e papel no escuro: o inverso do fundo.
  const { idle, ink, dark } = useIdle()
  const lit = dark ? PAPER : INK
  const chip = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [idle, lit])
  }))
  const shadow = useAnimatedStyle(() => ({ opacity: on.value }))
  const label = useTextColor(on, ink, dark ? INK : PAPER)
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
    >
      <View style={styles.chipIdleShadow} />
      <Animated.View style={[styles.chipShadow, shadow]} />
      <Animated.View style={[styles.chip, chip]}>
        {selected ? (
          <Animated.View entering={POP}>
            <Icon name="check" size={14} color={dark ? INK : ACID} />
          </Animated.View>
        ) : null}
        <Animated.Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[text(14, 'SemiBold'), label]}
        >
          {name}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  )
}

/** A sigla do esporte em caixinha de tinta, no cabeçalho de cada grupo. */
export function SportBadge({ name }: { name: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{sportMark(name).slice(0, 3)}</Text>
    </View>
  )
}

const RADIUS_LABEL: Record<Radius, string> = {
  1: 'a pé',
  3: 'bem perto',
  5: 'no bairro',
  10: 'explorar mais'
}

/** Um raio (4l). */
export function RadiusTile({
  km,
  selected,
  onPress
}: {
  km: Radius
  selected: boolean
  onPress: () => void
}) {
  const on = useSelected(selected)
  const { idle, ink, sub } = useIdle()
  const tile = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [idle, ACID])
  }))
  const shadow = useAnimatedStyle(() => ({ opacity: on.value }))
  const kmColor = useTextColor(on, ink, INK)
  const labelColor = useTextColor(on, sub, INK)
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${km} km, ${RADIUS_LABEL[km]}`}
      onPress={() => {
        if (!selected) haptic.select()
        onPress()
      }}
      style={{ flex: 1 }}
    >
      <View style={styles.tileIdleShadow} />
      <Animated.View style={[styles.tileShadow, shadow]} />
      <Animated.View style={[styles.radius, tile]}>
        <Animated.Text
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          style={[styles.radiusKm, kmColor]}
        >
          {km}
        </Animated.Text>
        <Animated.Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[text(11.5, 'SemiBold', 1.25), labelColor]}
        >
          km · {RADIUS_LABEL[km]}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 40 },
  segments: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: LINE_STRONG
  },
  segmentFill: {
    flex: 1,
    backgroundColor: FG,
    transformOrigin: 'left'
  },
  tileWrap: { flex: 1 },
  // O design soma o espaçamento à altura (88 + 2 × 12, `box-sizing` padrão).
  tile: {
    height: 112,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: LINE
  },
  // Sombra dura de tinta (escolhido) sobre a sombra leve (não escolhido).
  tileShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6,
    backgroundColor: EDGE
  },
  tileIdleShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6,
    backgroundColor: DROP
  },
  tileMark: {
    position: 'absolute',
    right: -4,
    top: -10,
    fontFamily: 'Anton',
    fontSize: 60
  },
  tileCheck: {
    position: 'absolute',
    top: 10,
    left: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chip: {
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: LINE
  },
  chipShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    borderRadius: 5,
    backgroundColor: ACID
  },
  chipIdleShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 5,
    backgroundColor: DROP
  },
  badge: {
    width: 17,
    height: 17,
    borderRadius: 2,
    backgroundColor: FG,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 7,
    color: BG
  },
  radius: {
    height: 96,
    borderRadius: 6,
    padding: 10,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: LINE
  },
  radiusKm: {
    fontFamily: 'Anton',
    fontSize: 28,
    marginVertical: -7
  }
})
