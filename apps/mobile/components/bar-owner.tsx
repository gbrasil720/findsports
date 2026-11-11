import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { HardShadow } from '@/components/explore'
import { DotField } from '@/components/fan-card'
import { usePalette } from '@/components/theme'
import { ACID, INK, PAPER, Text, text } from '@/components/ui'

/*
 * Peças do app do dono do bar (rodada 10): o rótulo em mono das seções, o
 * card claro com a sombra dura, o placar do dia em tinta e as etiquetas de
 * estado do jogo. As telas (Hoje na casa, Jogos, Quem vai) montam com elas.
 */

/** "CHEGARAM AGORA · 14 CÓDIGOS VALIDADOS". */
export function OwnerLabel({ children }: { children: string }) {
  const palette = usePalette()
  return (
    <Text
      accessibilityRole="header"
      style={[styles.label, { color: palette.muted }]}
    >
      {children.toLocaleUpperCase('pt-BR')}
    </Text>
  )
}

/** O card claro (`.board`, `.list`): raio 24 e a sombra dura de 4. */
export function OwnerCard({
  children,
  radius = 24,
  pad = 16
}: {
  children: ReactNode
  radius?: number
  pad?: number
}) {
  const palette = usePalette()
  return (
    <View>
      <HardShadow color={palette.drop} offset={4} radius={radius} />
      <View
        style={{
          backgroundColor: palette.card,
          borderRadius: radius,
          paddingHorizontal: pad
        }}
      >
        {children}
      </View>
    </View>
  )
}

/** Linha de card com o fio entre elas. */
export function OwnerRow({
  children,
  first
}: {
  children: ReactNode
  first?: boolean
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.row,
        !first && {
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderTopColor: palette.line
        }
      ]}
    >
      {children}
    </View>
  )
}

/** O placar do dia em tinta, com a trama de pontos (nos dois temas). */
export function DayBoard({
  kicker,
  live,
  aside,
  hot,
  children
}: {
  kicker: string
  /** "1 AO VIVO", à direita, em vermelho com o ponto. */
  live?: string
  /** O canto direito em cinza ("BRASILEIRÃO"). */
  aside?: string
  /** O próprio rótulo em vermelho com o ponto ("21:30 · AO VIVO"). */
  hot?: boolean
  children: ReactNode
}) {
  const palette = usePalette()
  return (
    <View>
      <HardShadow color="#000" offset={5} radius={28} />
      <View
        style={[
          styles.board,
          palette.dark && { borderWidth: 1, borderColor: palette.line }
        ]}
      >
        <DotField id="dia" radius={28} />
        <View style={styles.boardHead}>
          {hot ? (
            <View style={styles.liveRow}>
              <View style={[styles.dot, { backgroundColor: '#f3421d' }]} />
              <Text style={[styles.mono, { color: '#f3421d' }]}>{kicker}</Text>
            </View>
          ) : (
            <Text style={[styles.mono, { color: '#aaa9a4' }]}>{kicker}</Text>
          )}
          {aside ? (
            <Text style={[styles.mono, { color: '#aaa9a4' }]}>{aside}</Text>
          ) : null}
          {live ? (
            <View style={styles.liveRow}>
              <View style={[styles.dot, { backgroundColor: '#f3421d' }]} />
              <Text style={[styles.mono, { color: '#f3421d' }]}>{live}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cells}>{children}</View>
      </View>
    </View>
  )
}

/** Uma célula do placar: o número em Anton e a legenda em mono. */
export function BoardCell({
  value,
  label,
  hot,
  grow
}: {
  value: string
  label: string
  /** O número em acid (o interesse acima do normal). */
  hot?: boolean
  grow?: number
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[styles.cell, { flex: grow ?? 1 }]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.cellValue, { color: hot ? ACID : PAPER }]}
      >
        {value}
      </Text>
      <Text style={[styles.cellLabel]}>{label}</Text>
    </View>
  )
}

/** Etiqueta do jogo: AO VIVO (vermelho), PUBLICADO, RASCUNHO, ENCERRADO. */
export function StateTag({
  state
}: {
  state: 'live' | 'upcoming' | 'ended' | 'draft'
}) {
  const palette = usePalette()
  const live = state === 'live'
  const label = live
    ? 'AO VIVO'
    : state === 'draft'
      ? 'RASCUNHO'
      : state === 'ended'
        ? 'ENCERRADO'
        : 'PUBLICADO'
  return (
    <View
      style={[
        styles.tag,
        { backgroundColor: live ? palette.live : palette.mark },
        live && { minWidth: 92 }
      ]}
    >
      <Text style={[styles.tagText, { color: live ? INK : palette.ink }]}>
        {label}
      </Text>
    </View>
  )
}

/** "Oferta liberada" / "Validou": pílula acid em mono. */
export function OkPill({ children }: { children: string }) {
  return (
    <View style={styles.ok}>
      <Text style={[styles.okText]}>{children}</Text>
    </View>
  )
}

export const ownerText = {
  name: text(17, 'Bold', 1.25),
  line: text(14.5, 'Regular', 1.35)
}

const styles = StyleSheet.create({
  label: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 1.1
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13
  },
  board: {
    backgroundColor: INK,
    borderRadius: 28,
    padding: 14,
    paddingTop: 16,
    gap: 12,
    overflow: 'hidden'
  },
  boardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2
  },
  cells: { flexDirection: 'row', gap: 8 },
  cell: {
    backgroundColor: 'rgba(241,238,230,.06)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 4,
    minWidth: 0
  },
  cellValue: {
    fontFamily: 'Anton',
    fontSize: 40,
    marginVertical: -9.7
  },
  cellLabel: {
    marginTop: 10,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    lineHeight: 14,
    color: '#aaa9a4'
  },
  tag: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center'
  },
  tagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.77
  },
  ok: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    justifyContent: 'center',
    backgroundColor: ACID
  },
  okText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    color: INK
  }
})
