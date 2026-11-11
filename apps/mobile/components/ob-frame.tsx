import { useRouter } from 'expo-router'
import { type ComponentProps, type ReactNode, useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleOnRN } from 'react-native-worklets'
import { EASE, haptic, usePress } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  Text,
  text,
  useStatusBar
} from '@/components/ui'

/*
 * A moldura do onboarding B (rodada 2 do redesign, `obFrame` do desenho):
 * em cima o voltar e o "Pular", a barra de progresso (passo × 20%), o
 * conteúdo e, no pé, a nota em mono e o botão acid. 22 dos lados, 14 entre as
 * peças.
 */

const OLIVE = '#7f9a12'

/** O título do passo em Anton: a segunda parte na cor de destaque. */
export function ObTitle({
  plain,
  hot,
  size,
  breakLine
}: {
  plain: string
  hot: string
  size: number
  /** Quebra antes do destaque ("Sua carteirinha / de torcedor"). */
  breakLine?: boolean
}) {
  const palette = usePalette()
  // Anton corta o topo com `lineHeight` menor que a altura natural (1,505em):
  // uma linha por vez, com margem negativa, como o `Title` de `ui`.
  const line = {
    fontFamily: 'Anton',
    fontSize: size,
    marginVertical: -0.2425 * size
  }
  const hl = { color: palette.dark ? ACID : '#e8320c' }
  const up = (value: string) => value.toLocaleUpperCase('pt-BR')
  return (
    <View accessible accessibilityRole="header">
      {breakLine ? (
        <>
          <Text style={[line, { color: palette.ink }]}>{up(plain)}</Text>
          <Text style={[line, hl]}>{up(hot)}</Text>
        </>
      ) : (
        <Text style={[line, { color: palette.ink }]}>
          {up(plain)} <Text style={hl}>{up(hot)}</Text>
        </Text>
      )}
    </View>
  )
}

/** O botão acid do desenho (`.b-acid`): 56 de altura, sombra oliva de 4. */
export function AcidButton({
  label,
  leading,
  disabled,
  busy,
  onPress,
  hold
}: {
  label: string
  leading?: ComponentProps<typeof Icon>['name']
  disabled?: boolean
  busy?: boolean
  onPress: () => void
  /**
   * Segurar para validar: a faixa escura enche em 1,2 s, linear, e volta em
   * 200 ms ao soltar. Com menos movimento, um toque basta.
   */
  hold?: boolean
}) {
  const press = usePress(0, 3)
  const reduced = useReducedMotion()
  const fill = useSharedValue(0)
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: fill.get() }]
  }))
  // O envio falhou: a faixa volta, para segurar de novo.
  useEffect(() => {
    if (!busy && fill.get() >= 1)
      fill.set(withTiming(0, { duration: 200, easing: EASE }))
  }, [busy, fill])
  const holding = hold && !reduced
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityHint={holding ? 'Segure até a faixa encher' : undefined}
      disabled={disabled || busy}
      onPressIn={() => {
        press.onPressIn()
        if (!holding) return
        fill.set(
          withTiming(1, { duration: 1200, easing: Easing.linear }, (done) => {
            if (done) scheduleOnRN(onPress)
          })
        )
      }}
      onPressOut={() => {
        press.onPressOut()
        if (!holding || fill.get() >= 1) return
        cancelAnimation(fill)
        fill.set(withTiming(0, { duration: 200, easing: EASE }))
      }}
      onPress={holding ? undefined : onPress}
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <View style={styles.edge} />
      <Animated.View style={[styles.button, press.style]}>
        {hold ? <Animated.View style={[styles.fill, fillStyle]} /> : null}
        {leading ? (
          <Icon name={leading} size={20} color={INK} accent={INK} />
        ) : null}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          style={[text(16, 'Bold', 1.2), { color: INK }]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

export function ObPage({
  step,
  back = true,
  onSkip,
  note,
  action,
  cta,
  scroll = true,
  progress = true,
  children
}: {
  /** 1 a 5: a barra enche passo × 20%. */
  step: number
  back?: boolean
  /** "Pular": sem ele, nada no canto. */
  onSkip?: () => void
  /** A linha em mono acima do botão. */
  note?: ReactNode
  /** Um link no lugar da nota ("Prefiro escolher a cidade"). */
  action?: ReactNode
  cta: ReactNode
  scroll?: boolean
  /** Sem a barra (edição pelas Configurações). */
  progress?: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const body = <View style={styles.body}>{children}</View>
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: palette.bg,
        paddingTop: insets.top + 6
      }}
    >
      <View style={styles.pad}>
        <View style={styles.top}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={12}
              onPress={() => router.back()}
            >
              <Icon name="back" size={22} color={palette.ink} />
            </Pressable>
          ) : (
            <View />
          )}
          {onSkip ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => {
                haptic.select()
                onSkip()
              }}
            >
              <Text style={[text(14, 'SemiBold'), { color: palette.muted }]}>
                Pular
              </Text>
            </Pressable>
          ) : null}
        </View>
        {progress ? (
          <View style={[styles.progress, { backgroundColor: palette.mark }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${step * 20}%`, backgroundColor: palette.ink }
              ]}
            />
          </View>
        ) : null}
      </View>
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{body}</View>
      )}
      <View
        // O botão a 29 pt do pé, como no desenho (a barra de início dentro).
        style={[
          styles.pad,
          styles.cta,
          { paddingBottom: Math.max(insets.bottom - 5, 16) }
        ]}
      >
        {note ? (
          <Text style={[styles.note, { color: palette.muted }]}>{note}</Text>
        ) : null}
        {action}
        {cta}
      </View>
    </View>
  )
}

/** Negrito da nota, na cor do texto ("<b>23 bares</b> com jogo hoje"). */
export function NoteStrong({ children }: { children: ReactNode }) {
  const palette = usePalette()
  return <Text style={{ color: palette.ink }}>{children}</Text>
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 22, gap: 14 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 24
  },
  progress: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  scroll: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14 },
  body: { gap: 14 },
  cta: { paddingTop: 8 },
  note: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: -4
  },
  edge: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    bottom: -4,
    borderRadius: 28,
    backgroundColor: OLIVE
  },
  button: {
    height: 56,
    borderRadius: 28,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    overflow: 'hidden'
  },
  fill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,18,15,.14)',
    transformOrigin: 'left'
  }
})
