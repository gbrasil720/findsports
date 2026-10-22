import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition
} from 'react-native-reanimated'
import Svg, { Line } from 'react-native-svg'
import { EASE } from '@/components/motion'
import { ACID, Icon, INK, LIVE, PAPER, text } from '@/components/ui'
import type { Tool } from '@/lib/ai-chat'
import { Shimmer, Spinner } from './loader'
import type { AiPalette } from './theme'

/*
 * Ferramenta (Tool): nome da ação, nome técnico em mono e o status.
 * Rodando, mostra os parâmetros e o andamento; pronta, vira uma linha (o
 * cabeçalho e o resultado); "aguardando você" é a ação que espera o
 * "Confirmar" (24d).
 */

export const MONO = 'GeistMono-SemiBold'

/** O ícone da ação pelo nome técnico. */
function toolIcon(name: string) {
  if (name.startsWith('marcar')) return 'ticket' as const
  if (name.startsWith('chamar')) return 'people' as const
  if (name.startsWith('lembrar')) return 'bell' as const
  return 'search' as const
}

// Os parâmetros saem e o card encolhe para a linha.
const PARAMS_OUT = FadeOut.duration(140)
const RESIZE = LinearTransition.duration(220).easing(EASE)
const SWAP_IN = FadeIn.duration(160)

export function ToolCard({
  tool,
  palette
}: {
  tool: Tool
  palette: AiPalette
}) {
  const params =
    tool.state !== 'done' && tool.params?.length ? tool.params : null
  return (
    <Card palette={palette} radius={7} resize>
      <View style={styles.head}>
        <Icon
          name={toolIcon(tool.name)}
          size={19}
          color={palette.ink}
          accent={palette.accent}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[text(14, 'Bold', 1.3), { color: palette.ink }]}
            numberOfLines={1}
          >
            {tool.label}
          </Text>
          <Text style={[styles.mono, { color: palette.muted }]}>
            {tool.name}
          </Text>
        </View>
        <Animated.View key={tool.state} entering={SWAP_IN}>
          <ToolStatus state={tool.state} palette={palette} />
        </Animated.View>
      </View>
      {params ? (
        <Animated.View exiting={PARAMS_OUT}>
          <Dashed palette={palette} />
          <View style={styles.params}>
            <View style={styles.paramCol}>
              {params.map(([key]) => (
                <Text
                  key={key}
                  style={[styles.param, { color: palette.muted }]}
                >
                  {key}
                </Text>
              ))}
            </View>
            <View style={[styles.paramCol, { flex: 1 }]}>
              {params.map(([key, value]) => (
                <Text
                  key={key}
                  style={[styles.param, { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {value}
                </Text>
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}
      {tool.output ? (
        <View>
          <Dashed palette={palette} />
          <View style={styles.output}>
            {tool.state === 'run' ? (
              <>
                <Spinner size={11} palette={palette} />
                <Shimmer size={12.5} weight="Regular" palette={palette}>
                  {tool.output}
                </Shimmer>
              </>
            ) : (
              <Text
                style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
              >
                {tool.output}
              </Text>
            )}
          </View>
        </View>
      ) : null}
    </Card>
  )
}

function ToolStatus({
  state,
  palette
}: {
  state: Tool['state']
  palette: AiPalette
}) {
  if (state === 'run')
    return (
      <View style={[styles.pill, { backgroundColor: palette.toolPill }]}>
        <Spinner size={11} palette={palette} />
        <Text style={[text(11.5, 'Bold', 1.2), { color: palette.ink }]}>
          Rodando
        </Text>
      </View>
    )
  if (state === 'wait')
    return (
      <View style={[styles.pill, { backgroundColor: LIVE, gap: 5 }]}>
        <Text style={[text(11.5, 'Bold', 1.2), { color: PAPER }]}>
          Aguardando você
        </Text>
      </View>
    )
  return (
    <View style={[styles.pill, { backgroundColor: ACID, gap: 5 }]}>
      <Icon name="check" size={10} color={INK} accent={INK} />
      <Text style={[text(11.5, 'Bold', 1.2), { color: INK }]}>Pronto</Text>
    </View>
  )
}

/**
 * Linha de ação feita (24e): "Presença marcada · 19:02 · Pronto". Falhou:
 * a razão no lugar do "Pronto" (o design não desenha falha).
 */
export function DoneLine({
  icon,
  label,
  at,
  failed,
  palette
}: {
  icon: 'ticket' | 'people' | 'bell'
  label: string
  at: string
  failed?: boolean
  palette: AiPalette
}) {
  return (
    <Card palette={palette} radius={7}>
      <View style={styles.line}>
        <Icon
          name={icon}
          size={18}
          color={palette.ink}
          accent={palette.accent}
        />
        <Text
          style={[
            text(13.5, 'SemiBold', 1.3),
            { flex: 1, color: failed ? palette.muted : palette.ink }
          ]}
          numberOfLines={2}
        >
          {label}
        </Text>
        <Text style={[styles.time, { color: palette.muted }]}>{at}</Text>
        {failed ? (
          <View style={[styles.tag, { backgroundColor: LIVE }]}>
            <Text style={[text(10.5, 'Bold', 1.2), { color: PAPER }]}>
              Não deu
            </Text>
          </View>
        ) : (
          <View style={[styles.tag, { backgroundColor: ACID }]}>
            <Icon name="check" size={10} color={INK} accent={INK} />
            <Text style={[text(10.5, 'Bold', 1.2), { color: INK }]}>
              Pronto
            </Text>
          </View>
        )}
      </View>
    </Card>
  )
}

/**
 * O card das peças: papel, contorno de 1 pt e a sombra dura de 4 pt. Com
 * `resize`, card e sombra acompanham a mudança de altura (a ferramenta que
 * vira linha) em vez de saltar.
 */
export function Card({
  palette,
  radius = 7,
  resize,
  children
}: {
  palette: AiPalette
  radius?: number
  resize?: boolean
  children: ReactNode
}) {
  const layout = resize ? RESIZE : undefined
  return (
    <Animated.View layout={layout}>
      <Animated.View
        layout={layout}
        style={[
          styles.shadow,
          { borderRadius: radius, backgroundColor: palette.shadow }
        ]}
      />
      <Animated.View
        layout={layout}
        style={[
          styles.card,
          {
            borderRadius: radius,
            backgroundColor: palette.card,
            borderColor: palette.ring
          }
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  )
}

/** Tracejado de 1,5 pt (o iOS não desenha borda tracejada de um lado só). */
export function Dashed({
  palette,
  color = palette.dash
}: {
  palette: AiPalette
  color?: string
}) {
  return (
    <Svg height={1.5} width="100%">
      <Line
        x1={0}
        y1={0.75}
        x2="100%"
        y2={0.75}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4.5,4.5"
      />
    </Svg>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, overflow: 'hidden' },
  shadow: { position: 'absolute', top: 4, left: 4, right: -4, bottom: -4 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  mono: { fontFamily: MONO, fontSize: 11, lineHeight: 13.2, marginTop: 2 },
  pill: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  params: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  paramCol: { gap: 5 },
  param: { fontFamily: MONO, fontSize: 12, lineHeight: 16.2 },
  output: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12
  },
  time: { fontFamily: MONO, fontSize: 11, lineHeight: 11 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3
  }
})
