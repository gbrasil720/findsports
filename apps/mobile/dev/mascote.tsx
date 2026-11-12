import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Mascot } from '@/components/ai/mascot'
import { useAiPalette } from '@/components/ai/theme'
import { BackButton, Text, text, useStatusBar } from '@/components/ui'
import type { MascotState } from '@/lib/mascot'

/*
 * A taça em cada estado do chat, só em desenvolvimento, sem IA: tocar num
 * estado manda o palco para ele a partir do que estiver mostrando, como na
 * conversa. Navegador DEV → "Taça (estados)".
 */

const GROUPS: { title: string; items: [MascotState, string][] }[] = [
  {
    title: 'Conversa',
    items: [
      ['idle', 'Parada'],
      ['thinking', 'Entendi o pedido'],
      ['live', 'Achei o jogo'],
      ['searching', 'Procurando bares'],
      ['comparing', 'Comparar e ordenar'],
      ['writing', 'Escrevendo'],
      ['done', 'Pronto'],
      ['pleased', 'Pronto (de novo)'],
      ['empty', 'Nenhum bar']
    ]
  },
  {
    title: 'Proposta',
    items: [
      ['awaiting', 'Esperando o Confirmar'],
      ['going', 'Vou assistir'],
      ['call', 'Chamar amigo'],
      ['remind', 'Lembrete'],
      ['refused', 'Recusado']
    ]
  },
  {
    title: 'Quando dá errado',
    items: [
      ['stopped', 'Parou'],
      ['limit', 'Limite do dia'],
      ['down', 'IA fora do ar'],
      ['offline', 'Sem internet']
    ]
  }
]

export default function MascotStates() {
  const palette = useAiPalette()
  const insets = useSafeAreaInsets()
  useStatusBar('auto')
  const [state, setState] = useState<MascotState>('idle')

  return (
    <View style={{ flex: 1, backgroundColor: palette.sheet }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <BackButton />
      </View>
      <Mascot state={state} palette={palette} style={styles.stage} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32,
          gap: 18
        }}
      >
        {GROUPS.map((group) => (
          <View key={group.title} style={{ gap: 8 }}>
            <Text style={[text(13, 'SemiBold', 1.3), { color: palette.muted }]}>
              {group.title}
            </Text>
            <View style={styles.row}>
              {group.items.map(([id, label]) => {
                const on = id === state
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setState(id)}
                    style={[
                      styles.chip,
                      { backgroundColor: on ? palette.ink : palette.soft }
                    ]}
                  >
                    <Text
                      style={[
                        text(14, 'SemiBold', 1.3),
                        { color: on ? palette.sheet : palette.ink }
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  stage: { height: 220 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 }
})
