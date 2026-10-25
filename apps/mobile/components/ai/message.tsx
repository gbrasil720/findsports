import { StyleSheet, View } from 'react-native'
import { ACID, Text, text } from '@/components/ui'
import type { AiPalette } from './theme'

/*
 * Mensagem do usuário (Message): balão à direita, em tinta no claro e papel
 * no escuro, com a sombra acid. Máximo de 286 pt. A IA não tem balão.
 */
export function UserMessage({
  children,
  palette
}: {
  children: string
  palette: AiPalette
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.shadow} />
      <View style={[styles.bubble, { backgroundColor: palette.bubble }]}>
        <Text style={[text(15, 'Regular', 1.4), { color: palette.bubbleText }]}>
          {children}
        </Text>
      </View>
    </View>
  )
}

const RADII = {
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  borderBottomRightRadius: 4,
  borderBottomLeftRadius: 18
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-end', maxWidth: 286 },
  // A sombra dura (3 pt, acid) é o mesmo balão deslocado por baixo.
  shadow: {
    ...StyleSheet.absoluteFill,
    top: 3,
    left: 3,
    right: -3,
    bottom: -3,
    backgroundColor: ACID,
    ...RADII
  },
  bubble: { paddingVertical: 11, paddingHorizontal: 14, ...RADII }
})
