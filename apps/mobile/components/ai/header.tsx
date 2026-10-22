import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Glass } from '@/components/glass'
import { SWAP } from '@/components/motion'
import { ACID, Icon, text } from '@/components/ui'
import { AiIcon } from './icons'
import { Spinner } from './loader'
import type { AiPalette } from './theme'

/*
 * Cabeçalho da busca com IA: o ícone, "Busca com IA" e o status. Parado,
 * mostra o resultado com o ponto acid; ocupado, gira e diz o que está
 * fazendo. "+" começa outra conversa, "×" fecha a folha.
 */
export function AiHeader({
  status,
  busy,
  quiet,
  palette,
  onNew,
  onClose
}: {
  status: string
  busy: boolean
  /** Limite ou fora do ar: o ponto apaga. */
  quiet?: boolean
  palette: AiPalette
  onNew?: () => void
  onClose: () => void
}) {
  return (
    <View style={styles.head}>
      <View style={styles.mark}>
        <Icon
          name="sparkle"
          size={34}
          color={palette.ink}
          accent={palette.accent}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(17, 'Bold', 1.3), { color: palette.ink }]}>
          Busca com IA
        </Text>
        <View style={styles.status}>
          {/* O giro fica fora da troca: não volta ao começo a cada frase. */}
          {busy ? (
            <Spinner size={11} palette={palette} />
          ) : (
            <View
              style={[
                styles.halo,
                { backgroundColor: quiet ? 'transparent' : palette.statusRing }
              ]}
            >
              <View
                style={[
                  styles.dot,
                  quiet
                    ? { backgroundColor: palette.muted, opacity: 0.5 }
                    : { backgroundColor: ACID }
                ]}
              />
            </View>
          )}
          {/* A frase troca com um esmaecer curto. */}
          <Animated.Text
            key={status}
            entering={SWAP}
            style={[
              text(12.5, 'Regular', 1.4),
              { color: palette.muted, flexShrink: 1 }
            ]}
          >
            {status}
          </Animated.Text>
        </View>
      </View>
      {onNew ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nova conversa"
          hitSlop={6}
          onPress={onNew}
        >
          <Round palette={palette}>
            <AiIcon name="plus" size={17} color={palette.ink} />
          </Round>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        hitSlop={6}
        onPress={onClose}
      >
        <Round palette={palette}>
          <Icon name="close" size={17} color={palette.ink} />
        </Round>
      </Pressable>
    </View>
  )
}

/** O botão redondo de vidro do cabeçalho (38 pt no design). */
function Round({
  palette,
  children
}: {
  palette: AiPalette
  children: ReactNode
}) {
  return (
    <View style={[styles.roundBase, palette.dark && styles.roundBaseDark]}>
      <Glass
        tone={palette.dark ? 'dark' : 'light'}
        interactive
        style={styles.round}
      >
        {children}
      </Glass>
    </View>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 17,
    paddingBottom: 8,
    paddingHorizontal: 16
  },
  mark: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // O ponto de 7 pt com o halo de 3 pt (box-shadow do design).
  halo: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: -3
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  // Vidro só aparece com algo atrás; sobre a folha lisa, a base e a sombra
  // fazem o círculo (como o `GlassRound`, em 38 pt).
  roundBase: {
    borderRadius: 19,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,.75)',
    backgroundColor: 'rgba(255,255,255,.55)',
    shadowColor: '#12120f',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  roundBaseDark: {
    borderColor: 'rgba(255,255,255,.28)',
    backgroundColor: 'rgba(241,238,230,.1)',
    shadowColor: '#000'
  },
  round: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
