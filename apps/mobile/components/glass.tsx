import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
import { StyleSheet, View, type ViewProps } from 'react-native'

/*
 * O liquid glass do design (o que flutua: "Pular", cards sobre mapa e foto).
 * No iOS 26 é o vidro do sistema, pelo `expo-glass-effect`, tingido com a
 * cor do design. Onde ele não existe (Android, iOS anterior) é a mesma cor,
 * mais opaca, já que sem o desfoque a translúcida some no fundo.
 */

const LIQUID = isLiquidGlassAvailable()

const TINT = {
  light: 'rgba(255,255,255,.34)',
  dark: 'rgba(36,36,32,.40)'
}

type GlassProps = ViewProps & {
  tone: 'light' | 'dark'
  /** Responde ao toque (botão). */
  interactive?: boolean
}

export function Glass({ tone, interactive, style, ...props }: GlassProps) {
  if (LIQUID) {
    return (
      <GlassView
        glassEffectStyle="clear"
        colorScheme={tone}
        tintColor={TINT[tone]}
        isInteractive={interactive}
        style={style}
        {...props}
      />
    )
  }
  return <View style={[fallback[tone], style]} {...props} />
}

const fallback = StyleSheet.create({
  light: {
    backgroundColor: 'rgba(255,255,255,.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.9)',
    shadowColor: '#12120f',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  dark: {
    backgroundColor: 'rgba(30,30,27,.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.24)'
  }
})
