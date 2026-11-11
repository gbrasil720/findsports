import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import {
  CODE_ALPHABET,
  isReservationCodeShaped,
  normalizeReservationCode,
  RESERVATION_CODE_LENGTH
} from '@findsports_oficial/db/reservation-code'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Crypto from 'expo-crypto'
import { useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Seal, useStamp } from '@/components/fan-card'
import { EASE, haptic, useShake } from '@/components/motion'
import {
  ACID,
  errorMessage,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { gameState, sinceLabel, visitLine } from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Validar o código na porta (rodada 10, tela 2). O círculo acid da barra abre
 * direto na câmera: o quadro com os cantos acid e a linha de leitura, o jogo
 * de agora no topo e a lanterna; embaixo, os últimos validados e "Digitar
 * código" / "Quem vai". Digitar tem as seis caixas e um teclado só com os
 * caracteres que existem no código (sem O, 0, I, 1 nem L).
 *
 * Código lido: `lookup` e, se vale agora, `registerArrival` (um `requestId`
 * por chegada, então repetir o envio não soma duas). Válido mostra o
 * ingresso do lado do balcão com a história de quem chega e a oferta.
 * "Desfazer" fica 5 s (o servidor aceita até 45 s).
 *
 * Movimento: a linha de leitura sobe e desce (linear 1,6 s; reduzido:
 * parada); achou, os cantos fecham (.92 em 150 ms). Cada caixa acende ao
 * receber a letra. Válido: o selo cai como no ingresso do torcedor (a mesma
 * peça, com o háptico de sucesso). Inválido: as caixas tremem. Desfazer: a
 * barra encolhe em 5 s, linear (é tempo passando).
 */

type Found = {
  code: string
  guestName: string
  offer: string | null
  title: string
  startsAt: string | Date
  guest: {
    markedAt: string | Date | null
    visitsHere: number
    visitsOnside: number | null
    friendsToday: number
  }
  useId: string
  at: number
}

const UNDO_MS = 5000
const FRAME = 260

export default function ValidarCodigo() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  useStatusBar('light')
  const owner = useOwnerBar()
  const [mode, setMode] = useState<'scan' | 'type'>('scan')
  const [typed, setTyped] = useState('')
  const [torch, setTorch] = useState(false)
  const [found, setFound] = useState<Found | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [permission, askPermission] = useCameraPermissions()
  const reading = useRef(false)
  // O último código recusado e quando: a câmera continua vendo o mesmo QR,
  // e sem isso ela consultaria e vibraria sem parar.
  const refused = useRef<{ code: string; at: number } | null>(null)
  const shake = useShake()
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const going = useQuery({
    ...trpc.barReservations.going.queryOptions(),
    enabled: owner.elite
  })
  const lookup = useMutation(
    trpc.reservationValidation.lookup.mutationOptions()
  )
  const register = useMutation(
    trpc.reservationValidation.registerArrival.mutationOptions()
  )
  const undo = useMutation(
    trpc.reservationValidation.undoArrival.mutationOptions()
  )

  const now = Date.now()
  const live = (events.data ?? []).find(
    (game) => gameState(game, now) === 'live'
  )
  const today = brasiliaDay(now)
  const recent = (going.data ?? [])
    .flatMap((game) =>
      game.people
        .filter((p) => p.validatedAt && brasiliaDay(p.validatedAt) === today)
        .map((p) => ({ ...p, game }))
    )
    .sort(
      (a, b) =>
        new Date(b.validatedAt ?? 0).getTime() -
        new Date(a.validatedAt ?? 0).getTime()
    )

  const fail = (message: string) => {
    haptic.error()
    shake.shake()
    setProblem(message)
    reading.current = false
  }

  const check = async (raw: string) => {
    const code = normalizeReservationCode(raw)
    refused.current = { code, at: Date.now() }
    if (!isReservationCodeShaped(code))
      return fail('Esse não é um código da Onside.')
    setProblem(null)
    try {
      const data = await lookup.mutateAsync({ code })
      if (!data) return fail('Código não encontrado neste bar.')
      const open = Date.now()
      if (open < new Date(data.window.opensAt).getTime())
        return fail('O código ainda não vale: abre perto do começo do jogo.')
      if (open > new Date(data.window.closesAt).getTime())
        return fail('Código vencido: o jogo já acabou.')
      if (data.usedCount >= data.maxUses) return fail('Código já usado.')
      const arrival = await register.mutateAsync({
        codeId: data.codeId,
        requestId: Crypto.randomUUID()
      })
      setFound({
        code: data.code,
        guestName: data.guestName,
        offer: data.offerSnapshot,
        title: gameTitle(data.event),
        startsAt: data.event.startsAt,
        guest: data.guest,
        useId: arrival.useId,
        at: Date.now()
      })
      setTyped('')
      queryClient.invalidateQueries()
    } catch (error) {
      fail(
        error instanceof Error && error.message
          ? error.message
          : 'Não deu para validar. Tente de novo.'
      )
    }
  }

  const next = () => {
    setFound(null)
    setProblem(null)
    reading.current = false
    setMode('scan')
  }

  if (found)
    return (
      <Valid
        found={found}
        barName={owner.bar?.name ?? ''}
        onClose={() => router.back()}
        onNext={next}
        onUndo={async () => {
          try {
            await undo.mutateAsync({ useId: found.useId })
          } catch (error) {
            // Não desfez: a chegada continua valendo, e o dono precisa saber.
            haptic.error()
            Alert.alert(
              'Não deu para desfazer',
              errorMessage(
                error,
                'A validação continua valendo. Tente de novo.'
              )
            )
            return
          }
          queryClient.invalidateQueries()
          next()
        }}
      />
    )

  const busy = lookup.isPending || register.isPending
  const head = (
    <View style={[styles.top, { top: insets.top + 10 }]}>
      <Round label="Fechar" onPress={() => router.back()}>
        <Icon name="close" size={20} color={PAPER} />
      </Round>
      {mode === 'scan' ? (
        live ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text numberOfLines={1} style={styles.livePillText}>
              {`${shortTitle(gameTitle(live))} · ao vivo`}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )
      ) : null}
      {mode === 'scan' ? (
        <Round
          label={torch ? 'Apagar a lanterna' : 'Acender a lanterna'}
          onPress={() => setTorch((on) => !on)}
        >
          <Icon name="eye" size={20} color={torch ? ACID : PAPER} />
        </Round>
      ) : (
        <Segment mode={mode} onMode={setMode} />
      )}
    </View>
  )

  if (mode === 'type')
    return (
      <View style={[styles.dark, { paddingTop: insets.top + 74 }]}>
        {head}
        <View style={{ paddingHorizontal: 20, gap: 18 }}>
          <Text accessibilityRole="header" style={styles.typeTitle}>
            {'DIGITE O '}
            <Text style={{ color: ACID }}>CÓDIGO</Text>
          </Text>
          <Animated.View style={[styles.boxes, shake.style]}>
            {Array.from({ length: RESERVATION_CODE_LENGTH }, (_, i) => (
              <Box
                key={String(i)}
                letter={typed[i]}
                active={i === typed.length}
                dotAfter={i === 2}
              />
            ))}
          </Animated.View>
          <Text style={[styles.rule, problem && { color: '#f3421d' }]}>
            {problem ?? '6 caracteres · sem O, 0, I, 1 nem L'}
          </Text>
          <Recent rows={recent} />
        </View>
        <View style={[styles.keyboard, { paddingBottom: insets.bottom + 12 }]}>
          {KEY_ROWS.map((row) => (
            <View key={row} style={styles.keyRow}>
              {row.split('').map((key) => (
                <Key
                  key={key}
                  label={key}
                  onPress={() => {
                    haptic.select()
                    setProblem(null)
                    setTyped((now) =>
                      key === '⌫'
                        ? now.slice(0, -1)
                        : now.length < RESERVATION_CODE_LENGTH
                          ? now + key
                          : now
                    )
                  }}
                />
              ))}
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            disabled={typed.length < RESERVATION_CODE_LENGTH || busy}
            onPress={() => check(typed)}
            style={[
              styles.validate,
              (typed.length < RESERVATION_CODE_LENGTH || busy) && {
                opacity: 0.5
              }
            ]}
          >
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              {busy ? 'Validando…' : 'Validar'}
            </Text>
          </Pressable>
        </View>
      </View>
    )

  return (
    <View style={styles.dark}>
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (reading.current || busy) return
            const code = codeFromQr(data)
            if (!code) return
            const last = refused.current
            if (last && last.code === code && Date.now() - last.at < 2500)
              return
            reading.current = true
            // Leu: um toque leve. O sucesso vibra quando o selo encosta.
            haptic.light()
            check(code)
          }}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.veil]} />
      {head}
      <View style={[styles.frameWrap, { top: insets.top + 150 }]}>
        <ScanFrame found={busy} reduced={reduced} />
        <Text style={[text(15, 'SemiBold', 1.3), styles.aim]}>
          {problem ??
            (permission?.granted
              ? owner.bar?.confirmsCodesLater
                ? 'Bar pela comanda: anote o código e lance depois em Quem vai'
                : 'Aponte para o QR do torcedor'
              : 'A câmera lê o QR do código do torcedor')}
        </Text>
        {permission && !permission.granted ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => askPermission()}
            style={[
              styles.validate,
              { alignSelf: 'center', paddingHorizontal: 22 }
            ]}
          >
            <Text style={[text(16, 'Bold', 1.2), { color: INK }]}>
              Permitir a câmera
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <Recent rows={recent} bare />
        <View style={styles.sheetActions}>
          <Outline
            icon="doc"
            label="Digitar código"
            onPress={() => {
              setProblem(null)
              setMode('type')
            }}
          />
          <Outline
            icon="people"
            label="Quem vai"
            onPress={() => router.replace('/quem-vai')}
          />
        </View>
      </View>
    </View>
  )
}

/** O ingresso visto do balcão (3i): quem é, o jogo, a história e a oferta. */
function Valid({
  found,
  barName,
  onClose,
  onNext,
  onUndo
}: {
  found: Found
  barName: string
  onClose: () => void
  onNext: () => void
  onUndo: () => void
}) {
  const insets = useSafeAreaInsets()
  const reduced = useReducedMotion()
  const motion = useStamp('success')
  const left = useSharedValue(1)
  const [undoing, setUndoing] = useState(true)
  useEffect(() => {
    left.set(withTiming(0, { duration: UNDO_MS, easing: Easing.linear }))
    const timer = setTimeout(() => setUndoing(false), UNDO_MS)
    return () => {
      clearTimeout(timer)
      cancelAnimation(left)
    }
  }, [left])
  const bar = useAnimatedStyle(() => ({
    transform: [{ scaleX: left.get() }]
  }))
  const g = found.guest
  const first = g.visitsHere === 0
  const marked = g.markedAt ? sinceLabel(g.markedAt, Date.now()) : null
  return (
    <View style={[styles.dark, { paddingTop: insets.top + 10 }]}>
      <View style={styles.validTop}>
        <Round label="Fechar" onPress={onClose}>
          <Icon name="close" size={20} color={PAPER} />
        </Round>
        <Text
          style={styles.validAt}
        >{`VALIDADO ${formatTime(new Date(found.at))}`}</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 200 }}
      >
        <View style={styles.ticket}>
          <View style={styles.ticketHead}>
            <Text style={styles.ticketBrand}>
              ONSIDE <Text style={styles.ticketKind}>CÓDIGO VÁLIDO</Text>
            </Text>
            <View style={styles.codePill}>
              <Text style={styles.codePillText}>
                {`${found.code.slice(0, 3)}·${found.code.slice(3)}`}
              </Text>
            </View>
          </View>
          <View style={styles.who}>
            <View style={styles.whoAvatar}>
              <Text style={[text(20, 'Bold', 1.1), { color: ACID }]}>
                {found.guestName.trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={[text(24, 'Bold', 1.15), { color: INK, flex: 1 }]}
            >
              {found.guestName}
            </Text>
          </View>
          <Text style={[text(15, 'Regular', 1.45), { color: '#55554f' }]}>
            {`${found.title} · ${brasiliaDay(found.startsAt) === brasiliaDay(Date.now()) ? 'hoje' : ''} ${formatTime(found.startsAt)}`}
            {marked ? `\nmarcou ${marked}` : ''}
          </Text>
          <View style={styles.dash} />
          <View style={styles.stats}>
            <Stat
              value={first ? '1ª' : String(g.visitsHere + 1)}
              label={first ? `visita ao ${barName}` : `visitas ao ${barName}`}
            />
            {g.visitsOnside !== null ? (
              <Stat
                value={String(g.visitsOnside + 1)}
                label="visitas na Onside"
              />
            ) : null}
            {g.friendsToday ? (
              <Stat value={`+${g.friendsToday}`} label="amigos vêm hoje" />
            ) : null}
          </View>
          <Seal
            {...motion}
            reduced={reduced || motion.reduced}
            size={96}
            fontSize={8.2}
            around
            label={
              `VALIDADO NO BALCÃO · ${barName} ·`.length > 36
                ? 'VALIDADO NO BALCÃO · ONSIDE ·'
                : `VALIDADO NO BALCÃO · ${barName} ·`
            }
            style={styles.seal}
          />
        </View>
        {found.offer ? (
          <View style={styles.offer}>
            <Icon name="ticket" size={26} color={INK} accent={INK} />
            <View style={{ flex: 1 }}>
              <Text style={styles.offerKicker}>LIBERE A OFERTA DA CASA</Text>
              <Text style={[text(19, 'Bold', 1.2), { color: INK }]}>
                {found.offer}
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.tip}>
          <Icon name="fire" size={18} color="#aaa9a4" accent={ACID} />
          <Text
            style={[text(15, 'Regular', 1.45), { color: '#c9c7c0', flex: 1 }]}
          >
            {first
              ? 'Primeira vez aqui: vale um “boas-vindas” no balcão.'
              : `${visitLine({ firstVisit: false, visitsThisMonth: g.visitsHere + 1 }).replace('no mês', 'aqui')}: quem volta merece ser reconhecido.`}
          </Text>
        </View>
      </ScrollView>
      <View style={[styles.validFoot, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onNext}
          style={styles.validate}
        >
          <Icon name="camera" size={22} color={INK} accent={INK} />
          <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
            Escanear o próximo
          </Text>
        </Pressable>
        {undoing ? (
          <Animated.View exiting={FadeOut.duration(150)} style={styles.undo}>
            <Text style={[text(15, 'Regular', 1.3), { color: PAPER }]}>
              Código validado
            </Text>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={onUndo}>
              <Text style={[text(15, 'Bold', 1.3), { color: ACID }]}>
                Desfazer
              </Text>
            </Pressable>
            <Animated.View style={[styles.undoBar, bar]} />
          </Animated.View>
        ) : null}
      </View>
    </View>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View
      style={{ flex: 1, minWidth: 0 }}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

/** O quadro do QR com os cantos acid e a linha de leitura. */
function ScanFrame({ found, reduced }: { found: boolean; reduced: boolean }) {
  const line = useSharedValue(0)
  const close = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    line.set(
      withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.linear }),
        -1,
        true
      )
    )
    return () => cancelAnimation(line)
  }, [line, reduced])
  useEffect(() => {
    close.set(withTiming(found ? 0.92 : 1, { duration: 150, easing: EASE }))
  }, [found, close])
  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (reduced ? 0.5 : line.get()) * (FRAME - 40) }]
  }))
  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: close.get() }]
  }))
  return (
    <Animated.View style={[styles.frame, frameStyle]}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <View key={corner} style={[styles.corner, CORNERS[corner]]} />
      ))}
      <Animated.View style={[styles.scanLine, lineStyle]} />
    </Animated.View>
  )
}

function Box({
  letter,
  active,
  dotAfter
}: {
  letter?: string
  active: boolean
  dotAfter: boolean
}) {
  return (
    <>
      <View
        style={[
          styles.box,
          (active || letter) && {
            borderColor: active ? ACID : 'rgba(241,238,230,.3)'
          },
          active && { borderWidth: 2.5 }
        ]}
      >
        <Text style={styles.boxText}>{letter ?? ''}</Text>
      </View>
      {dotAfter ? <Text style={styles.boxDot}>·</Text> : null}
    </>
  )
}

function Key({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '⌫' ? 'Apagar' : label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        pressed && { backgroundColor: '#3a3a33' }
      ]}
    >
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  )
}

function Recent({
  rows,
  bare
}: {
  rows: {
    name: string
    validatedAt: Date | string | null
    arrival: { firstVisit: boolean; visitsThisMonth: number } | null
    game: {
      participants: string[]
      participantFreeText: string | null
      championship: string
    }
  }[]
  bare?: boolean
}) {
  if (!rows.length) return null
  return (
    <View
      style={[
        styles.recent,
        bare && { backgroundColor: 'transparent', padding: 0 }
      ]}
    >
      <View style={styles.recentHead}>
        <Text
          style={styles.recentKicker}
        >{`VALIDADOS HOJE · ${rows.length}`}</Text>
        <Text style={[styles.recentKicker, { color: '#aaa9a4' }]}>
          {formatTime(new Date())}
        </Text>
      </View>
      {rows.slice(0, 2).map((row, index) => (
        <View
          key={`${row.name}-${String(row.validatedAt)}`}
          style={[styles.recentRow, index > 0 && styles.recentLine]}
        >
          <View
            style={[
              styles.recentAvatar,
              index % 2 === 0
                ? { backgroundColor: ACID }
                : { backgroundColor: PAPER }
            ]}
          >
            <Text style={[text(13, 'Bold', 1.1), { color: INK }]}>
              {row.name.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[text(16, 'Bold', 1.25), { color: PAPER }]}
            >
              {row.name}
            </Text>
            <Text style={styles.recentMeta}>
              {[
                row.validatedAt ? formatTime(row.validatedAt) : null,
                row.arrival?.firstVisit
                  ? '1ª vez'
                  : row.arrival
                    ? `${row.arrival.visitsThisMonth}ª no mês`
                    : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[styles.recentMeta, { maxWidth: 110 }]}
          >
            {shortTitle(gameTitle(row.game))}
          </Text>
        </View>
      ))}
    </View>
  )
}

function Round({
  label,
  onPress,
  children
}: {
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={styles.round}
    >
      {children}
    </Pressable>
  )
}

function Segment({
  mode,
  onMode
}: {
  mode: 'scan' | 'type'
  onMode: (mode: 'scan' | 'type') => void
}) {
  return (
    <View style={styles.segment}>
      {(['scan', 'type'] as const).map((key) => {
        const on = key === mode
        return (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic.select()
              onMode(key)
            }}
            style={[styles.segmentItem, on && { backgroundColor: PAPER }]}
          >
            <Text
              style={[
                text(15, 'SemiBold', 1.2),
                { color: on ? INK : '#aaa9a4' }
              ]}
            >
              {key === 'scan' ? 'Escanear' : 'Digitar'}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function Outline({
  icon,
  label,
  onPress
}: {
  icon: 'doc' | 'people'
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.outline}
    >
      <Icon name={icon} size={20} color={PAPER} accent={ACID} />
      <Text style={[text(16, 'Bold', 1.2), { color: PAPER }]}>{label}</Text>
    </Pressable>
  )
}

/** O código dentro do QR: o link `/admin/validate?code=` ou o código puro. */
export function codeFromQr(data: string): string | null {
  const match = /[?&]code=([A-Za-z0-9]+)/.exec(data)
  const code = normalizeReservationCode(match?.[1] ?? data)
  return isReservationCodeShaped(code) ? code : null
}

/** "Fla × Pal": as três primeiras letras de cada lado. */
function shortTitle(title: string) {
  const sides = title.split(' × ')
  return sides.length === 2
    ? sides.map((side) => side.slice(0, 3)).join(' × ')
    : title
}

// O teclado só com o que existe no código (sem O, 0, I, 1 nem L).
const DIGITS = CODE_ALPHABET.replace(/[A-Z]/g, '')
const LETTERS = CODE_ALPHABET.replace(/[0-9]/g, '')
const KEY_ROWS = [
  DIGITS,
  LETTERS.slice(0, 9),
  LETTERS.slice(9, 17),
  `${LETTERS.slice(17)}⌫`
]

const CORNER = 46
const CORNERS = {
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 6,
    borderLeftWidth: 6,
    borderTopLeftRadius: 24
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 6,
    borderRightWidth: 6,
    borderTopRightRadius: 24
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 6,
    borderLeftWidth: 6,
    borderBottomLeftRadius: 24
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 6,
    borderRightWidth: 6,
    borderBottomRightRadius: 24
  }
} as const

const styles = StyleSheet.create({
  dark: { flex: 1, backgroundColor: INK },
  veil: { backgroundColor: 'rgba(12,12,10,.45)' },
  top: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(42,42,36,.85)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  livePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 999,
    backgroundColor: 'rgba(42,42,36,.85)',
    paddingHorizontal: 14
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f3421d' },
  livePillText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 14,
    color: PAPER
  },
  frameWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 24
  },
  frame: { width: FRAME, height: FRAME },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: ACID
  },
  scanLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: ACID
  },
  aim: { color: PAPER, textAlign: 'center', paddingHorizontal: 32 },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
    borderRadius: 30,
    backgroundColor: 'rgba(28,28,24,.94)',
    padding: 16,
    gap: 14
  },
  sheetActions: { flexDirection: 'row', gap: 10 },
  outline: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(241,238,230,.3)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  recent: { borderRadius: 22, backgroundColor: '#1c1c18', padding: 14, gap: 4 },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between' },
  recentKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: ACID
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10
  },
  recentLine: { borderTopWidth: 1, borderTopColor: 'rgba(241,238,230,.1)' },
  recentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  recentMeta: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    color: '#aaa9a4'
  },
  typeTitle: {
    fontFamily: 'Anton',
    fontSize: 48,
    color: PAPER,
    marginVertical: -11.6
  },
  boxes: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  box: {
    flex: 1,
    height: 72,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(241,238,230,.14)',
    backgroundColor: '#1c1c18',
    alignItems: 'center',
    justifyContent: 'center'
  },
  boxText: { fontFamily: 'GeistMono-SemiBold', fontSize: 30, color: ACID },
  boxDot: { fontFamily: 'GeistMono-SemiBold', fontSize: 20, color: '#55554f' },
  rule: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12.5,
    color: '#55554f',
    textAlign: 'center'
  },
  keyboard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 8,
    gap: 8
  },
  keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  key: {
    flex: 1,
    maxWidth: 46,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#2a2a24',
    alignItems: 'center',
    justifyContent: 'center'
  },
  keyText: { fontFamily: 'Archivo-SemiBold', fontSize: 20, color: PAPER },
  validate: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
    shadowColor: '#7f9a12',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(42,42,36,.85)'
  },
  segmentItem: {
    flex: 1,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  validTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16
  },
  validAt: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1,
    color: ACID
  },
  ticket: {
    backgroundColor: '#faf8f3',
    borderRadius: 26,
    padding: 18,
    gap: 12,
    overflow: 'hidden'
  },
  ticketHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  ticketBrand: { fontFamily: 'Anton', fontSize: 18, color: INK },
  ticketKind: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 1.1,
    color: '#55554f'
  },
  codePill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: INK,
    justifyContent: 'center'
  },
  codePillText: { fontFamily: 'GeistMono-SemiBold', fontSize: 13, color: ACID },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  whoAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dash: {
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(18,18,15,.18)'
  },
  // O selo cai no canto, ao lado dos números: a fileira reserva a altura dele.
  stats: { flexDirection: 'row', gap: 10, paddingRight: 100, minHeight: 96 },
  statValue: {
    fontFamily: 'Anton',
    fontSize: 36,
    color: INK,
    marginVertical: -8.7
  },
  statLabel: {
    marginTop: 12,
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    lineHeight: 16,
    color: '#55554f'
  },
  seal: { position: 'absolute', right: 10, bottom: 10 },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: ACID
  },
  offerKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 1.2,
    color: '#3d4a06'
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#1c1c18'
  },
  validFoot: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 10 },
  undo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 54,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#1c1c18',
    overflow: 'hidden'
  },
  undoBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: ACID,
    transformOrigin: 'left'
  }
})
