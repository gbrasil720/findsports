import type { ReactNode } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { usePalette } from '@/components/theme'
import { Text, text } from '@/components/ui'

/*
 * As peças de estado da rodada 7 (tela 5), para cada tela não inventar a
 * sua. Carregando mostra a forma do que vem, parada: blocos no desenho do
 * cartão, sem brilho correndo (aparece por menos de um segundo, e o brilho
 * chama atenção para a espera). Vazio diz o que existe e o próximo passo.
 */

/** Cartões parados na forma do que vem (`.sk`): foto e três linhas. */
export function Skeleton({
  count = 2,
  style
}: {
  count?: number
  style?: StyleProp<ViewStyle>
}) {
  const palette = usePalette()
  return (
    <View
      style={[{ gap: 10, marginTop: 8 }, style]}
      accessible
      accessibilityLabel="Carregando"
    >
      {Array.from({ length: count }, (_, n) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: blocos iguais e fixos
          key={n}
          style={[
            styles.card,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <View style={[styles.photo, { backgroundColor: palette.mark }]} />
          <View style={styles.lines}>
            {['70%', '45%', '30%'].map((width) => (
              <View
                key={width}
                style={[
                  styles.line,
                  {
                    width: width as `${number}%`,
                    backgroundColor: palette.mark
                  }
                ]}
              />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * Vazio com próximo passo (`.em7`): o título em Anton, a frase do que existe
 * e o botão que leva adiante. `dark` é o da primeira vez, em tinta.
 */
export function EmptyCard({
  title,
  line,
  action,
  dark
}: {
  title: string
  line: string
  action?: ReactNode
  dark?: boolean
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.empty,
        dark
          ? { backgroundColor: palette.dark ? '#1f1f1a' : '#1c1c18' }
          : { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <Text style={[styles.title, { color: dark ? '#f1eee6' : palette.ink }]}>
        {title}
      </Text>
      <Text
        style={[
          text(14.5, 'Regular', 1.45),
          { color: dark ? '#aaa9a4' : palette.muted }
        ]}
      >
        {line}
      </Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    borderRadius: 22,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  photo: { width: 94, height: 94, borderRadius: 14 },
  lines: { flex: 1, gap: 8, paddingTop: 10 },
  line: { height: 12, borderRadius: 6 },
  empty: {
    borderRadius: 22,
    padding: 18,
    gap: 8,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  // Anton 26: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    marginVertical: -6.3
  },
  action: { alignItems: 'flex-start', marginTop: 6 }
})
