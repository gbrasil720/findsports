import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { usePalette } from '@/components/theme'
import { ACID, INK, Text, text } from '@/components/ui'

/*
 * As listas da rodada 4 (`.list`, `.li`, `.dl`, `.st2`): o cartão com as
 * linhas de placar, o rótulo de grupo em mono e o estado à direita.
 */

/** O rótulo de grupo em mono ("ESTA SEMANA", "FALTA AVALIAR"). */
export function GroupLabel({ children }: { children: string }) {
  const palette = usePalette()
  return (
    <Text style={[styles.label, { color: palette.muted }]}>
      {children.toLocaleUpperCase('pt-BR')}
    </Text>
  )
}

/** O cartão que agrupa as linhas. */
export function LineList({ children }: { children: ReactNode }) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.list,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      {children}
    </View>
  )
}

/** Uma linha: a hora e o dia em mono, o título e a linha de baixo, o estado. */
export function GameLine({
  time,
  day,
  title,
  sub,
  right,
  first,
  dim,
  onPress
}: {
  time: string
  day: string
  title: string
  sub: string
  right?: ReactNode
  first?: boolean
  /** "Não fui": a linha apagada. */
  dim?: boolean
  onPress?: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.line,
        !first && { borderTopWidth: 1, borderTopColor: palette.line },
        dim && { opacity: 0.55 },
        pressed && { opacity: 0.7 }
      ]}
    >
      <View style={{ width: 58 }}>
        <Text style={[styles.time, { color: palette.ink }]}>{time}</Text>
        <Text style={[styles.day, { color: palette.muted }]}>
          {day.toLocaleUpperCase('pt-BR')}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(15, 'Bold', 1.2), { color: palette.ink }]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[text(12.5, 'Regular', 1.35), { color: palette.muted }]}
        >
          {sub}
        </Text>
      </View>
      {right}
    </Pressable>
  )
}

/** O estado à direita: "Avaliar" em acid, "★ 4", "Não fui". */
export function LineState({
  kind,
  label
}: {
  kind: 'rate' | 'done' | 'no'
  label: string
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.state,
        kind === 'rate'
          ? { backgroundColor: ACID }
          : kind === 'done'
            ? { backgroundColor: palette.mark }
            : null
      ]}
    >
      <Text
        style={[
          styles.stateText,
          {
            color:
              kind === 'rate'
                ? INK
                : kind === 'no'
                  ? palette.muted
                  : palette.ink
          }
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    marginBottom: -6
  },
  list: {
    borderRadius: 22,
    paddingHorizontal: 14,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11
  },
  // Mono 17/1: margem negativa no lugar do entrelinha curto.
  time: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    marginVertical: -2.5
  },
  day: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4
  },
  state: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 999 },
  stateText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.44,
    marginVertical: -1.6
  }
})
