import { type ReactNode, useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { SWAP } from '@/components/motion'
import {
  ACID,
  Icon,
  INK,
  LIVE,
  MAX_FONT_SCALE,
  Text,
  text
} from '@/components/ui'
import { AiIcon } from './icons'
import type { AiPalette } from './theme'

/*
 * Cabeçalho da busca com IA (rodada 5, `.iah`): o ícone num ladrilho de
 * tinta, "Busca com IA" e o status em mono com o ponto (oliva no claro, acid
 * no escuro; pulsando enquanto pensa). "+" começa outra conversa, "×" fecha
 * a folha. Os botões são sólidos: vidro só no que é do sistema.
 */
export function AiHeader({
  status,
  busy,
  quiet,
  palette,
  onNew,
  onClose
}: {
  status: string
  busy: boolean
  /** Limite ou fora do ar: o ponto apaga. */
  quiet?: boolean
  palette: AiPalette
  onNew?: () => void
  onClose: () => void
}) {
  return (
    <View style={styles.head}>
      <View
        style={[styles.tile, palette.dark && { backgroundColor: '#26261f' }]}
      >
        <Icon name="sparkle" size={22} color={ACID} accent={LIVE} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(17, 'Bold', 1.3), { color: palette.ink }]}>
          Busca com IA
        </Text>
        <View style={styles.status}>
          <StatusDot busy={busy} quiet={quiet} dark={palette.dark} />
          {/* A frase troca com um esmaecer curto. */}
          <Animated.Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            key={status}
            entering={SWAP}
            numberOfLines={1}
            style={[styles.statusText, { color: palette.muted }]}
          >
            {status}
          </Animated.Text>
        </View>
      </View>
      {onNew ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nova conversa"
          hitSlop={6}
          onPress={onNew}
        >
          <Round palette={palette}>
            <AiIcon name="plus" size={20} color={palette.ink} />
          </Round>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        hitSlop={6}
        onPress={onClose}
      >
        <Round palette={palette}>
          <Icon name="close" size={20} color={palette.ink} />
        </Round>
      </Pressable>
    </View>
  )
}

/** O ponto do status; pensando, pulsa (1,2 s). Com menos movimento, parado. */
function StatusDot({
  busy,
  quiet,
  dark
}: {
  busy: boolean
  quiet?: boolean
  dark: boolean
}) {
  const reduced = useReducedMotion()
  const fade = useSharedValue(1)
  useEffect(() => {
    if (!busy || reduced) {
      cancelAnimation(fade)
      fade.set(1)
      return
    }
    fade.set(
      withRepeat(
        withTiming(0.35, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      )
    )
  }, [busy, reduced, fade])
  const style = useAnimatedStyle(() => ({ opacity: fade.get() }))
  return (
    <Animated.View
      style={[
        styles.dot,
        {
          backgroundColor: quiet
            ? 'transparent'
            : busy || dark
              ? ACID
              : '#7f9a12'
        },
        quiet && { borderWidth: 1, borderColor: '#aaa9a4' },
        style
      ]}
    />
  )
}

/**
 * O cabeçalho da busca com IA em tela cheia (Adaptativo 03, chatHead):
 * voltar, o ícone com "Busca com IA" e "+". O status do celular não entra.
 */
export function AiTopBar({
  palette,
  onBack,
  onNew
}: {
  palette: AiPalette
  onBack?: () => void
  onNew?: () => void
}) {
  return (
    <View style={styles.bar}>
      {onBack ? (
        <RoundButton
          icon="back"
          label="Voltar"
          palette={palette}
          onPress={onBack}
        />
      ) : null}
      <View style={styles.barTitle}>
        <Icon
          name="sparkle"
          size={26}
          color={palette.ink}
          accent={palette.accent}
        />
        <Text style={[text(17, 'Bold', 1.3), { color: palette.ink }]}>
          Busca com IA
        </Text>
      </View>
      {onNew ? (
        <RoundButton
          icon="plus"
          label="Nova conversa"
          palette={palette}
          onPress={onNew}
        />
      ) : null}
    </View>
  )
}

/** Voltar ou "+" no vidro redondo (40 no design; 56 na faixa do Duo). */
export function RoundButton({
  icon,
  label,
  palette,
  size = 40,
  onPress
}: {
  icon: 'back' | 'plus'
  label: string
  palette: AiPalette
  size?: number
  onPress: () => void
}) {
  const glyph = Math.round(size * 0.45)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
    >
      <Round palette={palette} size={size}>
        {icon === 'plus' ? (
          <AiIcon name="plus" size={glyph} color={palette.ink} />
        ) : (
          <Icon name="back" size={glyph} color={palette.ink} />
        )}
      </Round>
    </Pressable>
  )
}

/** O botão redondo do cabeçalho: sólido, na cor de chip (`.rb` sem sombra). */
export function Round({
  palette,
  size = 40,
  children
}: {
  palette: AiPalette
  size?: number
  children: ReactNode
}) {
  return (
    <View
      style={[
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.mark
        }
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barTitle: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 8,
    paddingHorizontal: 16
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    flexShrink: 1
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  round: { alignItems: 'center', justifyContent: 'center' }
})
