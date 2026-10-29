import type { ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import Svg, { Line } from 'react-native-svg'
import { haptic, usePressScale } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, Text, text } from '@/components/ui'

/*
 * Peças da página do bar que as telas de "Vou assistir" (08) também usam:
 * o cartão com sombra dura e a oferta da casa com o canhoto acid.
 */

/**
 * Chip de filtro sobre o papel (estante de conquistas, ordem dos favoritos):
 * ligado em acid, desligado só com o contorno. Os do mapa são de vidro
 * (`Chip`, em `explore.tsx`).
 */
export function FilterChip({
  label,
  on,
  onPress,
  raised
}: {
  label: string
  on: boolean
  onPress: () => void
  /** Ligado, com a sombra dura e o canto 5 dos chips de ordem (17e). */
  raised?: boolean
}) {
  const palette = usePalette()
  const press = usePressScale()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        if (on) return
        haptic.select()
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.chip,
          raised && { borderRadius: 5 },
          on && raised && styles.raised,
          on
            ? { backgroundColor: ACID }
            : {
                borderWidth: 1,
                borderColor: palette.dark
                  ? 'rgba(241,238,230,.10)'
                  : 'rgba(18,18,15,.12)'
              },
          press.style
        ]}
      >
        <Text
          style={[text(13, 'SemiBold', 1.2), { color: on ? INK : palette.ink }]}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}

/** Cartão do design: fundo, contorno de 1 px e sombra dura deslocada. */
export function Card({
  fill,
  shadow,
  offset = 4,
  soft,
  notched,
  style,
  children
}: {
  /** O fundo, quando não é o `card` da paleta (o cartão de tinta no claro). */
  fill?: string
  shadow?: string
  offset?: number
  /** Mais a sombra longa e macia dos cartões de lista. */
  soft?: boolean
  /**
   * Ingresso com picote (`Perforation`): sem recorte, para o furo passar por
   * cima da sombra. O topo do conteúdo arredonda os próprios cantos.
   */
  notched?: boolean
  style?: object
  children: ReactNode
}) {
  const palette = usePalette()
  return (
    <View style={style && { flex: 1 }}>
      {/* A sombra longa num fundo cheio: sem fundo o iOS a calcularia pelos
          pixels dos filhos (o mapa) a cada quadro da rolagem. */}
      {soft ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.soft,
            { backgroundColor: fill ?? palette.card }
          ]}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            top: offset,
            left: offset,
            right: -offset,
            bottom: -offset,
            borderRadius: 6,
            backgroundColor: shadow ?? palette.shadow
          }
        ]}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: fill ?? palette.card, borderColor: palette.ring },
          notched && { overflow: 'visible' },
          style
        ]}
      >
        {children}
      </View>
    </View>
  )
}

/** "Oferta da casa", com o canhoto acid do ingresso. */
export function OfferCard({
  offer,
  note,
  compact
}: {
  offer: string
  /** O que vem depois da oferta ("Vale com o seu código."). */
  note?: string
  /** A versão menor da folha "Vou assistir aqui" (3d). */
  compact?: boolean
}) {
  const palette = usePalette()
  return (
    <Card shadow="rgba(201,241,53,.85)" offset={5}>
      <View style={styles.offer}>
        <View style={[styles.offerStub, { width: compact ? 56 : 62 }]}>
          <Icon name="ticket" size={26} color={INK} accent={INK} />
          {/* O picote do canhoto em SVG: no iOS o React Native não desenha
              borda tracejada de um lado só. */}
          <Svg width={2} style={styles.offerCut}>
            <Line
              x1={1}
              y1={0}
              x2={1}
              y2="100%"
              stroke="rgba(18,18,15,.25)"
              strokeWidth={1.5}
              strokeDasharray="4.5,4.5"
            />
          </Svg>
        </View>
        <View
          style={[
            styles.offerText,
            compact && { paddingVertical: 11, paddingHorizontal: 13 }
          ]}
        >
          <Text
            style={[
              text(compact ? 14 : 14.5, 'Bold', 1.4),
              { color: palette.ink }
            ]}
          >
            Oferta da casa
          </Text>
          <Text
            style={[
              text(compact ? 12.5 : 13, 'Regular', 1.4),
              { color: palette.muted }
            ]}
          >
            {/* A oferta é texto do dono: ponto final só se ele não pôs, senão
                "no intervalo Vale com…" sai colado. */}
            {note
              ? `${/[.!?…]$/.test(offer) ? offer : `${offer}.`} ${note}`
              : offer}
          </Text>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  raised: {
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  chip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 4,
    justifyContent: 'center'
  },
  card: { borderRadius: 6, borderWidth: 1, overflow: 'hidden' },
  soft: {
    borderRadius: 6,
    shadowColor: INK,
    shadowOpacity: 0.3,
    shadowRadius: 17,
    shadowOffset: { width: 0, height: 14 }
  },
  offer: { flexDirection: 'row' },
  offerStub: {
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  offerCut: { position: 'absolute', top: 0, bottom: 0, right: -1 },
  offerText: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 }
})
