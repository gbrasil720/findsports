import { useRouter } from 'expo-router'
import { type ComponentProps, type ReactNode, useState } from 'react'
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text, useStatusBar } from '@/components/ui'

/*
 * As telas de segurança dentro da Conta (rodada 8, telas 6b e 6c): voltar
 * redondo, "CONTA" em mono (ou os passos), o título em Anton com a última
 * palavra em destaque, o conteúdo e o botão preso embaixo.
 */

export function AccountPage({
  title,
  accent,
  steps,
  back = true,
  cta,
  children
}: {
  /** "Trocar a "; o destaque vem em `accent` ("senha"). */
  title: string
  accent: string
  /** Os passos (duas etapas): o atual e o total; no lugar de "CONTA". */
  steps?: { current: number; total: number }
  back?: boolean
  /** O botão (e o que vai junto) preso embaixo. */
  cta?: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: palette.bg }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 6, paddingBottom: 24 }
        ]}
      >
        <View style={styles.top}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={8}
              onPress={() => router.back()}
              style={[
                styles.round,
                { backgroundColor: palette.card, shadowColor: palette.drop }
              ]}
            >
              <Icon name="back" size={20} color={palette.ink} />
            </Pressable>
          ) : (
            <View style={{ width: 44 }} />
          )}
          {steps ? (
            <Steps {...steps} />
          ) : (
            <Text style={[styles.kicker, { color: palette.muted }]}>CONTA</Text>
          )}
          <View style={{ width: 44 }} />
        </View>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.ink }]}
        >
          {title}
          <Text style={{ color: palette.hot }}>{accent}</Text>
        </Text>
        {children}
      </ScrollView>
      {cta ? (
        <View
          style={[
            styles.cta,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 }
          ]}
        >
          {cta}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

/** Os passos (`.stp9`): feito vira check acid, o atual em tinta. */
function Steps({ current, total }: { current: number; total: number }) {
  const palette = usePalette()
  return (
    <View
      style={styles.steps}
      accessible
      accessibilityLabel={`Passo ${current} de ${total}`}
    >
      {Array.from({ length: total }, (_, n) => {
        const step = n + 1
        const done = step < current
        const on = step === current
        return (
          <View key={step} style={styles.stepItem}>
            {n ? (
              <View style={[styles.stepLine, { borderColor: palette.line }]} />
            ) : null}
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor: done ? ACID : on ? palette.ink : palette.mark
                }
              ]}
            >
              {done ? (
                <Icon name="check" size={12} color={INK} />
              ) : (
                <Text
                  style={[
                    styles.stepText,
                    { color: on ? palette.bg : palette.muted }
                  ]}
                >
                  {step}
                </Text>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

/** O campo da conta (`.fld9`): rótulo em texto, caixa de canto 16, o olho. */
export function AccountField({
  label,
  secureTextEntry,
  ...input
}: ComponentProps<typeof TextInput> & { label: string }) {
  const palette = usePalette()
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      <Text style={[text(13, 'SemiBold', 1.2), { color: palette.ink }]}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: palette.card,
            borderColor: focused ? palette.ink : palette.line,
            borderWidth: focused ? 2 : 1.5,
            paddingHorizontal: focused ? 13.5 : 14
          }
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={palette.muted}
          selectionColor={palette.ink}
          cursorColor={palette.ink}
          secureTextEntry={secureTextEntry && !shown}
          style={[styles.fieldText, { color: palette.ink }]}
          {...input}
          onFocus={(event) => {
            setFocused(true)
            input.onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            input.onBlur?.(event)
          }}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shown ? 'Esconder a senha' : 'Mostrar a senha'}
            hitSlop={10}
            onPress={() => setShown((value) => !value)}
          >
            <Icon name="eye" size={20} color={palette.muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/** O aviso cinza (`.note9`): ícone e uma frase. */
export function AccountNote({
  icon,
  children
}: {
  icon: ComponentProps<typeof Icon>['name']
  children: ReactNode
}) {
  const palette = usePalette()
  return (
    <View style={[styles.note, { backgroundColor: palette.mark }]}>
      <Icon name={icon} size={18} color={palette.ink} accent={palette.live} />
      <Text
        style={[text(13, 'Regular', 1.45), { color: palette.ink, flex: 1 }]}
      >
        {children}
      </Text>
    </View>
  )
}

/**
 * A régua de força (`.qstr9`): quatro traços; os cheios em tinta e o do nível
 * atual em acid. Feedback a cada tecla: só a cor muda (120 ms no desenho).
 */
export function StrengthRule({ score }: { score: number }) {
  const palette = usePalette()
  return (
    <View style={styles.strength}>
      {[1, 2, 3, 4].map((step) => (
        <View
          key={step}
          style={[
            styles.strengthBar,
            {
              backgroundColor:
                step < score
                  ? palette.ink
                  : step === score
                    ? ACID
                    : palette.mark
            },
            step === score && { borderWidth: 1, borderColor: INK }
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  kicker: {
    fontFamily: 'GeistMono-Bold',
    fontSize: 13,
    letterSpacing: 0.78
  },
  // Anton 32 a .95: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 32,
    textTransform: 'uppercase',
    marginVertical: -7
  },
  steps: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepLine: {
    width: 14,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    marginHorizontal: 6
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepText: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  field: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  fieldText: {
    flex: 1,
    height: '100%',
    fontFamily: 'Archivo-SemiBold',
    fontSize: 16
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16
  },
  strength: { flexDirection: 'row', gap: 4 },
  strengthBar: { flex: 1, height: 5, borderRadius: 3 },
  cta: { paddingHorizontal: 16, paddingTop: 8, gap: 10 }
})
