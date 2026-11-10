import { StyleSheet, View } from 'react-native'
import { Text, text } from '@/components/ui'
import type { AiPalette } from './theme'

/*
 * Mensagem do usuário (Message, `.me5` da rodada 5): balão à direita, em
 * tinta no claro e papel no escuro, com o canto de baixo à direita menor.
 * Até 80% da largura. A IA não tem balão.
 */
export function UserMessage({
  children,
  palette
}: {
  children: string
  palette: AiPalette
}) {
  return (
    <View style={[styles.bubble, { backgroundColor: palette.bubble }]}>
      <Text style={[text(15, 'Regular', 1.4), { color: palette.bubbleText }]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 20
  }
})
