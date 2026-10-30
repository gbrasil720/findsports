import { useQuery } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLayout } from '@/components/layout'
import { Medal3D, useMedalPalette } from '@/components/medal'
import {
  CoverMedal,
  engraving,
  GlassPill,
  Glow,
  MedalDetail,
  medalCard
} from '@/components/medal-detail'
import { EASE, haptic, popFrom } from '@/components/motion'
import { PALETTE, PaletteProvider } from '@/components/theme'
import {
  ACID,
  BackButton,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import {
  type Achievement,
  describe,
  nextInSeries,
  progressLabel,
  progressShare,
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
 *
 * Fora do celular (A06) as medidas seguem a tela; no tablet o desbloqueio é
 * um cartão no meio, sobre a estante (`transparentModal`, em `app/_layout`),
 * e na tela de fora do Flip, a medalha girando com "Compartilhar".
 */

export default function Medal() {
  const P = useMedalPalette()
  const params = useLocalSearchParams<{ id: string; nova?: string }>()
  const insets = useSafeAreaInsets()
  const layout = useLayout()
  const window = useWindowDimensions()
  const phone = layout.kind === 'phone' || layout.kind === 'duoClosed'
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

  if (layout.kind === 'cover')
    return <CoverMedal medal={medal} list={list} share={share} />

  // O desbloqueio no tablet: cartão de até 560 x 720 no meio da tela, com a
  // estante escurecida atrás. Sem fechar, como no celular.
  if (fresh && medalCard(layout.nav)) {
    const width = Math.min(560, window.width - 80)
    const height = Math.min(720, window.height - 120)
    return (
      <Animated.View entering={SCRIM_IN} style={styles.scrim}>
        {/* Escuro nos dois temas, como o design desenha o cartão. */}
        <PaletteProvider value={PALETTE.dark}>
          <Animated.View
            entering={CARD_IN}
            style={[styles.card, { width, height, backgroundColor: INK }]}
          >
            {/* O recorte fica por dentro: no iOS ele apagaria a sombra. */}
            <View
              style={[
                styles.cardInner,
                { borderColor: 'rgba(241,238,230,.1)' }
              ]}
            >
              <Glow strength={0.18} rx="60%" />
              <Unlocked
                medal={medal}
                list={list}
                insets={{ top: 0, bottom: 28 }}
                share={share}
                onSee={() => setFresh(false)}
                frame={{
                  width,
                  height,
                  medal: Math.min(240, height * 0.34),
                  top: 40
                }}
              />
            </View>
          </Animated.View>
        </PaletteProvider>
      </Animated.View>
    )
  }

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
          frame={
            phone
              ? undefined
              : {
                  width: window.width,
                  height: window.height,
                  medal: Math.min(250, window.height * 0.32),
                  top: insets.top + 20
                }
          }
        />
      ) : (
        <Animated.View
          style={{ flex: 1 }}
          entering={fromUnlock ? DETAIL_IN : undefined}
        >
          <MedalDetail
            medal={medal}
            list={list}
            insets={insets}
            share={share}
            onPick={setId}
            frame={
              phone
                ? undefined
                : {
                    width: window.width,
                    medal: Math.min(window.width - 40, window.height * 0.36),
                    title: 48,
                    tiers: 52
                  }
            }
          />
        </Animated.View>
      )}
    </View>
  )
}

type ScreenProps = {
  medal: Achievement
  list: Achievement[]
  insets: { top: number; bottom: number }
  share: () => void
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
const CONFETTI_IN = CONFETTI.map((_, i) => popFrom(0.6, i * 40))
const LINE_IN = FadeInDown.delay(120)
  .duration(260)
  .easing(EASE)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
const DETAIL_IN = FadeIn.duration(220).easing(EASE)
const SCRIM_IN = FadeIn.duration(200).easing(EASE)
const CARD_IN = popFrom(0.96, 60)

function Unlocked({
  medal,
  list,
  insets,
  share,
  onSee,
  frame
}: ScreenProps & {
  onSee: () => void
  /**
   * Fora do celular: o espaço (a tela, ou o cartão do tablet), o lado da
   * medalha e onde ela começa. Sem ele, as medidas do 2k (390 x 844).
   */
  frame?: { width: number; height: number; medal: number; top: number }
}) {
  const P = useMedalPalette()
  const next = nextInSeries(list, medal)
  // Háptico, confete e texto no quadro em que a medalha aparece, não ao
  // montar a tela: a WebView leva uns 300 ms, e o resto chegaria antes dela.
  // Se ela não avisar, a tela segue sozinha em 1,2 s.
  const [shown, setShown] = useState(false)
  const revealed = useRef(false)
  const reveal = useCallback(() => {
    if (revealed.current) return
    revealed.current = true
    haptic.success()
    setShown(true)
  }, [])
  useEffect(() => {
    const timer = setTimeout(reveal, 1200)
    return () => clearTimeout(timer)
  }, [reveal])
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
                top: frame
                  ? frame.top - 96 + (y / 844) * frame.height
                  : insets.top - 47 + y
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
        onReady={reveal}
        style={
          frame
            ? {
                width: frame.medal,
                height: Math.round(frame.medal * 1.12),
                alignSelf: 'center',
                marginTop: frame.top
              }
            : [styles.spin, { marginTop: insets.top + 49 }]
        }
      />
      {shown ? (
        <Animated.View
          entering={LINE_IN}
          style={[styles.copy, { marginTop: 18 }]}
        >
          <Text style={[text(14, 'Bold'), { color: P.hot }]}>
            Conquista desbloqueada
          </Text>
          <Title
            lines={[[medal.name]]}
            size={frame && frame.width < 600 ? 48 : 52}
            color={P.ink}
          />
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
      ) : null}
      <View
        style={[
          styles.foot,
          frame && {
            left: Math.max(16, (frame.width - 420) / 2),
            right: Math.max(16, (frame.width - 420) / 2)
          },
          { paddingBottom: Math.max(insets.bottom, 16) }
        ]}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  spin: { width: 250, height: 280, alignSelf: 'center' },
  copy: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 12
  },
  lead: { textAlign: 'center', maxWidth: 320 },
  foot: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    flexDirection: 'row',
    gap: 10
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
  },
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,.58)'
  },
  // O cartão do desbloqueio no tablet: a sombra dura acid do design.
  card: {
    borderRadius: 14,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 8, height: 8 }
  },
  cardInner: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden'
  }
})
