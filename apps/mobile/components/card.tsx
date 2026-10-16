import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Palette } from '@/components/explore'
import { ACID, Icon, INK, text } from '@/components/ui'

/*
 * Peças da página do bar que as telas de "Vou assistir" (08) também usam:
 * o cartão com sombra dura e a oferta da casa com o canhoto acid.
 */

/** Cartão do design: fundo, contorno de 1 px e sombra dura deslocada. */
export function Card({
  palette,
  shadow,
  offset = 4,
  soft,
  style,
  children
}: {
  palette: Palette
  shadow?: string
  offset?: number
  /** Mais a sombra longa e macia dos cartões de lista. */
  soft?: boolean
  style?: object
  children: ReactNode
}) {
  return (
    <View style={style && { flex: 1 }}>
      {/* A sombra longa num fundo cheio: sem fundo o iOS a calcularia pelos
          pixels dos filhos (o mapa) a cada quadro da rolagem. */}
      {soft ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            styles.soft,
            { backgroundColor: palette.card }
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
          { backgroundColor: palette.card, borderColor: palette.ring },
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
  palette,
  offer,
  note
}: {
  palette: Palette
  offer: string
  /** O que vem depois da oferta ("Vale com o seu código."). */
  note?: string
}) {
  return (
    <Card palette={palette} shadow="rgba(201,241,53,.85)" offset={5}>
      <View style={styles.offer}>
        <View style={styles.offerStub}>
          <Icon name="ticket" size={26} color={INK} />
        </View>
        <View style={styles.offerText}>
          <Text style={[text(14.5, 'Bold', 1.4), { color: palette.ink }]}>
            Oferta da casa
          </Text>
          <Text style={[text(13, 'Regular', 1.4), { color: palette.muted }]}>
            {note ? `${offer} ${note}` : offer}
          </Text>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
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
    width: 62,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1.5,
    borderRightColor: 'rgba(18,18,15,.25)',
    borderStyle: 'dashed'
  },
  offerText: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 2 }
})
