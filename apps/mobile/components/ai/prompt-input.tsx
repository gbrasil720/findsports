import type { RefObject } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  type EntryExitAnimationFunction,
  withTiming
} from 'react-native-reanimated'
import { EASE, haptic, ScalePress } from '@/components/motion'
import { ACID, Icon, Text, TextInput, text } from '@/components/ui'
import { AiIcon } from './icons'
import { XChip } from './response'
import type { AiPalette } from './theme'

/*
 * Campo (PromptInput, `.cmp` da rodada 5): cartão sólido com o contexto em
 * chips (local e dia, com ×), o texto, "+" para pôr contexto de volta, "Meus
 * gostos" e enviar, em tinta. Enquanto a resposta chega, enviar vira o X de
 * parar. O ditado é o do teclado do sistema.
 */

// O ícone troca crescendo, sem passar do ponto: é troca de estado, não gesto.
const ICON_IN: EntryExitAnimationFunction = () => {
  'worklet'
  return {
    initialValues: { transform: [{ scale: 0.6 }] },
    animations: {
      transform: [{ scale: withTiming(1, { duration: 180, easing: EASE }) }]
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
  return (
    <View
      style={[
        styles.field,
        {
          backgroundColor: palette.card,
          borderColor: palette.line,
          shadowColor: palette.drop
        }
      ]}
    >
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
          style={[styles.round, { backgroundColor: palette.mark }]}
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
          style={[styles.tastes, { backgroundColor: palette.mark }]}
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
        {/* Ocupado, o botão vira o parar (o X sobre cinza, `.go.stop`). */}
        <ScalePress
          accessibilityRole="button"
          accessibilityLabel={busy ? 'Parar' : 'Enviar'}
          disabled={!busy && !ready}
          accessibilityState={{ disabled: !busy && !ready }}
          to={0.92}
          onPress={busy ? onStop : onSend}
          style={[
            styles.send,
            { backgroundColor: busy ? palette.mark : palette.ink }
          ]}
        >
          <Animated.View key={busy ? 'stop' : 'send'} entering={ICON_IN}>
            <Icon
              name={busy ? 'close' : 'arrowUp'}
              size={busy ? 16 : 18}
              color={busy ? palette.ink : palette.bg}
            />
          </Animated.View>
        </ScalePress>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    marginHorizontal: 12,
    borderRadius: 26,
    borderWidth: 1.5,
    paddingTop: 12,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    gap: 10,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
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
    alignItems: 'center',
    justifyContent: 'center'
  },
  tastes: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
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
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
