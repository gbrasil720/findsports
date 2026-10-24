import { useEffect } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import QRCode from 'react-qr-code'
import { HardShadow, PALETTE, Perforation } from '@/components/explore'
import { haptic, usePress, usePressScale } from '@/components/motion'
import { ACID, Icon, INK, PAPER, text } from '@/components/ui'
import type { Proposal, ProposalAction } from '@/lib/ai-events'
import { env } from '@/lib/env'
import { formatCode } from '@/lib/my-games'
import { Spinner } from './loader'
import type { AiPalette } from './theme'
import { Card, Dashed, MONO } from './tool'

/*
 * Confirmação (Confirmation): toda ação que muda algo pede aprovação. A IA
 * só propõe; quem executa é o "Confirmar" (`ai.confirm`). Pendente, com um
 * interruptor por ação; depois vira uma linha com o resultado. E o cartão
 * do código no balcão que sai do "Vou assistir" (24e).
 */

const ACTION_ICON = { going: 'ticket', call: 'people', remind: 'bell' } as const

export function ConfirmCard({
  proposal,
  values,
  when,
  sending,
  palette,
  onToggle,
  onConfirm,
  onRefuse
}: {
  proposal: Proposal
  /** Os interruptores, na ordem de `proposal.actions`. */
  values: boolean[]
  /** "hoje 21:30". */
  when: string
  sending: boolean
  palette: AiPalette
  onToggle: (index: number) => void
  onConfirm: () => void
  onRefuse: () => void
}) {
  const none = !values.some(Boolean)
  return (
    <View>
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.glow,
          { backgroundColor: 'rgba(201,241,53,.35)' }
        ]}
      />
      <View
        style={[
          styles.confirm,
          { backgroundColor: palette.card, borderColor: ACID }
        ]}
      >
        <View style={styles.confirmHead}>
          <Icon
            name="ticket"
            size={19}
            color={palette.ink}
            accent={palette.accent}
          />
          <Text
            style={[text(15, 'Bold', 1.3), { flex: 1, color: palette.ink }]}
          >
            Posso fazer isso por você?
          </Text>
        </View>
        <Dashed palette={palette} />
        <View style={styles.confirmBody}>
          <View style={styles.barRow}>
            {proposal.bar.photoUrl ? (
              <Image
                source={{ uri: proposal.bar.photoUrl }}
                style={styles.photo}
              />
            ) : (
              <View style={[styles.photo, { backgroundColor: palette.mark }]} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[text(16, 'Bold', 1.3), { color: palette.ink }]}
                numberOfLines={1}
              >
                {proposal.bar.name}
              </Text>
              <Text
                style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
                numberOfLines={1}
              >
                {proposal.game.title} · {when}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 8 }}>
            {proposal.actions.map((action, i) => (
              <ActionRow
                key={action.kind}
                action={action}
                on={values[i] ?? false}
                first={i === 0}
                disabled={sending}
                palette={palette}
                onToggle={() => onToggle(i)}
              />
            ))}
          </View>
        </View>
        <View style={styles.buttons}>
          <LaterButton
            palette={palette}
            disabled={sending}
            onPress={onRefuse}
          />
          <ConfirmButton
            palette={palette}
            sending={sending}
            disabled={sending || none}
            onPress={onConfirm}
          />
        </View>
      </View>
    </View>
  )
}

function ActionRow({
  action,
  on,
  first,
  disabled,
  palette,
  onToggle
}: {
  action: ProposalAction
  on: boolean
  first: boolean
  disabled: boolean
  palette: AiPalette
  onToggle: () => void
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={action.label}
      disabled={disabled}
      onPress={() => {
        haptic.select()
        onToggle()
      }}
      style={[
        styles.action,
        first ? null : { borderTopWidth: 1, borderTopColor: palette.line }
      ]}
    >
      <Icon
        name={ACTION_ICON[action.kind]}
        size={20}
        color={palette.ink}
        accent={palette.accent}
      />
      <Text
        style={[text(14, 'Regular', 1.35), { flex: 1, color: palette.ink }]}
      >
        {action.label}
      </Text>
      <Switch on={on} palette={palette} />
    </Pressable>
  )
}

/** O interruptor do design (50 x 30, botão de 24). */
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
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          styles.button,
          { borderWidth: 1, borderColor: palette.later },
          press.style
        ]}
      >
        <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
          Agora não
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
      style={{ flex: 1.4 }}
    >
      <View>
        <HardShadow color={palette.confirmShadow} offset={3} radius={5} />
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
            <Text style={[text(14.5, 'Bold', 1.2), { color: INK }]}>
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
          <Perforation palette={ticket} shadow={{ color: ACID, offset: 5 }} />
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
    borderRadius: 5,
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
