import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import QRCode from 'react-qr-code'
import { HardShadow, Perforation } from '@/components/explore'
import { haptic, usePress, usePressScale } from '@/components/motion'
import { PALETTE, PaletteProvider } from '@/components/theme'
import { ACID, Icon, INK, PAPER, Text, text } from '@/components/ui'
import type { ConfirmResult, Proposal, ProposalAction } from '@/lib/ai-events'
import { env } from '@/lib/env'
import { formatCode } from '@/lib/my-games'
import { Spinner } from './loader'
import type { AiPalette } from './theme'
import { Card, MONO } from './tool'

/*
 * Confirmação (rodada 5, `.prop`): a IA só propõe; quem executa é o
 * "Confirmar" (`ai.confirm`). O cartão diz o que vai acontecer, uma linha por
 * ação, e nada é feito até o toque. "Mudar" recusa e volta ao campo. Feito,
 * vira o recibo ("Feito às 19:42") com "Ver código".
 */

const ACTION_ICON = { going: 'check', call: 'person', remind: 'bell' } as const

export function ConfirmCard({
  proposal,
  values,
  when,
  sending,
  palette,
  onConfirm,
  onRefuse
}: {
  proposal: Proposal
  /** O que vai ser feito, na ordem de `proposal.actions`. */
  values: boolean[]
  /** "hoje 21:30". */
  when: string
  sending: boolean
  palette: AiPalette
  onToggle?: (index: number) => void
  onConfirm: () => void
  onRefuse: () => void
}) {
  const actions = proposal.actions.filter((_, i) => values[i])
  return (
    <View
      style={[
        styles.prop,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <View style={styles.kicker}>
        <View style={styles.kickerDot} />
        <Text style={[styles.kickerText, { color: palette.muted }]}>
          PROPOSTA · NADA FOI FEITO AINDA
        </Text>
      </View>
      {actions.map((action) => (
        <View key={action.kind} style={styles.item}>
          <Icon
            name={ACTION_ICON[action.kind]}
            size={18}
            color={palette.ink}
            accent={palette.accent}
          />
          <Text
            style={[
              text(14.5, 'Regular', 1.35),
              { flex: 1, color: palette.ink }
            ]}
          >
            <ActionText action={action} proposal={proposal} when={when} />
          </Text>
        </View>
      ))}
      <View style={styles.buttons}>
        <LaterButton palette={palette} disabled={sending} onPress={onRefuse} />
        <ConfirmButton
          palette={palette}
          sending={sending}
          disabled={sending || !actions.length}
          onPress={() => {
            haptic.select()
            onConfirm()
          }}
        />
      </View>
      <Text style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}>
        Só acontece depois do seu toque.
      </Text>
    </View>
  )
}

const B = { fontFamily: 'Archivo-Bold' }

/** A frase de cada ação, com os nomes em negrito. */
function ActionText({
  action,
  proposal,
  when
}: {
  action: ProposalAction
  proposal: Proposal
  when: string
}) {
  if (action.kind === 'going')
    return (
      <>
        Marcar <Text style={B}>Vou assistir</Text> no{' '}
        <Text style={B}>{proposal.bar.name}</Text> · {proposal.game.title},{' '}
        {when}.
        {action.label.includes('código') ? ' Gera o código do balcão.' : ''}
      </>
    )
  if (action.kind === 'call')
    return (
      <>
        Chamar <Text style={B}>{action.label.replace(/^Chamar\s+/, '')}</Text>{' '}
        para o mesmo jogo. O chamado chega em Avisos.
      </>
    )
  return (
    <>
      Lembrar você <Text style={B}>3 h antes</Text> do jogo.
    </>
  )
}

/** O recibo do que foi feito (`.prop` sem o contorno acid). */
export function Receipt({
  result,
  palette,
  onCode
}: {
  result: ConfirmResult
  palette: AiPalette
  onCode?: () => void
}) {
  const done = [
    result.going?.ok && 'Presença marcada',
    result.call?.ok &&
      `chamado enviado para ${firstName(result.call.friendName)}`,
    result.remind?.ok && 'lembrete marcado'
  ].filter((part): part is string => !!part)
  const failed = [
    result.going && !result.going.ok && 'a presença não foi marcada',
    result.call && !result.call.ok && 'o chamado não foi enviado',
    result.remind && !result.remind.ok && 'o lembrete não foi marcado'
  ].filter((part): part is string => !!part)
  const code = result.going?.ok ? result.going.code : null
  const sentence = [
    done.length ? `${capital(list(done))}.` : '',
    failed.length ? `${capital(list(failed))}.` : '',
    code ? 'Seu código está em Meus jogos.' : ''
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <View
      style={[
        styles.prop,
        styles.receipt,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <View style={styles.kicker}>
        <Icon name="check" size={14} color={palette.ink} />
        <Text style={[styles.kickerText, { color: palette.ink }]}>
          FEITO ÀS {result.at}
        </Text>
      </View>
      <View style={styles.item}>
        <Icon
          name={code ? 'ticket' : 'check'}
          size={18}
          color={palette.ink}
          accent={palette.accent}
        />
        <Text
          style={[text(14.5, 'Regular', 1.35), { flex: 1, color: palette.ink }]}
        >
          {sentence}
        </Text>
      </View>
      {code && onCode ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCode}
          style={({ pressed }) => [
            styles.codeButton,
            { backgroundColor: palette.ink },
            pressed && { opacity: 0.85 }
          ]}
        >
          <Text style={[text(15, 'Bold', 1.2), { color: palette.bg }]}>
            Ver código
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name
const capital = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)
/** "a, b e c". */
const list = (parts: string[]) =>
  parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`
    : (parts[0] ?? '')

export function Switch({ on, palette }: { on: boolean; palette: AiPalette }) {
  const value = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    // Mola sem passar do ponto: toque duplo rápido inverte no meio.
    value.set(withSpring(on ? 1 : 0, { duration: 250, dampingRatio: 1 }))
  }, [on, value])
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      value.get(),
      [0, 1],
      [palette.switchOff, palette.switchOn]
    )
  }))
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: value.get() * 20 }],
    backgroundColor: interpolateColor(
      value.get(),
      [0, 1],
      ['#ffffff', palette.knobOn]
    )
  }))
  return (
    <Animated.View style={[styles.track, track]}>
      <Animated.View style={[styles.knob, knob]} />
    </Animated.View>
  )
}

function LaterButton({
  palette,
  disabled,
  onPress
}: {
  palette: AiPalette
  disabled: boolean
  onPress: () => void
}) {
  const press = usePressScale(0.97)
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View
        style={[
          styles.button,
          styles.change,
          { borderWidth: 1.5, borderColor: palette.line },
          press.style
        ]}
      >
        <Text style={[text(15, 'Bold', 1.2), { color: palette.ink }]}>
          Mudar
        </Text>
      </Animated.View>
    </Pressable>
  )
}

function ConfirmButton({
  palette,
  sending,
  disabled,
  onPress
}: {
  palette: AiPalette
  sending: boolean
  disabled: boolean
  onPress: () => void
}) {
  // Afunda até cobrir a própria sombra dura (3 pt).
  const press = usePress(3, 3)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: sending }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ flex: 1 }}
    >
      <View>
        <HardShadow color="#7f9a12" offset={3} radius={23} />
        <Animated.View
          style={[
            styles.button,
            { backgroundColor: ACID, opacity: disabled && !sending ? 0.5 : 1 },
            press.style
          ]}
        >
          {sending ? (
            <Spinner
              size={14}
              palette={{
                ...palette,
                spin: INK,
                spinTrack: 'rgba(18,18,15,.2)'
              }}
            />
          ) : (
            <Text style={[text(15, 'Bold', 1.2), { color: INK }]}>
              Confirmar
            </Text>
          )}
        </Animated.View>
      </View>
    </Pressable>
  )
}

/** Depois da confirmação: "Você aprovou · presença marcada" ou recusou. */
export function DecisionLine({
  approved,
  label,
  at,
  palette
}: {
  approved: boolean
  label: string
  at: string
  palette: AiPalette
}) {
  const body = (
    <View style={styles.decision}>
      {approved ? (
        <View style={[styles.mark, { backgroundColor: ACID }]}>
          <Icon name="check" size={11} color={INK} accent={INK} />
        </View>
      ) : (
        <View
          style={[
            styles.mark,
            { borderWidth: 1.5, borderColor: palette.muted }
          ]}
        >
          <Icon name="close" size={8} color={palette.muted} />
        </View>
      )}
      <Text
        style={[
          text(13.5, 'SemiBold', 1.3),
          { flex: 1, color: approved ? palette.ink : palette.muted }
        ]}
      >
        {label}
      </Text>
      <Text style={[styles.time, { color: palette.muted }]}>{at}</Text>
    </View>
  )
  return approved ? (
    <Card palette={palette}>{body}</Card>
  ) : (
    <View
      style={[
        styles.refused,
        {
          borderColor: palette.dark ? 'rgba(241,238,230,.14)' : palette.outline
        }
      ]}
    >
      {body}
    </View>
  )
}

/** O cartão do código no balcão, dentro da conversa (24e). */
export function CodeCard({
  code,
  title,
  participants,
  when,
  place,
  palette,
  onPress
}: {
  code: string
  /** "Corinthians × Palmeiras". */
  title: string
  /** Os dois lados do confronto, um por linha; vazio, o título numa linha só. */
  participants: string[]
  /** "hoje 21:30". */
  when: string
  /** "Bar do Zé · Vila Madalena". */
  place: string
  palette: AiPalette
  onPress: () => void
}) {
  const press = usePressScale(0.98)
  const [home, ...away] = participants.length ? participants : [title]
  // O picote recorta na cor da folha; a sombra acid aparece no furo.
  const ticket = {
    ...PALETTE.dark,
    sheet: palette.sheet,
    dash: 'rgba(241,238,230,.16)'
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Código ${formatCode(code)}, mostre no balcão`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>
        <HardShadow color={ACID} offset={5} radius={8} />
        <View style={styles.ticket}>
          <View style={styles.ticketTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text(12, 'Bold', 1.4), { color: ACID }]}>
                Você vai · {when}
              </Text>
              <View style={{ marginTop: 4 + 0.2425 * 24 }}>
                <Text style={styles.match}>{home}</Text>
                {away.map((name) => (
                  <Text key={name} style={styles.match}>
                    × {name}
                  </Text>
                ))}
              </View>
              <Text
                style={[
                  text(12.5, 'Regular', 1.4),
                  { color: '#aaa9a4', marginTop: 0.2425 * 24 }
                ]}
                numberOfLines={1}
              >
                {place}
              </Text>
            </View>
            <View style={styles.qr}>
              <QRCode
                value={`${env.EXPO_PUBLIC_SERVER_URL}/admin/validate?code=${code}`}
                size={54}
                bgColor="#ffffff"
                fgColor={INK}
              />
            </View>
          </View>
          <PaletteProvider value={ticket}>
            <Perforation shadow={{ color: ACID, offset: 5 }} />
          </PaletteProvider>
          <View style={styles.ticketFoot}>
            <Text style={styles.code}>{formatCode(code)}</Text>
            <Text style={[text(12.5, 'Regular', 1.4), { color: '#aaa9a4' }]}>
              Mostre no balcão
            </Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  prop: {
    borderRadius: 22,
    padding: 14,
    gap: 10,
    borderWidth: 2,
    borderColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  receipt: { borderWidth: 0 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACID },
  kickerText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88
  },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  change: { paddingHorizontal: 18 },
  codeButton: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  glow: { top: 5, left: 5, right: -5, bottom: -5, borderRadius: 8 },
  confirm: { borderRadius: 8, borderWidth: 1.5, overflow: 'hidden' },
  confirmHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  confirmBody: { paddingTop: 12, paddingHorizontal: 14, paddingBottom: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 52, height: 52, borderRadius: 3 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  track: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 }
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
    paddingHorizontal: 14,
    paddingBottom: 14
  },
  button: {
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center'
  },
  decision: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  refused: { borderRadius: 7, borderWidth: 1 },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  time: { fontFamily: MONO, fontSize: 11, lineHeight: 11 },
  ticket: { borderRadius: 8, backgroundColor: INK, overflow: 'hidden' },
  ticketTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10
  },
  match: {
    fontFamily: 'Anton',
    fontSize: 24,
    marginVertical: -0.2425 * 24,
    textTransform: 'uppercase',
    color: PAPER
  },
  qr: {
    width: 64,
    height: 64,
    padding: 5,
    borderRadius: 6,
    backgroundColor: '#fff'
  },
  ticketFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  code: {
    fontFamily: 'Anton',
    fontSize: 30,
    letterSpacing: 1.8,
    marginVertical: -0.2425 * 30,
    color: PAPER
  }
})
