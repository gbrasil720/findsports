import { useRouter } from 'expo-router'
import { useRef } from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { Card } from '@/components/card'
import { Glass } from '@/components/glass'
import { Medal3D, MedalImage, useMedalPalette } from '@/components/medal'
import { haptic, SWAP, usePressScale } from '@/components/motion'
import { PALETTE, PaletteProvider } from '@/components/theme'
import {
  ACID,
  BackButton,
  DISPLAY_FONT_SCALE,
  GlassRound,
  Icon,
  INK,
  PAPER,
  PillButton,
  Text,
  Title,
  text
} from '@/components/ui'
import {
  type Achievement,
  coverLine,
  describe,
  fullDate,
  missingLine,
  nextInSeries,
  progressLabel,
  progressShare,
  series,
  seriesLabel,
  unit
} from '@/lib/achievements'

/** iPad e Galaxy Tab: o desbloqueio abre como cartão (regra 05 da A06). */
export const medalCard = (nav: string) =>
  (Platform.OS === 'ios' && Platform.isPad) || nav === 'rail'

/** O que a medalha 3D grava no verso: a data e o lugar em que saiu. */
export const engraving = (a: Achievement) => ({
  id: a.id,
  name: a.name,
  locked: !a.unlockedAt,
  date: a.unlockedAt ? fullDate(a.unlockedAt) : undefined,
  where: a.where ?? undefined
})

/** O brilho acid atrás da medalha (radial-gradient do design). */
export function Glow({ strength, rx }: { strength: number; rx: string }) {
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

/**
 * O detalhe de uma medalha (2j): a medalha em 3D que gira com o dedo, o que
 * ela pede, quando e onde saiu, e as outras da mesma série. Em tela cheia
 * (`app/conquista/[id].tsx`) ou ao lado da estante no tablet e no dobrável
 * aberto (A06), com as medidas do espaço que tem (`frame`).
 */
export function MedalDetail({
  medal,
  list,
  insets,
  share,
  onPick,
  frame
}: {
  medal: Achievement
  list: Achievement[]
  insets: { top: number; bottom: number }
  share: () => void
  onPick: (id: string) => void
  /**
   * Fora do celular: a largura do espaço, o lado da medalha e o tamanho do
   * nome. `close: false` ao lado da estante, onde não há o que fechar.
   */
  frame?: { width: number; medal: number; title: number; close?: boolean }
}) {
  const P = useMedalPalette()
  const router = useRouter()
  // O texto e o rodapé numa coluna de até 420, no meio do espaço.
  const side = frame ? Math.max(16, (frame.width - 420) / 2) : 16
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
        {frame?.close === false ? (
          <View style={{ width: 42 }} />
        ) : (
          // Aberta por link, sem tela atrás: fechar leva à estante.
          <BackButton
            icon="close"
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace('/voce/conquistas')
            }
          />
        )}
        <Text style={[text(13), { color: P.muted }]}>
          {seriesLabel(list, medal)}
        </Text>
        <ShareButton onPress={share} />
      </View>

      <Medal3D
        medal={engraving(medal)}
        drag
        style={
          frame
            ? [
                styles.big,
                { width: frame.medal, height: frame.medal, alignSelf: 'center' }
              ]
            : styles.big
        }
      />
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
        style={[styles.copy, frame && { paddingHorizontal: side }]}
      >
        <Title lines={[[medal.name]]} size={frame?.title ?? 48} color={P.ink} />
        <Text
          style={[text(15, 'Regular', 1.45), styles.lead, { color: P.body }]}
        >
          {describe(medal)}
        </Text>
        <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
          <Card shadow={P.drop}>
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
        style={[
          styles.foot,
          {
            left: side,
            right: side,
            paddingBottom: Math.max(insets.bottom, 16)
          }
        ]}
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
export function GlassPill({
  label,
  onPress
}: {
  label: string
  onPress: () => void
}) {
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
          <Text
            style={[text(15, 'Bold'), { color: P.ink, flexShrink: 1 }]}
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </Text>
        </Glass>
      </Animated.View>
    </Pressable>
  )
}

/**
 * A tela de fora do Z Flip 8 (A06): a medalha girando, o que ela é e a
 * próxima da série, com "Compartilhar". Sempre no escuro, como o design.
 */
export function CoverMedal({
  medal,
  list,
  share
}: {
  medal: Achievement
  list: Achievement[]
  share: () => void
}) {
  const insets = useSafeAreaInsets()
  const next = nextInSeries(list, medal)
  const done = Boolean(medal.unlockedAt)
  return (
    <PaletteProvider value={PALETTE.dark}>
      <View style={[styles.cover, { paddingTop: insets.top + 28 }]}>
        <View style={styles.coverRow}>
          <Medal3D medal={engraving(medal)} style={styles.coverMedal} />
          <View style={styles.coverCopy}>
            {done ? <Text style={styles.coverKicker}>DESBLOQUEOU</Text> : null}
            <Text style={styles.coverName}>{medal.name}</Text>
            <Text style={[text(12.5, 'Regular', 1.35), { color: '#aaa9a4' }]}>
              {done ? coverLine(medal) : missingLine(medal)}
            </Text>
            {next ? (
              <>
                <View style={styles.coverTrack}>
                  <View
                    style={{
                      width: `${Math.round(progressShare(next) * 100)}%`,
                      height: '100%',
                      backgroundColor: ACID
                    }}
                  />
                </View>
                <Text style={styles.coverMono}>
                  PRÓXIMA {progressLabel(next)}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <View style={[styles.coverPill, { bottom: insets.bottom + 26 }]}>
          <PillButton
            label="Compartilhar"
            leading="share"
            height={50}
            edge="#000"
            onPress={share}
          />
        </View>
      </View>
    </PaletteProvider>
  )
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  big: { height: 330, marginHorizontal: 20, marginTop: 4 },
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
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  cover: { flex: 1, backgroundColor: INK, paddingHorizontal: 22 },
  coverRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  coverMedal: { width: 120, height: 120, marginTop: 6 },
  coverCopy: { flex: 1, minWidth: 0, gap: 8, paddingTop: 6 },
  coverKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: ACID
  },
  coverName: {
    fontFamily: 'Anton',
    fontSize: 30,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -7
  },
  coverTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2c2c27',
    overflow: 'hidden',
    marginTop: 4
  },
  coverMono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    color: '#aaa9a4'
  },
  coverPill: { position: 'absolute', right: 22, width: 180 }
})
