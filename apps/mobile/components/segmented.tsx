import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { Text, text } from '@/components/ui'

/**
 * O seletor da rodada 4 (`.seg2`): Próximos / Anteriores, Já fui / Salvos /
 * Bares. Dezenas de trocas por dia: a pílula anda (200 ms EASE), o conteúdo
 * troca seco.
 */
export function Segmented<T extends string>({
  items,
  value,
  onChange
}: {
  items: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  const palette = usePalette()
  const [width, setWidth] = useState(0)
  const index = Math.max(
    0,
    items.findIndex((item) => item.key === value)
  )
  const cell = width / items.length
  const x = useSharedValue(index * cell)
  useEffect(() => {
    x.set(withTiming(index * cell, { duration: 200, easing: EASE }))
  }, [index, cell, x])
  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }]
  }))
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width - 8)}
      style={[styles.track, { backgroundColor: palette.mark }]}
    >
      {width ? (
        <Animated.View
          style={[
            styles.pill,
            { width: cell, backgroundColor: palette.ink },
            pill
          ]}
        />
      ) : null}
      {items.map((item) => {
        const on = item.key === value
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return
              haptic.select()
              onChange(item.key)
            }}
            style={styles.cell}
          >
            <Text
              style={[
                text(14, 'SemiBold', 1.2),
                { color: on ? palette.bg : palette.ink }
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, borderRadius: 22 },
  pill: {
    position: 'absolute',
    top: 4,
    left: 4,
    height: 36,
    borderRadius: 18
  },
  cell: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' }
})
