import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { HardShadow } from '@/components/explore'
import { DotField } from '@/components/fan-card'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, errorMessage, INK, PAPER, Text, text } from '@/components/ui'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Peças do app do dono do bar (rodada 10): o rótulo em mono das seções, o
 * card claro com a sombra dura, o placar do dia em tinta e as etiquetas de
 * estado do jogo. As telas (Hoje na casa, Jogos, Quem vai) montam com elas.
 */

/**
 * O `onError` das mudanças do dono: nenhuma falha passa calada (regra do
 * WEB-460). Vibra o erro e mostra a frase do servidor, ou a de reserva.
 */
export const alertFailure = (title: string) => (error: unknown) => {
  haptic.error()
  Alert.alert(title, errorMessage(error, 'Confira a conexão e tente de novo.'))
}

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
            <Text
              numberOfLines={1}
              style={[
                styles.mono,
                { color: '#aaa9a4', flexShrink: 1, textAlign: 'right' }
              ]}
            >
              {aside}
            </Text>
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
    marginVertical: -9.7,
    fontVariant: ['tabular-nums']
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

/**
 * Abas em pílula (Jogos, Quem vai): uma pílula só, que desliza para a aba
 * escolhida em 200 ms (EASE); o conteúdo troca seco. Movimento reduzido:
 * a pílula pula. Tocar na aba já marcada não faz nada (nem vibra).
 */
export function PillTabs<K extends string>({
  items,
  value,
  onChange,
  pill,
  track,
  on,
  off
}: {
  items: readonly (readonly [K, string])[]
  value: K
  onChange: (key: K) => void
  pill: string
  track: string
  on: string
  off: string
}) {
  const reduced = useReducedMotion()
  const [width, setWidth] = useState(0)
  const index = Math.max(
    0,
    items.findIndex(([key]) => key === value)
  )
  const cell = width ? (width - 8) / items.length : 0
  const x = useSharedValue(0)
  useEffect(() => {
    x.set(
      withTiming(index * cell, { duration: reduced ? 0 : 200, easing: EASE })
    )
  }, [index, cell, reduced, x])
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }]
  }))
  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[pillStyles.pillTrack, { backgroundColor: track }]}
    >
      {cell ? (
        <Animated.View
          pointerEvents="none"
          style={[
            pillStyles.pill,
            { width: cell, backgroundColor: pill },
            style
          ]}
        />
      ) : null}
      {items.map(([key, label]) => {
        const selected = key === value
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return
              haptic.select()
              onChange(key)
            }}
            style={pillStyles.pillItem}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[
                text(15, selected ? 'Bold' : 'SemiBold', 1.2),
                { color: selected ? on : off }
              ]}
            >
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const pillStyles = StyleSheet.create({
  pillTrack: { flexDirection: 'row', padding: 4, borderRadius: 999 },
  pill: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 999 },
  pillItem: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6
  }
})

/**
 * O convite no ponto do bloqueio (decisão do dono, 11/11/2026): quem testa
 * outro plano vê o que o Elite (ou o Pro) daria ali e testa com um toque,
 * sem cartão (`pub.changeTrialPlan`, WEB-358; o fim do teste não muda). Fora
 * do teste, leva ao Plano. Nunca bloqueia: o dono testa o plano que quiser.
 */
export function PlanNudge({
  to,
  title,
  body,
  compact
}: {
  to: 'pro' | 'elite'
  title: string
  body: string
  compact?: boolean
}) {
  const palette = usePalette()
  const router = useRouter()
  const owner = useOwnerBar()
  const [done, setDone] = useState(false)
  const change = useMutation(
    trpc.pub.changeTrialPlan.mutationOptions({
      onSuccess: () => {
        haptic.success()
        setDone(true)
        queryClient.invalidateQueries()
      },
      onError: alertFailure('Não deu para trocar o plano do teste')
    })
  )
  const name = to === 'elite' ? 'Elite' : 'Pro'
  const label = owner.trial
    ? change.isPending
      ? 'Trocando…'
      : `Testar o ${name} grátis`
    : 'Ver planos'
  return (
    <View
      accessibilityRole="summary"
      style={[
        nudgeStyles.box,
        { backgroundColor: palette.card, borderColor: ACID },
        compact && { padding: 12 }
      ]}
    >
      <View style={nudgeStyles.tag}>
        <Text style={nudgeStyles.tagText}>{`NO ${name.toUpperCase()}`}</Text>
      </View>
      <Text style={[text(16.5, 'Bold', 1.25), { color: palette.ink }]}>
        {done ? `Agora você está testando o ${name}` : title}
      </Text>
      <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
        {done ? 'A data do fim do teste não mudou.' : body}
      </Text>
      {done ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: change.isPending }}
          disabled={change.isPending}
          onPress={() =>
            owner.trial ? change.mutate({ plan: to }) : router.push('/plano')
          }
          style={[nudgeStyles.button, { backgroundColor: palette.ink }]}
        >
          <Text style={[text(15, 'Bold', 1.2), { color: palette.bg }]}>
            {label}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const nudgeStyles = StyleSheet.create({
  box: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  tag: {
    alignSelf: 'flex-start',
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 5,
    backgroundColor: ACID,
    justifyContent: 'center'
  },
  tagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    color: INK
  },
  button: {
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    justifyContent: 'center',
    marginTop: 4
  }
})

/** O relógio da tela, de minuto em minuto (estado do jogo e "hoje"). */
export function useMinuteNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}
