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
import { DotField } from '@/components/fan-card'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'

/*
 * A casca das telas de conta em tela cheia (rodada 8, telas 4 a 6): um topo
 * de tinta com a trama de pontos, a marca e o título (a segunda linha em
 * acid), e o formulário num papel que sobe por cima dele, com cantos de 28.
 * Uma peça de apoio por tela, no máximo (`art`, entre o título e o papel), e
 * nada que dispute com o campo. O topo é tinta nos dois temas; o papel, no
 * escuro, sobe um tom.
 */

export function AuthShell({
  title,
  step,
  art,
  tall,
  footer,
  children
}: {
  /** As duas linhas do título; a segunda em acid. */
  title: [string, string]
  /** "1 DE 3", em mono acid à direita da marca. */
  step?: string
  /** A peça de apoio (a carteirinha, a notificação), sob o título. */
  art?: ReactNode
  /** Topo mais alto, para a peça de apoio caber. */
  tall?: boolean
  /** O pé do papel, depois de uma linha ("Não tem conta? Criar conta"). */
  footer?: ReactNode
  children: ReactNode
}) {
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('light')
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{
        flex: 1,
        backgroundColor: palette.dark ? '#1c1c18' : palette.bg
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
      >
        <View
          style={[
            styles.top,
            // A marca (34) e 30 de respiro antes do título, sempre.
            {
              paddingTop: insets.top + 8 + 34 + 30,
              minHeight: tall ? 440 : 330
            }
          ]}
        >
          <DotField id="conta" radius={0} />
          <View style={[styles.head, { top: insets.top + 8 }]}>
            <Mark />
            {step ? <Text style={styles.step}>{step}</Text> : null}
          </View>
          <View accessible accessibilityRole="header">
            <Text style={[styles.title, { color: PAPER }]}>{title[0]}</Text>
            <Text style={[styles.title, { color: ACID }]}>{title[1]}</Text>
          </View>
          {art}
        </View>
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16) + 16,
              backgroundColor: palette.dark ? '#1c1c18' : palette.bg
            }
          ]}
        >
          {children}
          {footer ? (
            <View style={[styles.footer, { borderTopColor: palette.line }]}>
              {footer}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

/** A marca (`.mark`): anel de papel e o ponto vermelho. */
function Mark() {
  return (
    <View style={styles.mark}>
      <View style={styles.markRing} />
      <View style={styles.markDot} />
    </View>
  )
}

/**
 * O campo de conta (`.fld` e `.inp` do redesign): rótulo em mono, caixa em
 * pílula de 52, a borda que escurece no foco e, na senha, o olho. No papel
 * escuro a caixa desce para a tinta.
 */
export function AuthField({
  label,
  secureTextEntry,
  ...input
}: ComponentProps<typeof TextInput> & { label: string }) {
  const palette = usePalette()
  const [focused, setFocused] = useState(false)
  const [shown, setShown] = useState(false)
  return (
    <View style={{ gap: 7 }}>
      <Text style={[styles.label, { color: palette.muted }]}>
        {label.toLocaleUpperCase('pt-BR')}
      </Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: palette.dark ? INK : palette.card,
            borderColor: focused ? palette.ink : palette.line,
            borderWidth: focused ? 2.5 : 1.5,
            paddingHorizontal: focused ? 17 : 18
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

/** A regra que vira check enquanto a pessoa digita ("8 caracteres ou mais"). */
export function AuthRule({ ok, children }: { ok: boolean; children: string }) {
  const palette = usePalette()
  return (
    <View style={styles.rule}>
      <Icon
        name={ok ? 'check' : 'plus'}
        size={13}
        color={ok ? (palette.dark ? ACID : '#5b6d0c') : palette.muted}
      />
      <Text style={[styles.ruleText, { color: palette.muted }]}>
        {children}
      </Text>
    </View>
  )
}

/** "ou", entre duas linhas. */
export function AuthOr() {
  const palette = usePalette()
  return (
    <View style={styles.or}>
      <View style={[styles.orLine, { backgroundColor: palette.line }]} />
      <Text style={[styles.label, { color: palette.muted }]}>OU</Text>
      <View style={[styles.orLine, { backgroundColor: palette.line }]} />
    </View>
  )
}

/** Link sublinhado (`.lk`): à direita sob um campo, ou no centro. */
export function AuthLink({
  label,
  lead,
  onPress,
  center
}: {
  label: string
  lead?: string
  onPress: () => void
  center?: boolean
}) {
  const palette = usePalette()
  return (
    <Text
      style={[
        text(14, 'SemiBold', 1.3),
        {
          color: palette.muted,
          alignSelf: center ? 'center' : 'flex-end',
          marginTop: center ? 4 : -4
        }
      ]}
    >
      {lead ? `${lead} ` : ''}
      <Text
        accessibilityRole="link"
        onPress={onPress}
        suppressHighlighting
        style={[
          text(14, 'Bold', 1.3),
          { color: palette.ink, textDecorationLine: 'underline' }
        ]}
      >
        {label}
      </Text>
    </Text>
  )
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: INK,
    paddingHorizontal: 22,
    paddingBottom: 44,
    justifyContent: 'flex-end',
    gap: 18,
    overflow: 'hidden'
  },
  head: {
    position: 'absolute',
    left: 22,
    right: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  step: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    color: ACID
  },
  // Anton 56 a .92: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 56,
    textTransform: 'uppercase',
    marginVertical: -15.6
  },
  mark: { width: 34, height: 34 },
  markRing: {
    position: 'absolute',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    borderRadius: 14,
    borderWidth: 5,
    borderColor: PAPER
  },
  markDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#e8320c'
  },
  sheet: {
    flex: 1,
    marginTop: -18,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 22,
    paddingHorizontal: 20,
    gap: 12
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 14,
    borderTopWidth: 1,
    alignItems: 'center',
    gap: 10
  },
  label: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88
  },
  field: {
    height: 52,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  fieldText: {
    flex: 1,
    height: '100%',
    fontFamily: 'Archivo-SemiBold',
    fontSize: 16
  },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ruleText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orLine: { flex: 1, height: 1 }
})
