import {
  RATING_REASONS,
  type RatingReasonId
} from '@findsports_oficial/api/lib/rating-reasons'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { RATING_COMMENT_MAX } from '@findsports_oficial/db/rating-limits'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from 'react-native'
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { markAchievementsSeen } from '@/components/achievement-watcher'
import { Photo } from '@/components/explore'
import { MedalImage } from '@/components/medal'
import { EASE, ErrorText, haptic } from '@/components/motion'
import { AcidButton, ObTitle } from '@/components/ob-frame'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import type { Achievement } from '@/lib/achievements'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import type { MedalId } from '@/lib/medals'
import { trpc, trpcClient } from '@/lib/trpc'

/*
 * "Como foi?" (rodada 4 do redesign, tela 1): uma tela só, que cresce para
 * baixo. O bar e o jogo no topo, o selo que diz se a avaliação conta (só a
 * verificada entra na nota, WEB-408), "Você foi?" (só para quem marcou
 * presença), "Voltaria?", a nota em estrelas, "O que pesou?", o comentário
 * (passa pela revisão da Onside) e "Mostrar meu nome". Tudo vai num
 * `postGame.answer`. Enviada, a tela troca para "Valeu pela resenha", com o
 * que acontece com cada parte e, se veio medalha, o atalho para ela.
 */

/** "ONTEM · DOM 7": o dia do jogo, no fuso de Brasília. */
function whenLabel(startsAt: string, now: number) {
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo'
    })
  const date = new Date(startsAt)
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString('pt-BR', {
      ...options,
      timeZone: 'America/Sao_Paulo'
    })
  const short = `${part({ weekday: 'short' }).replace('.', '')} ${part({ day: 'numeric' })}`
  const lead =
    day(date.getTime()) === day(now)
      ? 'hoje'
      : day(date.getTime()) === day(now - 86_400_000)
        ? 'ontem'
        : null
  return { short, label: (lead ? `${lead} · ${short}` : short).toUpperCase() }
}

/** "Sua primeira avaliação.": a frase curta da medalha nova. */
function medalLine(medal: Achievement) {
  if (medal.group === 'resenhas')
    return medal.target === 1
      ? 'Sua primeira avaliação. Toque para ver em 3D.'
      : `${medal.target} avaliações. Toque para ver em 3D.`
  return 'Toque para ver em 3D.'
}

export default function AfterGame() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const userId = authClient.useSession().data?.user.id
  const pending = useQuery(trpc.postGame.pending.queryOptions())
  const achievements = useQuery(trpc.achievements.mine.queryOptions())
  // O item fica guardado: enviado, ele sai da fila, e a tela de "valeu"
  // ainda precisa dele.
  const [kept, setKept] = useState<
    NonNullable<typeof pending.data>[number] | null
  >(null)
  const game = kept ?? pending.data?.find((item) => item.eventId === eventId)
  const asksPresence = Boolean(game?.presence)
  const canRate = Boolean(game?.rating)
  const [went, setWent] = useState<boolean | null>(null)
  const [wouldReturn, setWouldReturn] = useState<boolean | null>(null)
  const [reasons, setReasons] = useState<RatingReasonId[]>([])
  const [stars, setStars] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [identified, setIdentified] = useState(false)
  const [sent, setSent] = useState<{ medal: Achievement | null } | null>(null)

  const answer = useMutation(trpc.postGame.answer.mutationOptions())
  const sending = answer.isPending
  const error = answer.error?.message ?? null
  const now = Date.now()

  const send = async () => {
    if (!game) return
    const before = new Set(
      (achievements.data?.achievements ?? [])
        .filter((a) => a.unlockedAt)
        .map((a) => a.id)
    )
    const rating =
      went !== false && canRate && wouldReturn !== null && stars !== null
    try {
      // "Não fui" não leva nota: o servidor recusaria a resposta inteira.
      await answer.mutateAsync({
        eventId: game.eventId,
        attended: asksPresence ? (went ?? true) : undefined,
        rating: rating
          ? { wouldReturn, reasons, stars, comment, identified }
          : undefined
      })
    } catch {
      return
    }
    haptic.success()
    // "Não fui" encerra ali (o "Obrigado por avisar" já está na tela).
    if (!rating) {
      await Promise.all(
        [trpc.postGame.pending.queryKey(), trpc.attendance.mine.queryKey()].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey })
        )
      )
      close()
      return
    }
    setKept(game)
    // A medalha nova aparece aqui: marcada como vista antes de o cache saber,
    // para a 2k não abrir por cima.
    let medal: Achievement | null = null
    if (rating && userId) {
      const after = await trpcClient.achievements.mine.query().catch(() => null)
      const fresh = (after?.achievements ?? []).filter(
        (a) => a.unlockedAt && !before.has(a.id)
      )
      medal = fresh[0] ?? null
      if (fresh.length)
        await markAchievementsSeen(
          userId,
          fresh.map((a) => a.id)
        )
    }
    setSent({ medal })
    await Promise.all(
      [
        trpc.postGame.pending.queryKey(),
        trpc.achievements.mine.queryKey(),
        // "★ 4" ou "Não fui" na linha de Meus jogos e de Já fui.
        trpc.attendance.mine.queryKey(),
        trpc.attendance.visits.queryKey()
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    )
  }

  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/explore')

  if (!game) {
    return (
      <View
        style={[
          styles.screen,
          styles.center,
          { backgroundColor: palette.bg, paddingTop: insets.top }
        ]}
      >
        {pending.isPending ? (
          <ActivityIndicator color={palette.ink} />
        ) : (
          <>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Este jogo não tem avaliação aberta.
            </Text>
            <Round icon="close" label="Fechar" onPress={close} />
          </>
        )}
      </View>
    )
  }

  const when = whenLabel(game.startsAt, now)
  const card = (
    <View
      style={[
        styles.bar,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <Photo uri={game.photoUrl} name={game.barName} style={styles.photo} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(16, 'Bold', 1.2), { color: palette.ink }]}
        >
          {game.barName}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.mono12, { color: palette.muted }]}
        >
          {gameTitle(game)} ·{' '}
          {sent && stars
            ? `★ ${stars}`
            : `${when.short} ${formatTime(game.startsAt)}`}
        </Text>
      </View>
    </View>
  )

  if (sent) {
    return (
      <Sent
        top={insets.top}
        bottom={insets.bottom}
        card={card}
        barName={game.barName}
        verified={game.verified}
        rated={stars !== null && went !== false}
        commented={comment.trim().length > 0}
        identified={identified}
        reasons={reasons}
        medal={sent.medal}
        onClose={close}
        onMedal={(id) =>
          router.replace({
            pathname: '/conquista/[id]',
            params: { id, nova: '1' }
          })
        }
      />
    )
  }

  // As perguntas aparecem uma depois da outra, embaixo (a tela não pula).
  const presenceDone = !asksPresence || went !== null
  const rating = presenceDone && went !== false && canRate
  const details = rating && wouldReturn !== null
  const ready =
    !sending &&
    presenceDone &&
    (went === false || !canRate || (wouldReturn !== null && stars !== null))

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.top}>
          <Round icon="back" label="Voltar" onPress={close} />
          <Text style={[styles.mono12, { color: palette.muted }]}>
            {when.label}
          </Text>
        </View>
        <ObTitle plain="Como" hot="foi?" size={44} />
        {card}
        {/* "Não fui" não tem nota: o selo da nota sai. */}
        {went === false ? null : <Verified kind={game.verified} />}

        {asksPresence ? (
          <Question title="Você foi?">
            <Pair
              left="Fui"
              right="Não fui"
              value={went}
              onChange={(value) => {
                setWent(value)
                if (!value) setWouldReturn(null)
              }}
            />
          </Question>
        ) : null}

        {presenceDone && went === false ? (
          <Animated.View entering={STEP_IN} style={{ gap: 6 }}>
            <Text style={[text(16, 'Bold', 1.3), { color: palette.ink }]}>
              Obrigado por avisar
            </Text>
            <Text style={[text(14, 'Regular', 1.4), { color: palette.muted }]}>
              Sem avaliação deste jogo. Da próxima vez, ela abre em Meus jogos.
            </Text>
          </Animated.View>
        ) : null}

        {rating ? (
          <Animated.View entering={STEP_IN}>
            <Question title="Voltaria para ver um jogo lá?">
              <Pair
                left="Voltaria"
                right="Não voltaria"
                value={wouldReturn}
                onChange={setWouldReturn}
              />
            </Question>
          </Animated.View>
        ) : null}

        {details ? (
          <Animated.View entering={STEP_IN} style={{ gap: 14 }}>
            <Question title="Sua nota">
              <Stars value={stars} onChange={setStars} />
            </Question>
            <Question title="O que pesou?">
              <View style={styles.reasons}>
                {RATING_REASONS.map((reason) => {
                  const on = reasons.includes(reason.id)
                  return (
                    <Pressable
                      key={reason.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      hitSlop={4}
                      onPress={() => {
                        haptic.select()
                        setReasons(
                          on
                            ? reasons.filter((id) => id !== reason.id)
                            : [...reasons, reason.id]
                        )
                      }}
                      // Só cor: acid quando voltaria, tinta quando não.
                      style={[
                        styles.reason,
                        {
                          backgroundColor: on
                            ? wouldReturn
                              ? ACID
                              : palette.ink
                            : palette.mark
                        }
                      ]}
                    >
                      <Text
                        style={[
                          text(13.5, 'SemiBold', 1.2),
                          {
                            color: on
                              ? wouldReturn
                                ? INK
                                : palette.bg
                              : palette.ink
                          }
                        ]}
                      >
                        {reason.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </Question>
            <Question title="Quer contar mais?">
              <TextInput
                accessibilityLabel="Quer contar mais?"
                value={comment}
                onChangeText={setComment}
                maxLength={RATING_COMMENT_MAX}
                multiline
                placeholder="Som, telão, atendimento, a torcida…"
                placeholderTextColor={palette.muted}
                selectionColor={palette.ink}
                style={[
                  text(14.5, 'Regular', 1.4),
                  styles.comment,
                  {
                    color: palette.ink,
                    backgroundColor: palette.card,
                    borderColor: palette.line
                  }
                ]}
              />
              <View style={styles.commentFoot}>
                <Text
                  style={[
                    text(12.5, 'Regular', 1.4),
                    { color: palette.muted, flex: 1 }
                  ]}
                >
                  Passa pela Onside antes de aparecer.
                </Text>
                {comment.length >= 400 ? (
                  <Text
                    style={[
                      text(12.5, 'Regular', 1.4),
                      { color: palette.muted }
                    ]}
                  >
                    {comment.length} de {RATING_COMMENT_MAX}
                  </Text>
                ) : null}
              </View>
            </Question>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: identified }}
              onPress={() => {
                haptic.select()
                setIdentified(!identified)
              }}
              style={styles.identify}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  style={[text(15, 'SemiBold', 1.3), { color: palette.ink }]}
                >
                  Mostrar meu nome
                </Text>
                <Text
                  style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
                >
                  O bar e os torcedores veem seu nome. Desligado, aparece
                  “Anônimo”.
                </Text>
              </View>
              <Switch on={identified} />
            </Pressable>
          </Animated.View>
        ) : null}

        <ErrorText style={[text(13.5, 'SemiBold'), { color: palette.live }]}>
          {error}
        </ErrorText>

        {presenceDone && (went === false || details || !canRate) ? (
          <Animated.View entering={STEP_IN}>
            <AcidButton
              label={
                sending
                  ? 'Enviando…'
                  : went === false
                    ? 'Enviar'
                    : 'Enviar avaliação'
              }
              busy={sending}
              disabled={!ready}
              onPress={send}
            />
          </Animated.View>
        ) : null}
      </ScrollView>
      {/* Rolando, o texto passa por baixo da barra de status: o papel a cobre. */}
      <View
        pointerEvents="none"
        style={[
          styles.edge,
          { height: insets.top, backgroundColor: palette.bg }
        ]}
      />
    </View>
  )
}

/** A pergunta seguinte aparece embaixo: fade com 8 pt de subida, 200 ms. */
const STEP_IN = FadeInDown.duration(200).withInitialValues({
  opacity: 0,
  transform: [{ translateY: 8 }]
})

/** O botão redondo do topo (`.rb`). */
function Round({
  icon,
  label,
  onPress
}: {
  icon: 'back' | 'close'
  label: string
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={[
        styles.round,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <Icon name={icon} size={20} color={palette.ink} />
    </Pressable>
  )
}

/** O selo do topo: se a avaliação entra na nota. */
function Verified({ kind }: { kind: 'code' | 'checkin' | null }) {
  const palette = usePalette()
  if (!kind)
    return (
      <View style={{ gap: 8 }}>
        <View style={[styles.ver, { backgroundColor: palette.mark }]}>
          <Icon name="eye" size={14} color={palette.ink} />
          <Text style={[text(12, 'SemiBold', 1.2), { color: palette.ink }]}>
            Sem visita verificada
          </Text>
        </View>
        <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
          Sua avaliação fica gravada e o bar vê, mas não entra na nota. Para
          contar, valide o código ou faça check-in na próxima vez.
        </Text>
      </View>
    )
  return (
    <View style={[styles.ver, { backgroundColor: ACID }]}>
      <Icon name="check" size={14} color={INK} />
      <Text style={[text(12, 'SemiBold', 1.2), { color: INK }]}>
        {kind === 'code'
          ? 'Verificada · você validou o código'
          : 'Verificada · você fez check-in'}
      </Text>
    </View>
  )
}

/** Um título de pergunta (`.q h6`) e o que vem embaixo. */
function Question({ title, children }: { title: string; children: ReactNode }) {
  const palette = usePalette()
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.question, { color: palette.ink }]}>
        {title.toLocaleUpperCase('pt-BR')}
      </Text>
      {children}
    </View>
  )
}

/** Os dois botões grandes (`.two`): Fui / Não fui, Voltaria / Não voltaria. */
function Pair({
  left,
  right,
  value,
  onChange
}: {
  left: string
  right: string
  value: boolean | null
  onChange: (value: boolean) => void
}) {
  const palette = usePalette()
  const option = (label: string, mine: boolean) => {
    const on = value === mine
    return (
      <Pressable
        key={label}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        onPress={() => {
          if (!on) haptic.select()
          onChange(mine)
        }}
        style={[
          styles.pairItem,
          on
            ? {
                backgroundColor: palette.ink,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 }
              }
            : { backgroundColor: palette.card, shadowColor: palette.drop }
        ]}
      >
        <Text
          style={[
            text(15.5, 'Bold', 1.2),
            { color: on ? palette.bg : palette.ink }
          ]}
        >
          {label}
        </Text>
      </Pressable>
    )
  }
  return (
    <View accessibilityRole="radiogroup" style={styles.pair}>
      {option(left, true)}
      {option(right, false)}
    </View>
  )
}

/** As cinco estrelas grandes (`.stars`): acid quando marcadas. */
function Stars({
  value,
  onChange
}: {
  value: number | null
  onChange: (stars: number) => void
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarBox
          key={n}
          n={n}
          on={value !== null && n <= value}
          selected={value === n}
          onPress={() => {
            if (value !== n) haptic.select()
            onChange(n)
          }}
        />
      ))}
    </View>
  )
}

function StarBox({
  n,
  on,
  selected,
  onPress
}: {
  n: number
  on: boolean
  selected: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const scale = useSharedValue(1)
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }]
  }))
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
      onPress={() => {
        // Retorno ao toque na estrela tocada: .9 → 1, 150 ms.
        scale.set(0.9)
        scale.set(withTiming(1, { duration: 150, easing: EASE }))
        onPress()
      }}
    >
      <Animated.View
        style={[
          styles.star,
          on
            ? { backgroundColor: ACID, shadowColor: '#7f9a12' }
            : { backgroundColor: palette.card, shadowColor: palette.drop },
          style
        ]}
      >
        <Icon name="star" size={26} color={on ? INK : palette.muted} />
      </Animated.View>
    </Pressable>
  )
}

/** O interruptor do desenho (`.sw`): acid com a bola de tinta. */
function Switch({ on }: { on: boolean }) {
  const palette = usePalette()
  const x = useSharedValue(on ? 1 : 0)
  useEffect(() => {
    x.set(withTiming(on ? 1 : 0, { duration: 150, easing: EASE }))
  }, [on, x])
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: 20 * x.get() }]
  }))
  return (
    <View
      style={[styles.switch, { backgroundColor: on ? ACID : palette.mark }]}
    >
      <Animated.View
        style={[
          styles.knob,
          { backgroundColor: on ? INK : palette.card },
          knob
        ]}
      />
    </View>
  )
}

/** "Valeu pela resenha": o que acontece com cada parte. */
function Sent({
  top,
  bottom,
  card,
  barName,
  verified,
  rated,
  commented,
  identified,
  reasons,
  medal,
  onClose,
  onMedal
}: {
  top: number
  bottom: number
  card: ReactNode
  barName: string
  verified: 'code' | 'checkin' | null
  rated: boolean
  commented: boolean
  identified: boolean
  reasons: RatingReasonId[]
  medal: Achievement | null
  onClose: () => void
  onMedal: (id: string) => void
}) {
  const palette = usePalette()
  const labels = RATING_REASONS.filter((r) => reasons.includes(r.id)).map(
    (r) => r.label
  )
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`
      : (labels[0] ?? '')
  const rows: {
    icon: 'star' | 'doc' | 'people'
    title: string
    body: string
  }[] = []
  if (rated)
    rows.push(
      verified
        ? {
            icon: 'star',
            title: 'A nota já conta',
            body: `Sua avaliação é verificada e entrou na nota do ${barName}.`
          }
        : {
            icon: 'star',
            title: 'A nota fica guardada',
            body: 'O bar vê sua avaliação, mas ela não entra na nota sem visita verificada.'
          }
    )
  if (commented)
    rows.push({
      icon: 'doc',
      title: 'Comentário em revisão',
      body: `Aparece na página do bar depois que a Onside olhar, ${identified ? 'com o seu nome' : 'como “Anônimo”'}.`
    })
  if (labels.length)
    rows.push({
      icon: 'people',
      title: 'Ajuda quem vai depois',
      body: `${list} ${labels.length === 1 ? 'entra' : 'entram'} no resumo do bar.`
    })
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.screen,
        styles.body,
        { backgroundColor: palette.bg, paddingTop: top + 8 }
      ]}
    >
      <View style={styles.top}>
        <Round icon="close" label="Fechar" onPress={onClose} />
      </View>
      <ObTitle plain="Valeu pela" hot="resenha" size={44} breakLine />
      {card}
      {rows.length ? (
        <View
          style={[
            styles.ok,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          {rows.map((row, i) => (
            <View
              key={row.title}
              style={[
                styles.okRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
              ]}
            >
              <Icon name={row.icon} size={20} color={palette.ink} />
              <View style={{ flex: 1 }}>
                <Text style={[text(15, 'Bold', 1.3), { color: palette.ink }]}>
                  {row.title}
                </Text>
                <Text
                  style={[text(14, 'Regular', 1.4), { color: palette.muted }]}
                >
                  {row.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {medal ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Medalha nova: ${medal.name}`}
          onPress={() => onMedal(medal.id)}
          style={[
            styles.medal,
            { backgroundColor: palette.dark ? '#26261f' : INK }
          ]}
        >
          <MedalImage id={medal.id as MedalId} size={60} />
          <View style={{ flex: 1 }}>
            <Text style={styles.medalLabel}>MEDALHA NOVA</Text>
            <Text style={[text(15, 'Bold', 1.3), { color: PAPER }]}>
              {medal.name}
            </Text>
            <Text style={[text(13, 'Regular', 1.4), { color: '#aaa9a4' }]}>
              {medalLine(medal)}
            </Text>
          </View>
          <Icon name="next" size={18} color="#aaa9a4" />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={[
          styles.inkButton,
          {
            backgroundColor: palette.ink,
            marginBottom: Math.max(bottom, 16) + 8
          }
        ]}
      >
        <Text style={[text(16, 'Bold', 1.2), { color: palette.bg }]}>
          Voltar a Meus jogos
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  // `.pg`: 16 dos lados, 14 entre as peças.
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  mono12: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  // `.bcard`.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 20,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  photo: { width: 58, height: 58, borderRadius: 14 },
  ver: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14
  },
  question: { fontFamily: 'Anton', fontSize: 24, marginVertical: -5.8 },
  pair: { flexDirection: 'row', gap: 8 },
  pairItem: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  stars: { flexDirection: 'row', gap: 6 },
  star: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  reason: {
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 17,
    justifyContent: 'center'
  },
  comment: {
    minHeight: 64,
    maxHeight: 130,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top'
  },
  commentFoot: { flexDirection: 'row', gap: 12 },
  identify: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switch: { width: 50, height: 30, borderRadius: 15, padding: 3 },
  knob: { width: 24, height: 24, borderRadius: 12 },
  edge: { position: 'absolute', top: 0, left: 0, right: 0 },
  // `.okc`.
  ok: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  okRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12
  },
  medal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  medalLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: ACID,
    marginBottom: 2
  },
  inkButton: {
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
