import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { HardShadow } from '@/components/explore'
import { enterAt, ScalePress, usePress } from '@/components/motion'
import { Icon, Text, Title, text } from '@/components/ui'
import { type Recent, recentMeta } from '@/lib/ai-chat'
import type { AiPalette } from './theme'

/*
 * Início da conversa (ConversationEmptyState, 24a): o título, os quatro
 * cartões de sugestão (tocar envia a pergunta) e os recentes guardados no
 * aparelho (tocar reabre a conversa).
 */

export const STARTERS = [
  {
    icon: 'tv',
    question: 'Corinthians hoje com telão perto',
    tag: 'Jogo + lugar'
  },
  {
    icon: 'outdoor',
    question: 'Lugar tranquilo pra F1 domingo cedo',
    tag: 'Clima'
  },
  { icon: 'crew', question: 'Onde a Resenha da Firma vai hoje', tag: 'Amigos' },
  {
    icon: 'ticket',
    question: 'Bar com oferta da casa até 3 km',
    tag: 'Vantagem'
  }
] as const

// Entradas como constante de módulo: a tela renderiza a cada letra digitada.
const START_IN = Array.from({ length: 6 }, (_, i) => enterAt(i, false))

export function Start({
  recents,
  now,
  notice,
  palette,
  onAsk,
  onRecent
}: {
  recents: Recent[]
  now: number
  /** Limite ou fora do ar: a frase no lugar do subtítulo, sem cartões. */
  notice: string | null
  palette: AiPalette
  onAsk: (question: string) => void
  onRecent: (recent: Recent) => void
}) {
  return (
    <View style={{ gap: 14 }}>
      <Animated.View entering={START_IN[0]} style={styles.intro}>
        <Title
          lines={[['O que você'], ['quer ', 'assistir?']]}
          size={38}
          color={palette.ink}
          accentColor={palette.hot}
        />
        <Text
          style={[
            text(14.5, 'Regular', 1.45),
            { color: notice ? palette.ink : palette.muted }
          ]}
        >
          {notice ??
            'Fale do jeito que falaria com um amigo. Eu procuro, comparo e explico.'}
        </Text>
      </Animated.View>
      {notice ? null : (
        <View style={styles.grid}>
          {STARTERS.map((s, i) => (
            <Animated.View
              key={s.question}
              entering={START_IN[1 + i]}
              style={styles.cell}
            >
              <Starter
                starter={s}
                palette={palette}
                onPress={() => onAsk(s.question)}
              />
            </Animated.View>
          ))}
        </View>
      )}
      {recents.length ? (
        <Animated.View entering={START_IN[5]}>
          <Text style={[text(13, 'SemiBold', 1.4), { color: palette.muted }]}>
            Recentes
          </Text>
          {recents.map((r, i) => (
            <ScalePress
              key={r.id}
              to={0.98}
              accessibilityRole="button"
              accessibilityLabel={`Reabrir: ${r.title}`}
              onPress={() => onRecent(r)}
              style={[
                styles.recent,
                i
                  ? {
                      borderTopWidth: 1,
                      borderTopColor: palette.dark
                        ? palette.line
                        : palette.outline
                    }
                  : null
              ]}
            >
              <Icon name="chat" size={18} color={palette.muted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[text(14, 'SemiBold', 1.4), { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {r.title}
                </Text>
                <Text
                  style={[text(12, 'Regular', 1.4), { color: palette.muted }]}
                >
                  {recentMeta(r, now)}
                </Text>
              </View>
              <Icon name="next" size={12} color={palette.muted} />
            </ScalePress>
          ))}
        </Animated.View>
      ) : null}
    </View>
  )
}

/** Cartão de sugestão: afunda até cobrir a sombra dura, que fica parada. */
function Starter({
  starter,
  palette,
  onPress
}: {
  starter: (typeof STARTERS)[number]
  palette: AiPalette
  onPress: () => void
}) {
  const press = usePress(4, 4)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={starter.question}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ flex: 1 }}
    >
      <HardShadow color={palette.shadow} offset={4} radius={7} />
      <Animated.View
        style={[
          styles.starter,
          { backgroundColor: palette.card, borderColor: palette.ring },
          press.style
        ]}
      >
        <Icon
          name={starter.icon}
          size={22}
          color={palette.ink}
          accent={palette.accent}
        />
        <Text style={[text(14, 'SemiBold', 1.3), { color: palette.ink }]}>
          {starter.question}
        </Text>
        <Text
          style={[
            text(11.5, 'Regular', 1.4),
            { color: palette.muted, marginTop: 'auto' }
          ]}
        >
          {starter.tag}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  intro: { gap: 6, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Duas colunas: (largura − 8) / 2; o flexGrow fecha a conta.
  cell: { width: '48%', flexGrow: 1 },
  starter: {
    flex: 1,
    gap: 10,
    padding: 13,
    borderRadius: 7,
    borderWidth: 1
  },
  recent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  }
})
