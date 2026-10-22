import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  withDelay,
  withTiming
} from 'react-native-reanimated'
import { Chip } from '@/components/explore'
import { EASE, haptic, ScalePress } from '@/components/motion'
import { Icon } from '@/components/ui'
import type { followUps } from '@/lib/ai-chat'
import { type AiGlyph, AiIcon } from './icons'
import type { AiPalette } from './theme'
import { MONO } from './tool'

/*
 * Ações e versões (Actions · Branch): copiar, refazer, polegar para cima e
 * para baixo, compartilhar; "‹ 2/2 ›" aparece quando a resposta foi refeita.
 * Seguimento (Suggestion): até três perguntas que rolam para o lado, acima
 * do campo, mais "Ver no mapa" quando há bares.
 */

export function Actions({
  feedback,
  version,
  palette,
  onCopy,
  onRedo,
  onRate,
  onShare,
  onVersion
}: {
  feedback: 1 | -1 | null
  /** "2/2", ou nada. */
  version: string | null
  palette: AiPalette
  onCopy: () => void
  onRedo: () => void
  onRate: (value: 1 | -1) => void
  onShare: () => void
  onVersion: (by: -1 | 1) => void
}) {
  return (
    <View style={styles.row}>
      <Action icon="copy" label="Copiar" palette={palette} onPress={onCopy} />
      <Action icon="redo" label="Refazer" palette={palette} onPress={onRedo} />
      <Action
        icon="thumbUp"
        label="Ajudou"
        on={feedback === 1}
        palette={palette}
        onPress={() => onRate(1)}
      />
      <Action
        icon="thumbDown"
        label="Não ajudou"
        on={feedback === -1}
        palette={palette}
        onPress={() => onRate(-1)}
      />
      <Action share label="Compartilhar" palette={palette} onPress={onShare} />
      <View style={{ flex: 1 }} />
      {version ? (
        <View style={styles.versions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Versão anterior"
            hitSlop={10}
            onPress={() => {
              haptic.select()
              onVersion(-1)
            }}
          >
            <AiIcon
              name="chevron"
              size={13}
              color={palette.muted}
              rotate={90}
            />
          </Pressable>
          <Text style={[styles.version, { color: palette.muted }]}>
            {version}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Próxima versão"
            hitSlop={10}
            onPress={() => {
              haptic.select()
              onVersion(1)
            }}
          >
            <AiIcon
              name="chevron"
              size={13}
              color={palette.muted}
              rotate={-90}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

function Action({
  icon,
  share,
  label,
  on,
  palette,
  onPress
}: {
  icon?: AiGlyph
  share?: boolean
  label: string
  on?: boolean
  palette: AiPalette
  onPress: () => void
}) {
  return (
    <ScalePress
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={on === undefined ? undefined : { selected: on }}
      to={0.88}
      onPress={onPress}
      style={[styles.action, on ? { backgroundColor: palette.thumbOn } : null]}
    >
      {share ? (
        <Icon
          name="share"
          size={17}
          color={palette.muted}
          accent={palette.accent}
        />
      ) : icon ? (
        <AiIcon
          name={icon}
          size={17}
          color={palette.muted}
          accent={palette.accent}
        />
      ) : null}
    </ScalePress>
  )
}

/** As pílulas de vidro sobem sem opacidade (vidro não desenha a meio caminho). */
const rise =
  (index: number): EntryExitAnimationFunction =>
  () => {
    'worklet'
    return {
      initialValues: { transform: [{ translateY: 12 }] },
      animations: {
        transform: [
          {
            translateY: withDelay(
              index * 40,
              withTiming(0, { duration: 220, easing: EASE })
            )
          }
        ]
      }
    }
  }
const RISE = [rise(0), rise(1), rise(2), rise(3)]

export function FollowUps({
  items,
  palette,
  onAsk,
  onMap
}: {
  items: ReturnType<typeof followUps>
  palette: AiPalette
  onAsk: (question: string) => void
  onMap: () => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.pills}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item, i) => (
        <Animated.View key={item.label} entering={RISE[i]}>
          <Chip
            label={item.label}
            icon={item.kind === 'map' ? 'map' : undefined}
            on={false}
            palette={palette}
            onPress={() => (item.kind === 'map' ? onMap() : onAsk(item.label))}
          />
        </Animated.View>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: -4,
    marginLeft: -8
  },
  action: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  versions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  version: { fontFamily: MONO, fontSize: 12, lineHeight: 14 },
  pills: { gap: 8, paddingHorizontal: 12 }
})
