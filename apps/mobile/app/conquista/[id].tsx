import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Card } from '@/components/card'
import { Glass } from '@/components/glass'
import { Medal3D, MedalImage, useMedalPalette } from '@/components/medal'
import { EASE, haptic, SWAP, usePressScale } from '@/components/motion'
import {
  ACID,
  BackButton,
  GlassRound,
  Icon,
  LIVE,
  PAPER,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import {
  type Achievement,
  describe,
  fullDate,
  nextInSeries,
  progressLabel,
  progressShare,
  series,
  seriesLabel,
  unit,
  unlockedLine
} from '@/lib/achievements'
import { trpc } from '@/lib/trpc'

/*
 * Uma medalha (09 do design). Abre de dois jeitos:
 * - da estante, o detalhe (2j): a medalha em 3D que gira com o dedo, o que
 *   ela pede, quando e onde saiu, e as outras da mesma série;
 * - logo depois de ganhar (`?nova=1`), a conquista desbloqueada (2k): a
 *   medalha girando sozinha, o que a liberou e a próxima da série. "Ver
 *   medalha" troca para o detalhe na mesma tela.
 */

export default function Medal() {
  const P = useMedalPalette()
  const params = useLocalSearchParams<{ id: string; nova?: string }>()
  const insets = useSafeAreaInsets()
  useStatusBar('auto')
  const mine = useQuery(trpc.achievements.mine.queryOptions())
  const list = mine.data?.achievements ?? []
  const [id, setId] = useState(params.id)
  const [fresh, setFresh] = useState(params.nova === '1')
  // Vindo da desbloqueada ("Ver medalha"), o detalhe entra em fade: a troca
  // da tela inteira de uma vez parece defeito.
  const fromUnlock = useRef(params.nova === '1').current
  const medal = list.find((a) => a.id === id)

  if (!medal) {
    return (
      <View style={[styles.screen, styles.center, { backgroundColor: P.bg }]}>
        {mine.isPending ? (
          <ActivityIndicator color={P.ink} />
        ) : (
          <>
            <Text style={[text(15, 'SemiBold'), { color: P.ink }]}>
              Medalha não encontrada.
            </Text>
            <BackButton icon="close" />
          </>
        )}
      </View>
    )
  }

  const share = () =>
    Share.share({
      message: medal.unlockedAt
        ? `Ganhei a medalha ${medal.name} na Onside. ${describe(medal)} https://onside.sh`
        : `Estou atrás da medalha ${medal.name} na Onside: ${progressLabel(medal)}. https://onside.sh`
    })

  return (
    <View style={[styles.screen, { backgroundColor: P.bg }]}>
      {/* No papel o acid quase some: o brilho vem mais forte. */}
      <Glow
        strength={(fresh ? 0.18 : 0.13) * (P.dark ? 1 : 2.4)}
        rx={fresh ? '60%' : '70%'}
      />
      {fresh ? (
        <Unlocked
          medal={medal}
          list={list}
          insets={insets}
          share={share}
          onSee={() => setFresh(false)}
        />
      ) : (
        <Animated.View
          style={{ flex: 1 }}
          entering={fromUnlock ? DETAIL_IN : undefined}
        >
          <Detail
            medal={medal}
            list={list}
            insets={insets}
            share={share}
            onPick={setId}
          />
        </Animated.View>
      )}
    </View>
  )
}

/** O que a medalha 3D grava no verso: a data e o lugar em que saiu. */
const engraving = (a: Achievement) => ({
  id: a.id,
  name: a.name,
  locked: !a.unlockedAt,
  date: a.unlockedAt ? fullDate(a.unlockedAt) : undefined,
  where: a.where ?? undefined
})

/** O brilho acid atrás da medalha (radial-gradient do design). */
function Glow({ strength, rx }: { strength: number; rx: string }) {
  const P = useMedalPalette()
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="32%" rx={rx} ry="45%">
          <Stop offset="0" stopColor={ACID} stopOpacity={strength} />
          <Stop offset="0.7" stopColor={P.bg} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  )
}

type ScreenProps = {
  medal: Achievement
  list: Achievement[]
  insets: { top: number; bottom: number }
  share: () => void
}

function Detail({
  medal,
  list,
  insets,
  share,
  onPick
}: ScreenProps & { onPick: (id: string) => void }) {
  const P = useMedalPalette()
  const router = useRouter()
  const firstId = useRef(medal.id).current
  const next = nextInSeries(list, medal)
  const done = Boolean(medal.unlockedAt)
  const stats: [string, string][] = done
    ? [
        ['Conquistada', fullDate(medal.unlockedAt as string)],
        ['Onde', medal.where ?? ''],
        ['Têm essa', `${medal.share}% dos torcedores`]
      ]
    : [
        ['Progresso', progressLabel(medal)],
        [
          'Faltam',
          unit(
            medal.group,
            medal.target - Math.min(medal.progress, medal.target)
          )
        ],
        ['Têm essa', `${medal.share}% dos torcedores`]
      ]

  return (
    <>
      <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
        {/* Aberta por link, sem tela atrás: fechar leva à estante. */}
        <BackButton
          icon="close"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace('/voce/conquistas')
          }
        />
        <Text style={[text(13), { color: P.muted }]}>
          {seriesLabel(list, medal)}
        </Text>
        <ShareButton onPress={share} />
      </View>

      <Medal3D medal={engraving(medal)} drag style={styles.big} />
      <View style={styles.hint}>
        <Icon name="back" size={12} color={P.muted} />
        <Text style={[text(12), { color: P.muted }]}>Arraste para girar</Text>
        <View style={{ transform: [{ scaleX: -1 }] }}>
          <Icon name="back" size={12} color={P.muted} />
        </View>
      </View>

      {/* Trocar de medalha na série: o texto troca em fade curto. */}
      <Animated.View
        key={medal.id}
        entering={medal.id === firstId ? undefined : SWAP}
        style={styles.copy}
      >
        <Title lines={[[medal.name]]} size={48} color={P.ink} />
        <Text
          style={[text(15, 'Regular', 1.45), styles.lead, { color: P.body }]}
        >
          {describe(medal)}
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
          <Card palette={P} shadow={P.drop}>
            <View style={styles.stats}>
              {stats.map(([label, value], i) => (
                <View
                  key={label}
                  style={[
                    styles.stat,
                    i > 0 && styles.statLine,
                    i > 0 && { borderLeftColor: P.line }
                  ]}
                >
                  <Text style={[text(11), { color: P.muted }]}>{label}</Text>
                  <Text
                    style={[
                      text(13, 'Bold'),
                      styles.statValue,
                      { color: P.ink }
                    ]}
                    numberOfLines={2}
                  >
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        </View>
        <View style={styles.series}>
          {series(list, medal.group).map((a) => (
            <SeriesPick
              key={a.id}
              medal={a}
              on={a.id === medal.id}
              onPress={() => {
                if (a.id === medal.id) return
                haptic.select()
                onPick(a.id)
              }}
            />
          ))}
        </View>
      </Animated.View>

      <View
        style={[styles.foot, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <GlassPill label="Compartilhar" onPress={share} />
        <View style={{ flex: 1.2 }}>
          <PillButton
            label={
              next ? `Próxima: ${unit(next.group, next.target)}` : 'Ver todas'
            }
            height={52}
            edge="#000"
            onPress={() => {
              if (!next) return router.back()
              haptic.select()
              onPick(next.id)
            }}
          />
        </View>
      </View>
    </>
  )
}

// Os quadradinhos de confete do design (2k), parados no lugar dele. Entram
// em sequência curta; o resto do movimento é a medalha girando.
const CONFETTI: [number, number, number, string, number][] = [
  [40, 130, 10, ACID, 20],
  [330, 110, 12, LIVE, -15],
  [60, 330, 8, PAPER, 35],
  [336, 300, 9, ACID, 10],
  [200, 100, 7, PAPER, 45],
  [24, 230, 9, LIVE, -20],
  [352, 200, 7, PAPER, 30],
  [110, 190, 6, ACID, 60],
  [296, 380, 8, LIVE, 15],
  [150, 150, 6, LIVE, -30]
]
const CONFETTI_IN = CONFETTI.map((_, i) =>
  ZoomIn.delay(i * 40)
    .duration(260)
    .easing(EASE)
    .withInitialValues({ transform: [{ scale: 0.6 }] })
)
const LINE_IN = FadeIn.delay(200).duration(260)
const DETAIL_IN = FadeIn.duration(220).easing(EASE)

function Unlocked({
  medal,
  list,
  insets,
  share,
  onSee
}: ScreenProps & { onSee: () => void }) {
  const P = useMedalPalette()
  const next = nextInSeries(list, medal)
  // Háptico e confete no quadro em que a medalha aparece, não ao montar a
  // tela: a WebView leva uns 300 ms, e o háptico chegaria antes do visual.
  const [shown, setShown] = useState(false)
  return (
    <>
      {shown &&
        CONFETTI.map(([x, y, size, color, rotate], i) => (
          <Animated.View
            key={`${x}-${y}`}
            entering={CONFETTI_IN[i]}
            style={[
              styles.confetti,
              {
                left: `${(x / 390) * 100}%`,
                top: insets.top - 47 + y
              }
            ]}
          >
            {/* O giro fica por dentro: a entrada anima a escala do de fora. */}
            <View
              style={{
                width: size,
                height: size,
                borderRadius: 1.5,
                // Os quadradinhos de papel viram tinta no claro.
                backgroundColor: color === PAPER ? P.ink : color,
                transform: [{ rotate: `${rotate}deg` }]
              }}
            />
          </Animated.View>
        ))}
      {/* Sem fechar, como no design: a saída é "Ver medalha", no detalhe. */}
      <Medal3D
        medal={engraving(medal)}
        onReady={() => {
          haptic.success()
          setShown(true)
        }}
        style={[styles.spin, { marginTop: insets.top + 49 }]}
      />
      <Animated.View
        entering={LINE_IN}
        style={[styles.copy, { marginTop: 18 }]}
      >
        <Text style={[text(14, 'Bold'), { color: P.hot }]}>
          Conquista desbloqueada
        </Text>
        <Title lines={[[medal.name]]} size={52} color={P.ink} />
        <Text
          style={[text(16, 'Regular', 1.45), styles.lead, { color: P.body }]}
        >
          {unlockedLine(medal)}
        </Text>
        {next ? (
          <View style={styles.progress}>
            <View style={styles.progressRow}>
              <Text style={[text(12.5), { color: P.muted }]}>
                Próxima: {next.name}
              </Text>
              <Text style={[styles.mono, { color: P.muted }]}>
                {progressLabel(next)}
              </Text>
            </View>
            <View style={[styles.bar, { backgroundColor: P.track }]}>
              <GrowBar
                from={
                  Math.max(0, Math.min(next.progress, next.target) - 1) /
                  next.target
                }
                to={progressShare(next)}
                color={P.fill}
              />
            </View>
          </View>
        ) : null}
      </Animated.View>
      <View
        style={[styles.foot, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <GlassPill label="Compartilhar" onPress={share} />
        <View style={{ flex: 1.2 }}>
          <PillButton
            label="Ver medalha"
            height={52}
            edge="#000"
            onPress={onSee}
          />
        </View>
      </View>
    </>
  )
}

/**
 * A barra da próxima medalha enche o passo que acabou de ser dado (4/10 →
 * 5/10), depois do texto: é a hora de celebrar. `scaleX` a partir da
 * esquerda, não `width`. Com "Reduzir movimento", já chega cheia.
 */
function GrowBar({
  from,
  to,
  color
}: {
  from: number
  to: number
  color: string
}) {
  const reduced = useReducedMotion()
  const scale = useSharedValue(reduced || to === 0 ? 1 : from / to)
  useEffect(() => {
    scale.set(withDelay(450, withTiming(1, { duration: 500, easing: EASE })))
  }, [scale])
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: scale.get() }]
  }))
  return (
    <Animated.View
      style={[
        {
          width: `${Math.round(to * 100)}%`,
          height: '100%',
          backgroundColor: color,
          transformOrigin: 'left'
        },
        style
      ]}
    />
  )
}

/** Uma medalha da série, embaixo do detalhe. */
function SeriesPick({
  medal,
  on,
  onPress
}: {
  medal: Achievement
  on: boolean
  onPress: () => void
}) {
  const P = useMedalPalette()
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={medal.name}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.pick,
          on && [
            styles.pickOn,
            { backgroundColor: P.pick, borderColor: P.pickEdge }
          ],
          press.style
        ]}
      >
        <MedalImage id={medal.id} locked={!medal.unlockedAt} size={52} />
      </Animated.View>
    </Pressable>
  )
}

function ShareButton({ onPress }: { onPress: () => void }) {
  const P = useMedalPalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Compartilhar"
      hitSlop={8}
      onPress={onPress}
    >
      <GlassRound>
        <Icon name="share" size={18} color={P.ink} />
      </GlassRound>
    </Pressable>
  )
}

/** "Compartilhar" em vidro, ao lado do botão acid do rodapé. */
function GlassPill({ label, onPress }: { label: string; onPress: () => void }) {
  const P = useMedalPalette()
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ flex: 1 }}
    >
      <Animated.View style={press.style}>
        <Glass
          tone={P.dark ? 'dark' : 'light'}
          interactive
          style={styles.glassPill}
        >
          <Icon name="share" size={17} color={P.ink} />
          <Text style={[text(15, 'Bold'), { color: P.ink }]}>{label}</Text>
        </Glass>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  big: { height: 330, marginHorizontal: 20, marginTop: 4 },
  spin: { width: 250, height: 280, alignSelf: 'center' },
  hint: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: -8
  },
  copy: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 12
  },
  lead: { textAlign: 'center', maxWidth: 320 },
  stats: { flexDirection: 'row' },
  stat: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center'
  },
  statLine: { borderLeftWidth: 1 },
  statValue: { textAlign: 'center' },
  series: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  pick: { padding: 4, borderRadius: 6 },
  pickOn: {
    borderWidth: 1,
    padding: 3
  },
  foot: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    flexDirection: 'row',
    gap: 10
  },
  glassPill: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  confetti: { position: 'absolute' },
  progress: { width: '100%', maxWidth: 300, marginTop: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  bar: {
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    overflow: 'hidden'
  }
})
