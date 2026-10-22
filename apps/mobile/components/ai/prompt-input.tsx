import { type RefObject, useEffect } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { Glass } from '@/components/glass'
import { EASE, haptic, ScalePress } from '@/components/motion'
import { ACID, Icon, INK, text } from '@/components/ui'
import { AiIcon } from './icons'
import { XChip } from './response'
import type { AiPalette } from './theme'

/*
 * Campo (PromptInput): o contexto em chips (local e dia, com ×), o texto,
 * "+" para pôr contexto de volta, "Meus gostos", o microfone (o ditado é o
 * do teclado do sistema) e enviar. Enviar fica acid só com texto e vira
 * parar enquanto a resposta chega.
 */

// O ícone troca crescendo, sem transparência (o botão fica sobre o vidro).
const ICON_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ scale: 0.5 }] },
    animations: {
      transform: [
        { scale: withSpring(1, { duration: 260, dampingRatio: 0.8 }) }
      ]
    }
  }
}

export type ContextChip = { label: string; onRemove: () => void }

export function PromptInput({
  inputRef,
  draft,
  onDraft,
  placeholder,
  busy,
  editable = true,
  place,
  day,
  tastes,
  palette,
  onTastes,
  onAdd,
  onSend,
  onStop
}: {
  inputRef: RefObject<TextInput | null>
  draft: string
  onDraft: (value: string) => void
  placeholder: string
  busy: boolean
  editable?: boolean
  place: ContextChip | null
  day: ContextChip | null
  tastes: boolean
  palette: AiPalette
  onTastes: () => void
  onAdd: () => void
  onSend: () => void
  onStop: () => void
}) {
  const ready = !busy && draft.trim().length > 0
  const mode = busy ? 2 : ready ? 1 : 0
  const progress = useSharedValue(mode)
  useEffect(() => {
    progress.set(withTiming(mode, { duration: 180, easing: EASE }))
  }, [mode, progress])
  const idle = palette.dark ? 'rgba(241,238,230,.12)' : 'rgba(18,18,15,.08)'
  const button = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1, 2],
      [idle, ACID, palette.stop]
    )
  }))
  // A sombra dura (2 pt) sai de trás do botão só quando dá para enviar.
  const drop = useAnimatedStyle(() => {
    const out = progress.get() <= 1 ? progress.get() : 2 - progress.get()
    return {
      transform: [{ translateX: out * 2 }, { translateY: out * 2 }]
    }
  })

  return (
    <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.field}>
      {place || day ? (
        <View style={styles.context}>
          {place ? (
            <XChip
              label={place.label}
              icon="pin"
              palette={palette}
              onRemove={place.onRemove}
            />
          ) : null}
          {day ? (
            <XChip
              label={day.label}
              icon="cal"
              palette={palette}
              onRemove={day.onRemove}
            />
          ) : null}
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        value={draft}
        onChangeText={onDraft}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        multiline
        submitBehavior="submit"
        returnKeyType="send"
        onSubmitEditing={onSend}
        maxLength={300}
        style={[styles.input, { color: palette.ink }]}
      />
      <View style={styles.controls}>
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Adicionar local ou dia"
          to={0.9}
          onPress={onAdd}
          style={[styles.round, { borderColor: palette.outline }]}
        >
          <AiIcon name="plus" size={15} color={palette.ink} />
        </ScalePress>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: tastes }}
          accessibilityLabel="Usar meus gostos"
          onPress={() => {
            haptic.select()
            onTastes()
          }}
          style={[styles.tastes, { borderColor: palette.outline }]}
        >
          <View
            style={[
              styles.tasteRing,
              { backgroundColor: tastes ? palette.tasteRing : 'transparent' }
            ]}
          >
            <View
              style={[
                styles.tasteDot,
                tastes
                  ? { backgroundColor: ACID }
                  : { borderWidth: 1.5, borderColor: palette.muted }
              ]}
            />
          </View>
          <Text
            style={[
              text(12.5, 'SemiBold', 1.2),
              { color: tastes ? palette.ink : palette.muted }
            ]}
          >
            Meus gostos
          </Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {/* Ditado: o microfone do teclado do sistema. Tocar aqui abre o
            teclado, com o microfone dele à mão. */}
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel="Ditar"
          hitSlop={8}
          to={0.9}
          onPress={() => inputRef.current?.focus()}
        >
          <AiIcon name="mic" size={20} color={palette.ink} />
        </ScalePress>
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Parar' : 'Enviar'}
          disabled={!busy && !ready}
          accessibilityState={{ disabled: !busy && !ready }}
          to={0.92}
          onPress={busy ? onStop : onSend}
          style={styles.sendBox}
        >
          <Animated.View
            style={[styles.send, { backgroundColor: palette.sendShadow }, drop]}
          />
          <Animated.View style={[styles.send, button]}>
            {busy ? (
              <Animated.View
                key="stop"
                entering={ICON_IN}
                style={[styles.stop, { backgroundColor: palette.stopMark }]}
              />
            ) : (
              <Animated.View key={ready ? 'on' : 'off'} entering={ICON_IN}>
                <Icon
                  name="arrowUp"
                  size={18}
                  color={ready ? INK : palette.muted}
                />
              </Animated.View>
            )}
          </Animated.View>
        </ScalePress>
      </View>
    </Glass>
  )
}

const styles = StyleSheet.create({
  field: {
    marginHorizontal: 12,
    borderRadius: 26,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 10,
    gap: 10,
    overflow: 'hidden'
  },
  context: { flexDirection: 'row', gap: 6, overflow: 'hidden' },
  input: {
    ...text(15.5, 'Regular', 1.4),
    paddingHorizontal: 4,
    paddingTop: 0,
    paddingBottom: 0,
    maxHeight: 22 * 4
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  round: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tastes: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  // O ponto de 8 pt com o anel de 2 pt (box-shadow do design).
  tasteRing: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -2
  },
  tasteDot: { width: 8, height: 8, borderRadius: 4 },
  sendBox: { width: 40, height: 40 },
  send: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stop: { width: 12, height: 12, borderRadius: 3 }
})
