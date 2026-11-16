import { groupOpeningHours } from '@findsports_oficial/api/lib/opening-hours'
import { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { SlideInDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HardShadow } from '@/components/explore'
import { EASE, haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, INK, PAPER, Text, text } from '@/components/ui'

/*
 * O horário da semana no cadastro do bar (passo "Horário", opcional): os sete
 * dias em lista, cada um com abre e fecha e o interruptor. Tocar num horário
 * abre a folha do dia, com as duas rodas e "usar também em". O formato é o do
 * servidor (`packages/api/src/lib/opening-hours.ts`): 0 = domingo, `null` é
 * fechado, fechar antes de abrir vira a meia-noite.
 */

export type DayHours = { opens: string; closes: string } | null
export type Week = DayHours[]

const FULL = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado'
]
const ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
/** Segunda primeiro, como o bar pensa a semana. */
const ORDER = [1, 2, 3, 4, 5, 6, 0]
/** Meia em meia hora: 00:00 a 23:30. */
const TIMES = Array.from(
  { length: 48 },
  (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
)
const ROW = 44
const RISE = SlideInDown.duration(320).easing(EASE)

const all = (day: DayHours): Week => Array.from({ length: 7 }, () => day)

export const HOUR_PRESETS: { label: string; week: Week }[] = [
  { label: 'Todo dia igual', week: all({ opens: '17:00', closes: '00:00' }) },
  {
    label: 'Fim de semana diferente',
    week: [
      { opens: '12:00', closes: '22:00' },
      null,
      { opens: '17:00', closes: '00:00' },
      { opens: '17:00', closes: '00:00' },
      { opens: '17:00', closes: '02:00' },
      { opens: '17:00', closes: '02:00' },
      { opens: '12:00', closes: '02:00' }
    ]
  },
  { label: 'Só à noite', week: all({ opens: '19:00', closes: '02:00' }) }
]

const same = (a: Week, b: Week) =>
  a.every((d, i) => d?.opens === b[i]?.opens && d?.closes === b[i]?.closes)

/** "Aberto hoje · 17:00 às 00:00", a linha da placa. */
export function todayLine(week: Week, now = new Date()) {
  const day = week[now.getDay()]
  return day ? `Aberto hoje · ${day.opens} às ${day.closes}` : 'Fechado hoje'
}

/** "Seg fechado · Ter a sex 17:00 – 00:00…", a linha da revisão. */
export function weekSummary(week: Week) {
  return groupOpeningHours(week)
    .map((row) => `${row.days} ${row.hours ?? 'fechado'}`)
    .join(' · ')
}

export function HoursEditor({
  week,
  onChange
}: {
  week: Week
  onChange: (week: Week) => void
}) {
  const palette = usePalette()
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {HOUR_PRESETS.map((preset) => {
          const on = same(week, preset.week)
          return (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                haptic.select()
                onChange(preset.week)
              }}
              style={[
                styles.quick,
                { backgroundColor: on ? palette.ink : palette.mark }
              ]}
            >
              <Text
                style={[
                  text(14, 'SemiBold', 1.2),
                  { color: on ? palette.bg : palette.ink }
                ]}
              >
                {preset.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
      <View>
        <HardShadow color={palette.drop} offset={4} radius={22} />
        <View style={[styles.days, { backgroundColor: palette.card }]}>
          {ORDER.map((day, i) => {
            const slot = week[day] ?? null
            const name = FULL[day] ?? ''
            return (
              <View
                key={day}
                style={[
                  styles.day,
                  i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
                ]}
              >
                <Text style={[styles.abbr, { color: palette.ink }]}>
                  {ABBR[day]}
                </Text>
                {slot ? (
                  <View style={styles.times}>
                    <TimeButton
                      label={`${name} abre às ${slot.opens}`}
                      value={slot.opens}
                      onPress={() => setOpen(day)}
                    />
                    <Text style={[styles.at, { color: palette.muted }]}>
                      às
                    </Text>
                    <TimeButton
                      label={`${name} fecha às ${slot.closes}`}
                      value={slot.closes}
                      onPress={() => setOpen(day)}
                    />
                  </View>
                ) : (
                  <Text style={[styles.closed, { color: palette.muted }]}>
                    Fechado
                  </Text>
                )}
                <Toggle
                  label={`Aberto ${day === 0 || day === 6 ? 'no' : 'na'} ${name.toLowerCase()}`}
                  on={Boolean(slot)}
                  onPress={() =>
                    onChange(
                      week.map((d, j) =>
                        j === day
                          ? d
                            ? null
                            : (week.find(Boolean) ?? {
                                opens: '17:00',
                                closes: '00:00'
                              })
                          : d
                      )
                    )
                  }
                />
              </View>
            )
          })}
        </View>
      </View>
      {open !== null ? (
        <DaySheet
          day={open}
          week={week}
          onDone={(next) => {
            onChange(next)
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}

function TimeButton({
  label,
  value,
  onPress
}: {
  label: string
  value: string
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Abre a escolha do horário"
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[styles.time, { backgroundColor: palette.mark }]}
    >
      <Text style={[styles.timeText, { color: palette.ink }]}>{value}</Text>
    </Pressable>
  )
}

function Toggle({
  label,
  on,
  onPress
}: {
  label: string
  on: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      hitSlop={8}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[styles.toggle, { backgroundColor: on ? ACID : palette.grabber }]}
    >
      <View
        style={[
          styles.knob,
          on
            ? { backgroundColor: INK, transform: [{ translateX: 22 }] }
            : { backgroundColor: PAPER }
        ]}
      />
    </Pressable>
  )
}

function DaySheet({
  day,
  week,
  onDone,
  onClose
}: {
  day: number
  week: Week
  onDone: (week: Week) => void
  onClose: () => void
}) {
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  const slot = week[day] ?? { opens: '17:00', closes: '00:00' }
  const [opens, setOpens] = useState(slot.opens)
  const [closes, setCloses] = useState(slot.closes)
  const [also, setAlso] = useState<number[]>([])
  const name = FULL[day] ?? ''
  const valid = opens !== closes
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityLabel="Fechar"
        style={[StyleSheet.absoluteFill, styles.scrim]}
        onPress={onClose}
      />
      <Animated.View
        entering={RISE}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        style={[
          styles.sheet,
          { backgroundColor: palette.card, paddingBottom: insets.bottom + 16 }
        ]}
      >
        <View style={[styles.grab, { backgroundColor: palette.grabber }]} />
        <Text
          accessibilityRole="header"
          style={[styles.sheetTitle, { color: palette.ink }]}
        >
          {name}
        </Text>
        <View style={styles.wheels}>
          <Wheel label="Abre" value={opens} onChange={setOpens} />
          <Wheel label="Fecha" value={closes} onChange={setCloses} />
        </View>
        <View style={{ gap: 10 }}>
          <Text style={[styles.mono, { color: palette.muted }]}>
            USAR TAMBÉM EM
          </Text>
          <View style={styles.also}>
            {ORDER.filter((d) => d !== day).map((d) => {
              const on = also.includes(d)
              const short = FULL[d]?.slice(0, 3) ?? ''
              return (
                <Pressable
                  key={d}
                  accessibilityRole="checkbox"
                  accessibilityLabel={FULL[d]}
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptic.select()
                    setAlso((now) =>
                      on ? now.filter((x) => x !== d) : [...now, d]
                    )
                  }}
                  style={[
                    styles.alsoChip,
                    { backgroundColor: on ? palette.ink : palette.mark }
                  ]}
                >
                  <Text
                    style={[
                      text(14, 'SemiBold', 1.2),
                      { color: on ? palette.bg : palette.ink }
                    ]}
                  >
                    {short}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
        {valid ? null : (
          <Text style={[text(14, 'SemiBold', 1.3), { color: palette.live }]}>
            Abre e fecha no mesmo horário.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid }}
          disabled={!valid}
          onPress={() => {
            haptic.success()
            onDone(
              week.map((d, i) =>
                i === day || also.includes(i) ? { opens, closes } : d
              )
            )
          }}
          style={[
            styles.ok,
            { backgroundColor: palette.ink, opacity: valid ? 1 : 0.5 }
          ]}
        >
          <Text style={[text(17, 'Bold', 1.2), { color: palette.bg }]}>
            Pronto
          </Text>
        </Pressable>
      </Animated.View>
    </Modal>
  )
}

/** Uma roda de horários: rola de meia em meia hora e para no do meio. */
function Wheel({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const palette = usePalette()
  const ref = useRef<ScrollView>(null)
  // Horário fora da grade de meia hora (gravado no painel) entra na roda
  // pela meia hora de antes.
  const index = Math.floor(
    (Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))) / 30
  )
  const start = useRef(index * ROW).current
  useEffect(() => {
    ref.current?.scrollTo({ y: start, animated: false })
  }, [start])
  const go = (next: number) => {
    const i = Math.min(TIMES.length - 1, Math.max(0, next))
    ref.current?.scrollTo({ y: i * ROW, animated: true })
    onChange(TIMES[i] ?? value)
  }
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) =>
        go(index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))
      }
      style={[styles.wheel, { backgroundColor: palette.mark }]}
    >
      <Text style={[styles.wheelLabel, { color: palette.muted }]}>
        {label.toUpperCase()}
      </Text>
      <View style={{ height: ROW * 3 }}>
        <View
          style={[
            styles.band,
            { top: ROW, height: ROW, backgroundColor: palette.card }
          ]}
        />
        <ScrollView
          ref={ref}
          contentOffset={{ x: 0, y: start }}
          showsVerticalScrollIndicator={false}
          snapToInterval={ROW}
          decelerationRate="fast"
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingVertical: ROW }}
          onScroll={(event) => {
            const i = Math.round(event.nativeEvent.contentOffset.y / ROW)
            const next = TIMES[Math.min(TIMES.length - 1, Math.max(0, i))]
            if (next && next !== value) {
              haptic.select()
              onChange(next)
            }
          }}
        >
          {TIMES.map((time) => {
            const on = time === value
            return (
              <View key={time} style={styles.wheelRow}>
                <Text
                  style={
                    on
                      ? [styles.wheelOn, { color: palette.ink }]
                      : [styles.wheelOff, { color: palette.muted }]
                  }
                >
                  {time}
                </Text>
              </View>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  quick: {
    height: 40,
    paddingHorizontal: 15,
    borderRadius: 20,
    justifyContent: 'center'
  },
  days: { borderRadius: 22, paddingVertical: 2, paddingHorizontal: 16 },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58
  },
  abbr: { fontFamily: 'Anton', fontSize: 20, width: 48 },
  times: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: {
    height: 38,
    paddingHorizontal: 11,
    borderRadius: 11,
    justifyContent: 'center'
  },
  timeText: { fontFamily: 'GeistMono-SemiBold', fontSize: 15 },
  at: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  closed: { flex: 1, fontFamily: 'GeistMono-SemiBold', fontSize: 14 },
  toggle: { width: 52, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12 },
  scrim: { backgroundColor: 'rgba(18,18,15,.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 16
  },
  grab: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  sheetTitle: {
    fontFamily: 'Anton',
    fontSize: 32,
    textTransform: 'uppercase',
    marginVertical: -7.7
  },
  mono: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    letterSpacing: 1.1
  },
  wheels: { flexDirection: 'row', gap: 10 },
  wheel: { flex: 1, borderRadius: 18, paddingTop: 10, overflow: 'hidden' },
  wheelLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.9,
    textAlign: 'center',
    marginBottom: 2
  },
  band: { position: 'absolute', left: 10, right: 10, borderRadius: 12 },
  wheelRow: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  wheelOn: { fontFamily: 'Anton', fontSize: 28 },
  wheelOff: { fontFamily: 'GeistMono-SemiBold', fontSize: 18, opacity: 0.55 },
  also: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  alsoChip: {
    height: 38,
    minWidth: 46,
    paddingHorizontal: 12,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ok: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
