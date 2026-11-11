import type { AppRouter } from '@findsports_oficial/api/routers/index'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { inferRouterOutputs } from '@trpc/server'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Photo } from '@/components/explore'
import { FanCard } from '@/components/fan-card'
import { FriendGame } from '@/components/friend-page'
import {
  AddButton,
  type Relation,
  useFriendActions
} from '@/components/friends'
import { DuelCard } from '@/components/friends-activity'
import { haptic } from '@/components/motion'
import { sportMark } from '@/components/onboarding'
import { EmptyCard, Skeleton } from '@/components/states'
import { usePalette } from '@/components/theme'
import {
  ACID,
  ErrorState,
  Icon,
  INK,
  PAPER,
  PillButton,
  Text,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { savePendingInvite } from '@/lib/invite'
import { firstName, monthLabel } from '@/lib/ranking'
import { trpc } from '@/lib/trpc'

/*
 * O convite de amizade pelo link (rodada 7, tela 4): "A Marina te chamou",
 * com a carteirinha dela inteira, quem vocês têm em comum, o que a amizade dá
 * na Onside e o jogo que ela marcou hoje (se a privacidade dela deixa). Sem
 * conta: "Criar conta e ser amigo" (conta de menos de um dia já entra como
 * amiga) ou "Entrar e aceitar", com o código guardado para depois. Com conta:
 * "Aceitar convite", e a tela vira "Vocês são amigos": os dois avatares se
 * aproximam e o check entra entre eles, o duelo do mês começando, o jogo
 * dela e quem ela conhece que você talvez conheça. Frases sem gênero.
 */

const SPRING = { duration: 300, dampingRatio: 1 }

export default function Invite() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  useStatusBar('auto')
  const { code } = useLocalSearchParams<{ code: string }>()
  const session = authClient.useSession()
  const user = session.data?.user
  const ready = user?.role === 'fan' && !!user.onboardingCompleted
  const preview = useQuery({
    ...trpc.friends.invitePreview.queryOptions({ code: code ?? '' }),
    enabled: !!code && !session.isPending
  })
  const [accepted, setAccepted] = useState(false)
  const join = useMutation(
    trpc.friends.joinByInvite.mutationOptions({
      onSuccess: ({ relation }) => {
        haptic.success()
        queryClient.invalidateQueries({ queryKey: trpc.friends.pathKey() })
        if (relation === 'friends') setAccepted(true)
      },
      onError: () => haptic.error()
    })
  )
  const person = preview.data
  const friends = accepted || person?.relation === 'friends'

  // Sem conta pronta, o código fica guardado: as abas aceitam depois.
  useEffect(() => {
    if (code && !session.isPending && !ready) savePendingInvite(code)
  }, [code, session.isPending, ready])

  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/explore')
  const first = person ? firstName(person.name) : ''

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }
        ]}
      >
        <View style={styles.top}>
          {friends ? (
            <View />
          ) : (
            <Text style={[styles.kicker, { color: palette.muted }]}>
              CONVITE DE AMIZADE
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            hitSlop={8}
            onPress={close}
            style={[
              styles.round,
              { backgroundColor: palette.card, shadowColor: palette.drop }
            ]}
          >
            <Icon name="close" size={20} color={palette.ink} />
          </Pressable>
        </View>

        {preview.isPending ? (
          <Skeleton />
        ) : preview.isError ? (
          <ErrorState
            title="Não deu para abrir o convite."
            error={preview.error}
            onRetry={() => preview.refetch()}
            retrying={preview.isFetching}
          />
        ) : !person ? (
          <EmptyCard
            title="Esse convite não vale mais"
            line="O link pode ter mudado. Peça um novo ou procure a pessoa pelo nome."
            action={
              <PillButton
                label="Buscar amigos"
                height={44}
                onPress={() =>
                  router.replace((ready ? '/amigos-busca' : '/') as Href)
                }
              />
            }
          />
        ) : friends ? (
          <Accepted
            person={person}
            animate={accepted}
            onBar={(barId) => router.push(`/bar/${barId}` as Href)}
          />
        ) : (
          <>
            <Title
              lines={[
                [`${first.toLocaleUpperCase('pt-BR')} `],
                ['', 'te chamou']
              ]}
              size={44}
            />
            <FanCard
              name={person.name}
              teams={person.teams}
              sports={person.sports.map(sportMark)}
              middle="Nível"
              radius={person.level ? String(person.level.level) : '—'}
              base={person.city}
              bare
            />
            <Mutual
              mutual={person.mutual}
              mutualCount={person.mutualCount}
              count={person.friendCount}
              first={first}
            />
            <View style={styles.perks}>
              {(
                [
                  ['people', `Ver onde ${first} vai e ir junto`],
                  ['ranking', 'Duelo e ranking do mês'],
                  ['ticket', 'Chamar para o jogo']
                ] as const
              ).map(([icon, label]) => (
                <View
                  key={icon}
                  style={[
                    styles.perk,
                    { backgroundColor: palette.card, shadowColor: palette.drop }
                  ]}
                >
                  <Icon name={icon} size={22} color={palette.ink} />
                  <Text
                    style={[
                      text(12.5, 'SemiBold', 1.3),
                      { color: palette.ink }
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
            {person.today ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push(`/bar/${person.today?.barId}` as Href)
                }
                style={[
                  styles.today,
                  { backgroundColor: palette.card, shadowColor: palette.drop }
                ]}
              >
                <Photo
                  uri={person.today.photoUrl}
                  name={person.today.barName}
                  style={styles.todayPhoto}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}
                  >
                    {first} vai hoje · {person.today.barName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      text(12.5, 'Regular', 1.3),
                      { color: palette.muted }
                    ]}
                  >
                    {person.today.title} · {formatTime(person.today.startsAt)}
                    {person.today.going ? ` · ${person.today.going} vão` : ''}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <View style={styles.cta}>
              {ready ? (
                person.relation === 'sent' || join.data?.relation === 'sent' ? (
                  <Text
                    style={[
                      text(14, 'Regular', 1.4),
                      { color: palette.muted, textAlign: 'center' }
                    ]}
                  >
                    Pedido enviado. Quando {first} aceitar, vocês viram amigos.
                  </Text>
                ) : (
                  <PillButton
                    label={join.isPending ? 'Aceitando…' : 'Aceitar convite'}
                    onPress={() => {
                      if (code && !join.isPending) join.mutate({ code })
                    }}
                  />
                )
              ) : (
                <>
                  <PillButton
                    label="Criar conta e ser amigo"
                    onPress={() => router.push('/profile' as Href)}
                  />
                  <Text
                    style={[
                      text(13, 'Regular', 1.4),
                      { color: palette.muted, textAlign: 'center' }
                    ]}
                  >
                    Já tem conta?{' '}
                    <Text
                      accessibilityRole="link"
                      onPress={() => router.push('/sign-in' as Href)}
                      suppressHighlighting
                      style={[
                        text(13, 'Bold', 1.4),
                        { color: palette.ink, textDecorationLine: 'underline' }
                      ]}
                    >
                      Entrar e aceitar
                    </Text>
                  </Text>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

type Preview = NonNullable<
  inferRouterOutputs<AppRouter>['friends']['invitePreview']
>

/** "Rafael, João e Bia já estão na rede de Marina"; sem conta, só a contagem. */
function Mutual({
  mutual,
  mutualCount,
  count,
  first
}: {
  mutual: { id: string; name: string }[]
  /** Todos os em comum; `mutual` traz só os três primeiros. */
  mutualCount: number
  count: number
  first: string
}) {
  const palette = usePalette()
  if (!mutual.length && !count) return null
  const names = mutual.map((m) => firstName(m.name))
  const more = Math.max(0, mutualCount - names.length)
  const who = more
    ? `${names.join(', ')} e mais ${more}`
    : names.length > 1
      ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
      : (names[0] ?? '')
  // Sem gênero: "na rede de", não "amigos dela".
  const line = names.length
    ? `${who} ${names.length + more > 1 ? 'já estão' : 'já está'} na rede de ${first}`
    : `${first} já tem ${count} ${count === 1 ? 'pessoa' : 'pessoas'} na rede da Onside`
  return (
    <View style={styles.mutual}>
      {names.length ? (
        <View style={{ flexDirection: 'row' }}>
          {names.map((name, i) => (
            <View
              key={mutual[i]?.id}
              style={[
                styles.face,
                {
                  marginLeft: i ? -6 : 0,
                  backgroundColor: i % 2 ? palette.mark : ACID
                }
              ]}
            >
              <Text style={[text(10, 'Bold', 1), { color: INK }]}>
                {name.charAt(0)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Icon name="people" size={18} color={palette.ink} />
      )}
      <Text
        style={[text(13, 'Regular', 1.35), { color: palette.ink, flex: 1 }]}
      >
        {line}
      </Text>
    </View>
  )
}

/** O avatar redondo com a inicial (ou as duas, para você). */
function Face({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.bigFace, { backgroundColor: bg }]}>
      <Text style={[text(24, 'Bold', 1.1), { color: fg }]}>{label}</Text>
    </View>
  )
}

/**
 * "Vocês são amigos": os dois avatares se aproximam 12 pt (mola 300 ms) e o
 * check entra entre eles (.9 → 1 e opacidade, 200 ms); reduzido, só esmaece.
 */
function Accepted({
  person,
  animate,
  onBar
}: {
  person: Preview
  animate: boolean
  onBar: (barId: string) => void
}) {
  const palette = usePalette()
  const reduced = useReducedMotion()
  const me = authClient.useSession().data?.user
  const first = firstName(person.name)
  const profile = useQuery(
    trpc.friends.profile.queryOptions({ userId: person.id })
  )
  const actions = useFriendActions()
  const [kept, setKept] = useState<Record<string, Relation>>({})
  const going = useMutation(trpc.attendance.set.mutationOptions())
  const near = useSharedValue(animate && !reduced ? 0 : 1)
  const check = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    if (!animate) return
    if (!reduced) near.set(withSpring(1, SPRING))
    check.set(withTiming(1, { duration: 200 }))
  }, [animate, reduced, near, check])
  const left = useAnimatedStyle(() => ({
    transform: [{ translateX: 12 * near.get() - 12 }]
  }))
  const right = useAnimatedStyle(() => ({
    transform: [{ translateX: 12 - 12 * near.get() }]
  }))
  const mark = useAnimatedStyle(() => ({
    opacity: check.get(),
    transform: [{ scale: reduced ? 1 : 0.9 + 0.1 * check.get() }]
  }))
  const month = profile.data?.visible ? profile.data.month : null
  const game = profile.data?.visible ? profile.data.nextGame : null
  const initials = (me?.name ?? '')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      <View style={styles.pair}>
        <Animated.View style={left}>
          <Face label={first.charAt(0)} bg={ACID} fg={INK} />
        </Animated.View>
        <Animated.View style={[styles.check, mark]}>
          <Icon name="check" size={18} color={ACID} />
        </Animated.View>
        <Animated.View style={right}>
          <Face label={initials} bg={PAPER} fg={INK} />
        </Animated.View>
      </View>
      <View style={{ alignItems: 'center' }}>
        <Title lines={[['Vocês são'], ['', 'amigos']]} size={48} />
      </View>
      <Text
        style={[
          text(14.5, 'Regular', 1.45),
          { color: palette.muted, textAlign: 'center' }
        ]}
      >
        Você vê onde {first} vai e {first} vê você, como cada um escolheu em
        Privacidade.
      </Text>
      {month ? (
        <DuelCard
          title={`Duelo de ${monthLabel(new Date().toISOString().slice(0, 7)).toLocaleLowerCase('pt-BR')}`}
          metric="Começou agora"
          me={{ name: me?.name ?? 'Você', value: month.me.bars }}
          them={{ name: person.name, value: month.them.bars }}
          note={
            month.them.bars > month.me.bars
              ? `${first} foi a ${month.them.bars} ${month.them.bars === 1 ? 'bar' : 'bares'} este mês. Bora tirar a diferença?`
              : month.me.bars > month.them.bars
                ? `Você foi a ${month.me.bars} ${month.me.bars === 1 ? 'bar' : 'bares'} este mês. ${first} tem o que correr atrás.`
                : 'Empatados. O mês está só começando.'
          }
        />
      ) : null}
      {game ? (
        <FriendGame
          name={first}
          game={game}
          onOpen={() => onBar(game.barId)}
          onGo={() => {
            haptic.success()
            going.mutate({ eventId: game.eventId, attending: true })
          }}
        />
      ) : null}
      {person.theirFriends.length ? (
        <>
          <Text style={[styles.label, { color: palette.muted }]}>
            AMIGOS DE {first.toLocaleUpperCase('pt-BR')} QUE VOCÊ TALVEZ CONHEÇA
          </Text>
          <View style={styles.knows}>
            {person.theirFriends.map((s) => (
              <View
                key={s.id}
                style={[
                  styles.know,
                  { backgroundColor: palette.card, shadowColor: palette.drop }
                ]}
              >
                <View
                  style={[styles.knowFace, { backgroundColor: palette.mark }]}
                >
                  <Text style={[text(15, 'Bold', 1.1), { color: palette.ink }]}>
                    {s.name.charAt(0)}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[text(13, 'Bold', 1.2), { color: palette.ink }]}
                >
                  {firstName(s.name)}
                </Text>
                <AddButton
                  relation={kept[s.id] ?? 'none'}
                  busy={actions.busyFor(s.id)}
                  onPress={() =>
                    actions.act(
                      s.id,
                      kept[s.id] ?? 'none',
                      'suggestion',
                      (next) => setKept((all) => ({ ...all, [s.id]: next }))
                    )
                  }
                />
              </View>
            ))}
          </View>
        </>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.96
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
  mutual: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  face: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PAPER
  },
  perks: { flexDirection: 'row', gap: 8 },
  perk: {
    flex: 1,
    borderRadius: 16,
    padding: 10,
    gap: 8,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  today: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  todayPhoto: { width: 52, height: 52, borderRadius: 12 },
  cta: { gap: 12, marginTop: 4 },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24
  },
  bigFace: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginHorizontal: -8,
    zIndex: 2,
    backgroundColor: INK,
    borderWidth: 2,
    borderColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 0.96,
    marginTop: 6
  },
  knows: { flexDirection: 'row', gap: 8 },
  know: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  knowFace: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
