import {
  type ActionPhase,
  actionPhase
} from '@findsports_oficial/api/lib/transient-error'
import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { type ReactNode, useEffect, useState } from 'react'
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NoticesEmpty } from '@/components/empty-states'
import { useExploreState } from '@/components/explore-state'
import { AddButton, useFriendActions, useKept } from '@/components/friends'
import { useLayout, useNavInsets } from '@/components/layout'
import { MedalImage } from '@/components/medal'
import {
  haptic,
  LABEL_IN,
  ScalePress,
  SWAP,
  usePress
} from '@/components/motion'
import { Segmented } from '@/components/segmented'
import { useSoon } from '@/components/soon'
import { Skeleton } from '@/components/states'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  ErrorState,
  errorMessage,
  Icon,
  INK,
  MAX_FONT_SCALE,
  PAPER,
  phaseLabel,
  Text,
  text,
  useFitLabel,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { type Achievement, unit } from '@/lib/achievements'
import { firstName, formatTime, searchCenter } from '@/lib/explore'
import type { MedalId } from '@/lib/medals'
import { formatCode } from '@/lib/my-games'
import {
  buildNotices,
  type CallNotice,
  callLine,
  type FriendNotice,
  inTab,
  type Notice,
  type NoticeTab,
  noticeAgo,
  todayGoing
} from '@/lib/notices'
import { type NearBar, sides } from '@/lib/search'
import { trpc } from '@/lib/trpc'

/*
 * Avisos (19c/19h do design). No topo, o jogo marcado para hoje, com o
 * código e os amigos que vão. Embaixo, os avisos montados do que já existe
 * (`lib/notices.ts`): oferta liberada, jogo dos seus times perto, conquista
 * desbloqueada e, dos amigos, pedido recebido (com Aceitar e Recusar) e
 * pedido aceito, e o chamado de amigo (Rodada 24, com "Vou também" e "Agora
 * não"). As abas são as do design, Tudo, Jogos e Amigos; conquista
 * fica em Tudo. Ranking e comunidades ainda não existem. "Lido" fica no
 * aparelho.
 */

const READ_KEY = 'onside.avisos-lidos'
type Answered = 'friends' | 'declined'
type CallAnswered = { status: 'going' | 'not_now'; code: string | null }

export default function Notices() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  const state = useExploreState()
  useStatusBar('auto')
  const [tab, setTab] = useState<NoticeTab>('all')
  const [read, setRead] = useState<string[]>([])
  useEffect(() => {
    SecureStore.getItemAsync(READ_KEY)
      .then((raw) => raw && setRead(JSON.parse(raw)))
      .catch(() => {})
  }, [])

  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const medals = useQuery(trpc.achievements.mine.queryOptions())
  const teams = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const friendNotices = useQuery(trpc.friends.notices.queryOptions())
  // Pedido respondido continua na tela, com a resposta, até ela abrir de novo.
  const requests = useKept(friendNotices.data?.requests)
  const [answered, setAnswered] = useState<Record<string, Answered>>({})
  const actions = useFriendActions()
  const respond = (person: FriendNotice, accept: boolean) =>
    actions.respond.mutate(
      { userId: person.id, accept },
      {
        onSuccess: () =>
          setAnswered((all) => ({
            ...all,
            [person.id]: accept ? 'friends' : 'declined'
          }))
      }
    )
  // Chamado de amigo: a resposta troca o card na hora e fica até reabrir.
  const queryClient = useQueryClient()
  const calls = useKept(friendNotices.data?.calls)
  const [callAnswers, setCallAnswers] = useState<Record<string, CallAnswered>>(
    {}
  )
  const answerCall = useMutation(
    trpc.friends.respondCall.mutationOptions({
      onSuccess: (result, input) => {
        if (result.status === 'going') haptic.success()
        else haptic.select()
        setCallAnswers((all) => ({
          ...all,
          [input.callId]: { status: result.status, code: result.code }
        }))
        // O jogo marcado entra no cartão de hoje e em Meus jogos.
        queryClient.invalidateQueries({
          queryKey: trpc.attendance.pathKey()
        })
      },
      onError: (error) => {
        haptic.error()
        Alert.alert(
          'Não deu certo',
          errorMessage(error, 'Tente de novo em instantes.')
        )
      }
    })
  )
  // Avisar e Lembrar, de "Bares pra você" (WEB-425).
  const asked = useQuery(trpc.recommendations.notices.queryOptions())
  const center = searchCenter(state.device, city.data)
  const teamIds = (teams.data ?? []).map((t) => t.id)
  const teamBars = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm: 10,
      teamIds,
      limit: 50
    }),
    enabled: teamIds.length > 0
  })
  const now = Date.now()
  const list = medals.data?.achievements ?? []
  const notices = buildNotices(
    {
      mine: mine.data ?? [],
      medals: list,
      teamBars: (teamBars.data?.bars ?? []) as NearBar[],
      sides,
      friends: {
        requests,
        accepted: friendNotices.data?.accepted ?? [],
        calls: calls.map((call) => ({
          ...call,
          status: callAnswers[call.id]?.status ?? call.status
        })),
        callsAccepted: friendNotices.data?.callsAccepted
      },
      alerts: asked.data?.alerts,
      reminders: asked.data?.reminders
    },
    now
  )
  const shown = notices.filter((n) => inTab(n, tab))
  // O que cada botão de resposta conta enquanto tenta (WEB-460).
  const callPhase = actionPhase([answerCall])
  const respondPhase = actionPhase([actions.respond])
  const sources = [mine, medals, friendNotices, asked]
  const failed = sources.find((q) => q.isError)
  const unreadFriends = notices.filter(
    (n) => inTab(n, 'friends') && !read.includes(n.id)
  ).length
  // Nada em lugar nenhum, fora do celular: o "Tudo em dia" do design
  // (Rodada 14, Adaptativo 10), sem as abas. No celular, a frase de sempre.
  const phone = useLayout().kind === 'phone'
  const calm =
    !phone &&
    !mine.isPending &&
    !medals.isPending &&
    !failed &&
    notices.length === 0
  // Aberta a tela, o que está nela conta como lido na próxima vez; o ponto
  // acid fica nesta visita (o desenho não tem "Ler tudo").
  const loaded = !mine.isPending && !medals.isPending
  const ids = notices.map((n) => n.id).join()
  useEffect(() => {
    if (!loaded || !ids) return
    SecureStore.getItemAsync(READ_KEY)
      .then((raw) => {
        const before: string[] = raw ? JSON.parse(raw) : []
        const next = [...new Set([...before, ...ids.split(',')])].slice(-200)
        return SecureStore.setItemAsync(READ_KEY, JSON.stringify(next))
      })
      .catch(() => {})
  }, [loaded, ids])

  // O jogo marcado para hoje que ainda não acabou: o cartão do topo.
  const today = (mine.data ?? [])
    .filter((g) => !g.ended && brasiliaDay(g.startsAt) === brasiliaDay(now))
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    )[0]

  const open = (notice: Notice) => {
    if (notice.kind === 'offer') router.push(`/codigo/${notice.eventId}`)
    else if (notice.kind === 'medal')
      router.push(`/conquista/${notice.medalId}` as Href)
    else if (
      notice.kind === 'friend-request' ||
      notice.kind === 'friend-accepted'
    )
      router.push(`/amigo/${notice.person.id}` as Href)
    else if (notice.kind === 'call')
      router.push(`/bar/${notice.call.barId}` as Href)
    else if (notice.kind === 'call-accepted')
      router.push(`/amigo/${notice.call.person.id}` as Href)
    else if (notice.kind === 'alert')
      router.push(`/bar/${notice.barId}` as Href)
    else if (notice.kind === 'reminder')
      router.push({
        pathname: '/vou/[barId]',
        params: { barId: notice.barId, eventId: notice.eventId }
      } as Href)
    else router.push({ pathname: '/busca', params: { q: notice.title } })
  }

  const pull = usePullRefresh(() =>
    Promise.all([
      mine.refetch(),
      medals.refetch(),
      teamBars.refetch(),
      friendNotices.refetch(),
      asked.refetch()
    ])
  )

  // Fora do celular os avisos (e o "Tudo em dia") ficam numa coluna de até
  // 560 no meio (Adaptativo 10, avisos), fora da faixa do Duo.
  const strip = useNavInsets().right
  const layout = useLayout()
  const width = layout.width - strip
  const column =
    layout.kind === 'phone' || layout.kind === 'duoClosed'
      ? 0
      : Math.min(560, width - 80)
  const pad = column ? (width - column) / 2 : 0
  const round = [
    styles.round,
    { backgroundColor: palette.card, shadowColor: palette.drop }
  ]
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: palette.bg },
        strip > 0 && { paddingRight: strip }
      ]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 },
          pad > 0 && { paddingHorizontal: pad }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            onPress={() => router.back()}
            style={round}
          >
            <Icon name="back" size={20} color={palette.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ajustes dos avisos"
            hitSlop={8}
            onPress={() =>
              router.push({
                pathname: '/configuracoes',
                params: { aba: 'avisos' }
              })
            }
            style={round}
          >
            <Icon name="gear" size={20} color={palette.ink} />
          </Pressable>
        </View>
        <Text style={[styles.title, { color: palette.ink }]}>Avisos</Text>

        <View style={calm && !today ? { display: 'none' } : undefined}>
          <Segmented
            items={[
              { key: 'all', label: 'Tudo' },
              { key: 'games', label: 'Jogos' },
              {
                key: 'friends',
                label: unreadFriends ? `Amigos · ${unreadFriends}` : 'Amigos'
              }
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>

        {today ? (
          <ScalePress
            accessibilityRole="button"
            to={0.985}
            onPress={() =>
              today.code
                ? router.push(`/codigo/${today.eventId}`)
                : router.push(`/bar/${today.barId}` as Href)
            }
          >
            <TodayCard game={today} />
          </ScalePress>
        ) : null}

        {/* O que não abriu não vira "nada por aqui" (WEB-460). */}
        {failed && loaded ? (
          <ErrorState
            style={{ gap: 14 }}
            title="Não deu para abrir todos os avisos."
            error={failed.error}
            onRetry={() => {
              for (const q of sources) if (q.isError) q.refetch()
            }}
            retrying={sources.some((q) => q.isFetching)}
          />
        ) : null}
        {!loaded ? (
          <Skeleton />
        ) : shown.length ? (
          <View style={{ gap: 10 }}>
            {shown.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                medals={list}
                unread={!read.includes(notice.id)}
                now={now}
                onOpen={() => open(notice)}
                actions={
                  notice.kind === 'call' ? (
                    <CallAnswer
                      call={notice.call}
                      code={
                        callAnswers[notice.call.id]?.code ??
                        mine.data?.find(
                          (g) => g.eventId === notice.call.eventId
                        )?.code ??
                        null
                      }
                      busy={answerCall.isPending}
                      phase={
                        answerCall.variables?.callId === notice.call.id
                          ? callPhase
                          : 'idle'
                      }
                      sent={answerCall.variables?.answer}
                      onAnswer={(answer) =>
                        answerCall.mutate({ callId: notice.call.id, answer })
                      }
                      onCode={() =>
                        router.push(`/codigo/${notice.call.eventId}`)
                      }
                    />
                  ) : notice.kind === 'friend-request' ? (
                    <RequestAnswer
                      answered={answered[notice.person.id]}
                      busy={actions.busy}
                      phase={
                        actions.respond.variables?.userId === notice.person.id
                          ? respondPhase
                          : 'idle'
                      }
                      sent={actions.respond.variables?.accept}
                      onAnswer={(accept) => respond(notice.person, accept)}
                    />
                  ) : null
                }
              />
            ))}
          </View>
        ) : failed ? null : calm && !today ? (
          <NoticesEmpty
            toggles={[
              {
                icon: 'tv',
                title: 'Jogos dos seus times',
                detail: (teams.data ?? [])
                  .slice(0, 3)
                  .map((team) => team.name)
                  .join(', '),
                on: true
              },
              { icon: 'people', title: 'Pedidos de amizade', on: true },
              { icon: 'crew', title: 'Ranking do mês fechou', on: false }
            ]}
            onToggles={() =>
              router.push({
                pathname: '/configuracoes',
                params: { aba: 'avisos' }
              })
            }
          />
        ) : (
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            {tab === 'friends'
              ? 'Nada dos amigos por aqui. Pedidos de amizade, pedidos aceitos e chamados para jogos aparecem aqui.'
              : 'Nada por aqui ainda. Os avisos chegam quando um bar valida seu código, quando sai uma conquista, quando um bar perto marca jogo dos seus times ou quando alguém te pede amizade.'}
          </Text>
        )}

        {shown.length ? (
          <Text style={[text(13), styles.foot, { color: palette.muted }]}>
            Avisos com mais de 30 dias saem daqui.
          </Text>
        ) : null}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

/** O jogo marcado para hoje (`.today`): tinta, o título em Anton, quem vai. */
function TodayCard({
  game
}: {
  game: {
    barId: string
    barName: string
    startsAt: string
    code: string | null
    participants: string[]
    participantFreeText: string | null
    championship: string
  }
}) {
  const palette = usePalette()
  const going = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: game.barId }),
    select: (bar) =>
      bar.events.find((e) => e.startsAt === game.startsAt)?.going ?? null
  })
  const who = todayGoing(going.data ?? null)
  const title = gameTitle(game).split(' × ')
  const company = who.bold ? ' com você' : ''
  return (
    <View
      style={[styles.today, palette.dark && { backgroundColor: '#26261f' }]}
    >
      <Text style={styles.todayKicker}>
        SEU JOGO DE HOJE · {formatTime(game.startsAt)}
      </Text>
      <Text style={styles.todayTitle} numberOfLines={2}>
        {title.map((side, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: os dois lados fixos
          <Text key={i}>
            {i ? <Text style={styles.todayX}> × </Text> : null}
            {side}
          </Text>
        ))}
      </Text>
      <View style={styles.who}>
        {who.faces.length ? <Stack faces={who.faces} /> : null}
        <Text
          style={[text(13.5, 'Regular', 1.3), { color: '#c9c7c0', flex: 1 }]}
          numberOfLines={2}
        >
          {who.bold}
          {who.rest}
          {company} · {game.barName}
          {game.code ? ` · ${formatCode(game.code)}` : ''}
        </Text>
      </View>
    </View>
  )
}

/** As iniciais de quem vai, em acid e papel (`.av`). */
function Stack({ faces }: { faces: string[] }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {faces.map((label, index) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: até duas iniciais
          key={index}
          style={[
            styles.face,
            {
              backgroundColor: index ? PAPER : ACID,
              marginLeft: index ? -6 : 0
            }
          ]}
        >
          <Text
            style={[text(11, 'Bold', 1.1), { color: INK }]}
            maxFontSizeMultiplier={1}
          >
            {label.charAt(0)}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** O cartão de aviso (`.nt`): o que vem na frente, o título, a linha, a ação. */
function NoticeCard({
  notice,
  medals,
  unread,
  now,
  actions,
  onOpen
}: {
  notice: Notice
  medals: Achievement[]
  unread: boolean
  now: number
  /** Os botões do chamado e do pedido, no próprio cartão. */
  actions: ReactNode
  onOpen: () => void
}) {
  const palette = usePalette()
  const look = noticeLook(notice, medals, now)
  if (!look) return null
  const ago = notice.kind === 'game' ? null : noticeAgo(notice.at, now)
  const lead =
    look.lead.kind === 'medal' ? (
      <View style={styles.medal}>
        <MedalImage id={look.lead.id} size={52} />
      </View>
    ) : look.lead.kind === 'person' ? (
      <View style={[styles.lead, { backgroundColor: ACID }]}>
        <Text style={[text(16, 'Bold', 1.1), { color: INK }]}>
          {look.lead.initial}
        </Text>
      </View>
    ) : (
      <View style={[styles.lead, { backgroundColor: palette.mark }]}>
        <Icon name={look.lead.icon} size={22} color={palette.ink} />
      </View>
    )
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      {/* O topo abre o bar, o perfil ou a conquista; os botões ficam fora,
          para o leitor de tela chegar a eles. */}
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.cardTop, pressed && { opacity: 0.7 }]}
      >
        {lead}
        <View style={{ flex: 1, minWidth: 0, paddingRight: unread ? 14 : 0 }}>
          <Text style={[text(15, 'Bold', 1.25), { color: palette.ink }]}>
            {look.title}
          </Text>
          {look.line ? (
            <Text
              style={[
                text(13.5, 'Regular', 1.4),
                { color: palette.muted, marginTop: 2 }
              ]}
            >
              {look.line}
            </Text>
          ) : null}
          {ago && !actions ? (
            <Text style={[styles.ago, { color: palette.muted }]}>{ago}</Text>
          ) : null}
        </View>
      </Pressable>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
      {unread ? (
        <View style={[styles.dot, { borderColor: palette.card }]} />
      ) : null}
    </View>
  )
}

type Look = {
  lead:
    | { kind: 'icon'; icon: Parameters<typeof Icon>[0]['name'] }
    | { kind: 'person'; initial: string }
    | { kind: 'medal'; id: MedalId }
  title: string
  line: string
}

/** O texto de cada aviso, nas frases do desenho. */
function noticeLook(
  notice: Notice,
  medals: Achievement[],
  now: number
): Look | null {
  const initial = (name: string) => name.trim().charAt(0).toUpperCase()
  switch (notice.kind) {
    case 'offer':
      return {
        lead: { kind: 'icon', icon: 'ticket' },
        title: `Oferta liberada no ${notice.barName}`,
        line: notice.offer
      }
    case 'game':
      return {
        lead: { kind: 'icon', icon: 'fan' },
        title: `${notice.title} é ${whenWord(notice.at, now)}, perto de você`,
        line: `${notice.bars} ${notice.bars === 1 ? 'bar perto vai' : 'bares perto vão'} passar o jogo.`
      }
    case 'friend-request':
      return {
        lead: { kind: 'person', initial: initial(notice.person.name) },
        title: `${notice.person.name} pediu sua amizade`,
        line: notice.person.mutual
          ? `${notice.person.mutual} ${notice.person.mutual === 1 ? 'amigo' : 'amigos'} em comum.`
          : ''
      }
    case 'friend-accepted':
      return {
        lead: { kind: 'person', initial: initial(notice.person.name) },
        title: `${notice.person.name} aceitou seu pedido`,
        line: 'Agora vocês são amigos.'
      }
    case 'call':
      return {
        lead: { kind: 'person', initial: initial(notice.call.person.name) },
        title: `${firstName(notice.call.person.name)} te chamou para o jogo`,
        line: callLine(notice.call, now)
      }
    case 'call-accepted':
      return {
        lead: { kind: 'person', initial: initial(notice.call.person.name) },
        title: `${firstName(notice.call.person.name)} vai também`,
        line: callLine(notice.call, now)
      }
    case 'alert':
      return {
        lead: { kind: 'icon', icon: 'bell' },
        title: `${notice.barName} marcou jogo`,
        line: `${notice.title}, ${whenWord(notice.startsAt, now)} às ${formatTime(notice.startsAt)}.`
      }
    case 'reminder':
      return {
        lead: { kind: 'icon', icon: 'calendar' },
        title: `Hoje: ${notice.title}`,
        line: `${notice.barName}, às ${formatTime(notice.at)}.`
      }
    case 'medal': {
      const medal = medals.find((a) => a.id === notice.medalId)
      if (!medal) return null
      return {
        lead: { kind: 'medal', id: medal.id as MedalId },
        title: `Conquista: ${medal.name}`,
        line:
          medal.group === 'resenhas'
            ? `${unit('resenhas', medal.target)}.`
            : `${unit(medal.group, medal.target)}${medal.target > 1 ? ' diferentes' : ''}.`
      }
    }
  }
}

/** "hoje", "amanhã" ou o dia da semana por extenso ("sábado"). */
function whenWord(at: string, now: number) {
  const day = brasiliaDay(at)
  if (day === brasiliaDay(now)) return 'hoje'
  if (day === brasiliaDay(now, 1)) return 'amanhã'
  return new Date(at).toLocaleDateString('pt-BR', {
    weekday: 'long',
    timeZone: 'America/Sao_Paulo'
  })
}

const OLIVE = '#7f9a12'

/** O botão pequeno do cartão: acid com a sombra oliva, ou só o contorno. */
function CardButton({
  label,
  acid,
  disabled,
  onPress
}: {
  label: string
  acid?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePress(0, 3)
  const fit = useFitLabel()
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
    >
      {acid ? <View style={[styles.button, styles.edge]} /> : null}
      <Animated.View
        style={[
          styles.button,
          acid
            ? { backgroundColor: ACID }
            : { borderWidth: 1.5, borderColor: palette.line },
          acid && press.style
        ]}
      >
        <Animated.Text
          key={label}
          entering={LABEL_IN}
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          numberOfLines={1}
          adjustsFontSizeToFit={fit}
          style={[text(14, 'Bold', 1.2), { color: acid ? INK : palette.ink }]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  )
}

/** Aceitar e Recusar do pedido (19c); respondido, a resposta no lugar. */
function RequestAnswer({
  answered,
  busy,
  phase,
  sent,
  onAnswer
}: {
  answered?: Answered
  busy: boolean
  phase: ActionPhase
  /** A resposta que está no ar: aceitar (`true`) ou recusar. */
  sent?: boolean
  onAnswer: (accept: boolean) => void
}) {
  const label = (accept: boolean, idle: string) =>
    phaseLabel(sent === accept ? phase : 'idle', { idle, sending: idle })
  const palette = usePalette()
  if (answered)
    return (
      <Animated.View entering={SWAP} style={styles.answered}>
        {answered === 'friends' ? (
          <AddButton relation="friends" onPress={() => {}} />
        ) : (
          <Text style={[text(13, 'Bold'), { color: palette.muted }]}>
            Recusado
          </Text>
        )}
      </Animated.View>
    )
  return (
    <>
      <CardButton
        acid
        disabled={busy}
        label={label(true, 'Aceitar')}
        onPress={() => onAnswer(true)}
      />
      <CardButton
        disabled={busy}
        label={label(false, 'Recusar')}
        onPress={() => onAnswer(false)}
      />
    </>
  )
}

/**
 * Os três estados de baixo do chamado; a troca entra em crossfade (`SWAP`) e
 * o "Vou também" dá o háptico de sucesso. O design diz "o Gabriel foi
 * avisado": sem saber o gênero de quem chamou, a frase vai sem artigo.
 */
function CallAnswer({
  call,
  code,
  busy,
  phase,
  sent,
  onAnswer,
  onCode
}: {
  call: CallNotice
  code: string | null
  busy: boolean
  phase: ActionPhase
  sent?: 'going' | 'not_now'
  onAnswer: (answer: 'going' | 'not_now') => void
  onCode: () => void
}) {
  const palette = usePalette()
  const first = firstName(call.person.name)
  // Só o botão tocado conta a nova tentativa; o rótulo troca no lugar.
  const label = (answer: 'going' | 'not_now', idle: string) =>
    phaseLabel(sent === answer ? phase : 'idle', { idle, sending: idle })
  if (call.status === 'going')
    return (
      <Animated.View entering={SWAP} style={{ flex: 1 }}>
        <Pressable
          accessibilityRole={code ? 'button' : undefined}
          accessibilityHint={code ? 'Abre o código do balcão' : undefined}
          disabled={!code}
          onPress={onCode}
          style={[
            styles.going,
            {
              backgroundColor: palette.dark
                ? 'rgba(201,241,53,.14)'
                : 'rgba(201,241,53,.4)'
            }
          ]}
        >
          <Icon name="check" size={15} color={palette.ink} />
          <Text
            style={[text(13, 'SemiBold', 1.3), { flex: 1, color: palette.ink }]}
          >
            Você vai · {first} recebeu o aviso
          </Text>
          {code ? (
            <Text style={[styles.callCode, { color: palette.ink }]}>
              {formatCode(code)}
            </Text>
          ) : null}
        </Pressable>
      </Animated.View>
    )
  if (call.status === 'not_now')
    return (
      <Animated.Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        entering={SWAP}
        style={[text(12.5, 'Regular', 1.4), { color: palette.muted, flex: 1 }]}
      >
        Você respondeu “agora não”. {first} não recebe aviso disso.
      </Animated.Text>
    )
  return (
    <>
      <CardButton
        acid
        disabled={busy}
        label={label('going', 'Vou também')}
        onPress={() => onAnswer('going')}
      />
      <CardButton
        disabled={busy}
        label={label('not_now', 'Agora não')}
        onPress={() => onAnswer('not_now')}
      />
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  // Anton 44: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 44,
    textTransform: 'uppercase',
    marginVertical: -10.7
  },
  today: {
    borderRadius: 22,
    backgroundColor: INK,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  todayKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    color: '#aaa9a4'
  },
  // Anton 26: margem negativa no lugar do entrelinha 1.
  todayTitle: {
    fontFamily: 'Anton',
    fontSize: 26,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -6.3
  },
  todayX: { color: ACID, fontSize: 19.5 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  face: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  card: {
    borderRadius: 20,
    padding: 14,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  cardTop: { flexDirection: 'row', gap: 12 },
  lead: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  medal: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ago: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    marginTop: 6
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginLeft: 56
  },
  dot: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: ACID
  },
  button: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 3,
    backgroundColor: OLIVE
  },
  answered: { flex: 1, alignItems: 'flex-start' },
  going: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12
  },
  callCode: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  foot: { textAlign: 'center', marginTop: 8 }
})
