import { setStatusBarStyle } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView
} from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { haptic } from '@/components/motion'
import { Icon, PAPER, Text, text } from '@/components/ui'
import { categoryIcon, categoryLabel, type GalleryPhoto } from '@/lib/gallery'

/*
 * A foto aberta (rodada 7, 25b): tela escura, a foto inteira, a categoria e a
 * legenda do dono embaixo, "3 de 12" em mono. Abre crescendo da miniatura
 * (shared element por scale + translate, mola {300, dampingRatio 1}) e volta
 * para ela ao fechar. Arrastar para os lados passa (paginação nativa); puxar
 * para baixo segue o dedo 1:1, o fundo clareia junto, e fecha com 25% da
 * altura ou 800 pt/s, senão volta com a mesma mola. Movimento reduzido: só
 * esmaece.
 */

export type Frame = { x: number; y: number; width: number; height: number }

const SPRING = { duration: 300, dampingRatio: 1 }
const BLACK = '#0b0b09'
/** A foto ocupa a largura toda, um pouco mais alta que larga (25b). */
const RATIO = 1.08

/** Os pontos da paginação (`.dots7`): até cinco, com a foto aberta no meio. */
function Dots({ count, index }: { count: number; index: number }) {
  if (count < 2) return null
  const shown = Math.min(5, count)
  const start = Math.max(0, Math.min(index - 2, count - shown))
  return (
    <View style={styles.dots}>
      {Array.from({ length: shown }, (_, n) => {
        const on = start + n === index
        return <View key={start + n} style={[styles.dot, on && styles.dotOn]} />
      })}
    </View>
  )
}

export function PhotoViewer({
  photos,
  start,
  origin,
  onClose
}: {
  photos: readonly GalleryPhoto[]
  start: number
  /** Onde está a miniatura de cada foto, para crescer dela e voltar a ela. */
  origin?: (index: number) => Frame | null
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(start)
  const current = photos[index]
  const photoH = Math.min(width * RATIO, height * 0.62)
  const target: Frame = {
    x: 0,
    y: (height - photoH) / 2 - 10,
    width,
    height: photoH
  }
  // 0 = na miniatura, 1 = aberta. `drag` é o puxar para baixo, em pontos.
  const progress = useSharedValue(0)
  const drag = useSharedValue(0)
  const from = useSharedValue<Frame | null>(origin?.(start) ?? null)
  const closing = useRef(false)

  // Sobre o preto, a barra de status clara; ao fechar, volta a do tema.
  useEffect(() => {
    setStatusBarStyle('light')
    return () => setStatusBarStyle('auto')
  }, [])

  useEffect(() => {
    progress.set(
      reduced ? withTiming(1, { duration: 200 }) : withSpring(1, SPRING)
    )
  }, [progress, reduced])

  const close = () => {
    if (closing.current) return
    closing.current = true
    from.set(origin?.(index) ?? null)
    const done = () => onClose()
    drag.set(withSpring(0, SPRING))
    progress.set(
      reduced || !origin
        ? withTiming(0, { duration: 200 }, (ok) => {
            if (ok) scheduleOnRN(done)
          })
        : withSpring(0, SPRING, (ok) => {
            if (ok) scheduleOnRN(done)
          })
    )
  }

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-16, 16])
    .onUpdate((e) => {
      drag.set(Math.max(-40, e.translationY))
    })
    .onEnd((e) => {
      if (e.translationY > height * 0.25 || e.velocityY > 800) {
        scheduleOnRN(close)
      } else {
        drag.set(withSpring(0, SPRING))
      }
    })

  // A foto: do retângulo da miniatura até o da tela cheia, mais o puxar.
  const photo = useAnimatedStyle(() => {
    const f = from.get()
    const p = progress.get()
    if (!f || reduced) {
      return {
        opacity: f ? 1 : p,
        transform: [{ translateY: drag.get() }]
      }
    }
    const sx = interpolate(p, [0, 1], [f.width / target.width, 1])
    const sy = interpolate(p, [0, 1], [f.height / target.height, 1])
    const cx = interpolate(
      p,
      [0, 1],
      [f.x + f.width / 2, target.x + target.width / 2]
    )
    const cy = interpolate(
      p,
      [0, 1],
      [f.y + f.height / 2, target.y + target.height / 2]
    )
    return {
      transform: [
        { translateX: cx - (target.x + target.width / 2) },
        { translateY: cy - (target.y + target.height / 2) + drag.get() },
        { scaleX: sx },
        { scaleY: sy }
      ]
    }
  })
  // O fundo clareia na proporção do puxar (o padrão do app Fotos).
  const backdrop = useAnimatedStyle(() => ({
    opacity:
      progress.get() *
      interpolate(Math.abs(drag.get()), [0, height * 0.5], [1, 0.2], 'clamp')
  }))
  const chrome = useAnimatedStyle(() => ({
    opacity:
      progress.get() *
      interpolate(Math.abs(drag.get()), [0, 80], [1, 0], 'clamp')
  }))

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: BLACK },
            backdrop
          ]}
        />
        <GestureDetector gesture={pan}>
          <View style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                styles.frame,
                { top: target.y, height: target.height },
                photo
              ]}
            >
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: start * width, y: 0 }}
                onMomentumScrollEnd={(e) => {
                  const next = Math.round(e.nativeEvent.contentOffset.x / width)
                  if (next !== index) {
                    haptic.select()
                    setIndex(next)
                  }
                }}
              >
                {photos.map((p, n) => (
                  <Image
                    key={p.id}
                    source={{ uri: p.url }}
                    accessibilityLabel={
                      p.caption ?? `Foto ${n + 1} de ${photos.length}`
                    }
                    style={{ width, height: target.height }}
                    resizeMode="cover"
                  />
                ))}
              </ScrollView>
            </Animated.View>
          </View>
        </GestureDetector>

        <Animated.View
          pointerEvents="box-none"
          style={[styles.top, { top: insets.top + 6 }, chrome]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            hitSlop={8}
            onPress={close}
            style={styles.round}
          >
            <Icon name="close" size={20} color={PAPER} />
          </Pressable>
          <Text
            accessibilityLabel={`Foto ${index + 1} de ${photos.length}`}
            style={styles.counter}
          >
            {index + 1} de {photos.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartilhar foto"
            hitSlop={8}
            onPress={() => {
              if (current) Share.share({ url: current.url }).catch(() => {})
            }}
            style={styles.round}
          >
            <Icon name="share" size={20} color={PAPER} />
          </Pressable>
        </Animated.View>

        {current ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bottom,
              { paddingBottom: insets.bottom + 24 },
              chrome
            ]}
          >
            <View style={styles.kind}>
              {categoryIcon(current.category) ? (
                <Icon
                  name={categoryIcon(current.category) ?? 'tv'}
                  size={14}
                  color={PAPER}
                />
              ) : null}
              <Text style={[text(13, 'SemiBold', 1.2), { color: PAPER }]}>
                {categoryLabel(current.category)}
              </Text>
            </View>
            {current.caption ? (
              <Text style={[text(15, 'Regular', 1.45), { color: PAPER }]}>
                {current.caption}
              </Text>
            ) : null}
            <Dots count={photos.length} index={index} />
          </Animated.View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(241,238,230,.12)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  counter: { fontFamily: 'GeistMono-SemiBold', fontSize: 13, color: PAPER },
  bottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    gap: 12
  },
  kind: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: 'rgba(241,238,230,.12)'
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 4
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(241,238,230,.3)'
  },
  dotOn: { width: 18, backgroundColor: PAPER }
})
