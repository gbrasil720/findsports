import { forwardRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useBlink, type useShake } from '@/components/motion'
import {
  ACID,
  FG,
  FIELD,
  LINE_STRONG,
  PAPER,
  Text,
  TextInput,
  themed
} from '@/components/ui'

/*
 * As seis caixas do código do autenticador (11s do design). O login (11s) é
 * escuro fixo; ligar a verificação nas Configurações segue o tema, com a
 * caixa ativa como o campo focado: borda de tinta e sombra acid.
 */

export const DIGITS = 6

const DARK = {
  box: '#1c1c18',
  border: 'rgba(241,238,230,.14)',
  active: ACID,
  shadow: '#000',
  glow: 'rgba(201,241,53,.3)',
  digit: PAPER,
  caret: ACID
}
const THEMED = {
  box: FIELD,
  border: LINE_STRONG,
  active: FG,
  shadow: themed('rgba(18,18,15,.05)', 'rgba(0,0,0,.5)'),
  glow: ACID,
  digit: FG,
  caret: FG
}

/** O cursor da caixa ativa, piscando. */
function Caret({ color }: { color: string }) {
  const blink = useBlink()
  return (
    <Animated.View
      style={[styles.caret, { backgroundColor: color }, blink.style]}
    />
  )
}

/** Caixas que tremem no erro: `useShake` de quem usa, em `shake`. */
export const CodeBoxes = forwardRef<
  TextInput,
  {
    code: string
    onChange: (digits: string) => void
    tone: 'dark' | 'theme'
    shake: ReturnType<typeof useShake>
    /** O login (11s) abre com o teclado; ligar a verificação, não. */
    autoFocus?: boolean
  }
>(function CodeBoxes({ code, onChange, tone, shake, autoFocus = true }, ref) {
  const [focused, setFocused] = useState(autoFocus)
  const c = tone === 'dark' ? DARK : THEMED
  const focus = () =>
    (ref as { current: TextInput | null } | null)?.current?.focus()
  return (
    <Animated.View style={shake.style}>
      <Pressable
        accessibilityLabel="Código de 6 dígitos"
        onPress={focus}
        style={styles.boxes}
      >
        {Array.from({ length: DIGITS }, (_, index) => {
          const active = focused && index === Math.min(code.length, DIGITS - 1)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: posição fixa
            <View key={index} style={{ flex: 1 }}>
              <View
                style={[
                  styles.shadow,
                  { backgroundColor: active ? c.glow : c.shadow }
                ]}
              />
              <View
                style={[
                  styles.box,
                  { backgroundColor: c.box, borderColor: c.border },
                  active && { borderWidth: 2, borderColor: c.active }
                ]}
              >
                {code[index] ? (
                  <Text style={[styles.digit, { color: c.digit }]}>
                    {code[index]}
                  </Text>
                ) : active ? (
                  <Caret color={c.caret} />
                ) : null}
              </View>
            </View>
          )
        })}
        <TextInput
          ref={ref}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={DIGITS}
          value={code}
          onChangeText={(value) =>
            onChange(value.replace(/\D/g, '').slice(0, DIGITS))
          }
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          caretHidden
          style={styles.hidden}
        />
      </Pressable>
    </Animated.View>
  )
})

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 8 },
  box: {
    height: 60,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1
  },
  shadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    borderRadius: 6
  },
  digit: { fontFamily: 'GeistMono-SemiBold', fontSize: 26 },
  caret: { width: 2, height: 26 },
  // O teclado digita aqui; as caixas só mostram.
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 }
})
