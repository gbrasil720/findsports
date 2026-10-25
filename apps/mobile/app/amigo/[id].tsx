import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActionSheetIOS,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { dayLabel, Photo } from '@/components/explore'
import {
  Avatar,
  heroShadow,
  useFriendActions,
  type Via
} from '@/components/friends'
import { Glass } from '@/components/glass'
import { haptic, ScalePress } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  ErrorState,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { formatTime, isLive } from '@/lib/explore'
import { monthName } from '@/lib/invite'
import { trpc } from '@/lib/trpc'

const VIAS: Via[] = ['search', 'code', 'link', 'contacts', 'suggestion']

/**
 * Perfil de amigo (11d do design): quem é, o mês de vocês dois lado a lado,
 * o jogo que a pessoa marcou e os bares em comum. O que aparece segue a
 * privacidade dela (11i); quem não é amigo vê só o nome e o botão.
 */
export default function FriendProfile() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
  useStatusBar('auto')
  const params = useLocalSearchParams<{ id: string; via?: string }>()
  const via = VIAS.find((v) => v === params.via) ?? 'search'
  const profile = useQuery(
    trpc.friends.profile.queryOptions({ userId: params.id })
  )
  const actions = useFriendActions()
  const person = profile.data
  const firstName = person?.name.split(' ')[0] ?? ''
  const [allBars, setAllBars] = useState(false)

  const more = () => {
    if (!person) return
    const label =
      person.relation === 'friends'
        ? 'Desfazer amizade'
        : person.relation === 'sent'
          ? 'Cancelar pedido'
          : person.relation === 'received'
            ? 'Recusar pedido'
            : null
    if (!label) return
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [label, 'Cancelar'],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1
      },
      (index) => {
        if (index !== 0) return
        if (person.relation === 'received')
          actions.respond.mutate({ userId: person.id, accept: false })
        else actions.remove.mutate({ userId: person.id })
      }
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.bar}>
          <BackButton />
          {person &&
          person.relation !== 'none' &&
          person.relation !== 'self' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mais opções"
              hitSlop={8}
              onPress={more}
            >
              <GlassRound>
                <Text
                  style={[
                    text(15, 'Bold'),
                    { color: palette.ink, letterSpacing: 1 }
                  ]}
                >
                  ···
                </Text>
              </GlassRound>
            </Pressable>
          ) : null}
        </View>

        {profile.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : profile.isError || !person ? (
          <ErrorState
            style={styles.empty}
            title="Não deu para abrir esse perfil."
            error={profile.error}
            onRetry={profile.refetch}
            retrying={profile.isFetching}
          />
        ) : (
          <>
            <View style={styles.who}>
              <Avatar
                id={person.id}
                name={person.name}
                image={person.image}
                size={80}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[styles.name, { color: palette.ink }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {person.name}
                </Text>
                <Text style={[text(13), { color: palette.muted }]}>
                  {[person.username ? `@${person.username}` : null, person.city]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <View style={styles.badges}>
                  {person.level ? (
                    <View style={[styles.badge, { backgroundColor: ACID }]}>
                      <Icon name="medal" size={11} color={INK} accent={INK} />
                      <Text style={[text(11, 'Bold', 1.2), { color: INK }]}>
                        Nível {person.level.level}
                      </Text>
                    </View>
                  ) : null}
                  {person.friendsSince ? (
                    <View
                      style={[styles.badge, { backgroundColor: palette.mark }]}
                    >
                      <Text
                        style={[text(11, 'Bold', 1.2), { color: palette.ink }]}
                      >
                        Amigos desde {sinceLabel(person.friendsSince)}
                      </Text>
                    </View>
                  ) : person.mutual ? (
                    <View
                      style={[styles.badge, { backgroundColor: palette.mark }]}
                    >
                      <Text
                        style={[text(11, 'Bold', 1.2), { color: palette.ink }]}
                      >
                        {person.mutual}{' '}
                        {person.mutual === 1 ? 'amigo' : 'amigos'} em comum
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {person.relation !== 'self' ? (
              <View style={styles.buttons}>
                <RelationButton
                  relation={person.relation}
                  busy={actions.busy}
                  onPress={() =>
                    person.relation === 'friends'
                      ? more()
                      : actions.act(person.id, person.relation, via)
                  }
                />
                <ScalePress
                  accessibilityRole="button"
                  containerStyle={{ flex: 1 }}
                  style={[
                    styles.invite,
                    { backgroundColor: palette.dark ? palette.card : INK }
                  ]}
                  onPress={() => soon.show('As comunidades chegam em breve')}
                >
                  <Icon name="crew" size={17} color={PAPER} accent={ACID} />
                  <Text style={[text(14, 'Bold'), { color: PAPER }]}>
                    Convidar
                  </Text>
                </ScalePress>
              </View>
            ) : null}

            {person.visible && person.month ? (
              <View
                style={[
                  styles.compare,
                  {
                    backgroundColor: palette.dark ? palette.card : INK,
                    shadowColor: heroShadow(palette)
                  }
                ]}
              >
                <View style={styles.compareHead}>
                  <Text style={[text(13, 'Bold'), { color: PAPER }]}>Você</Text>
                  <Text style={[text(13), { color: '#aaa9a4' }]}>
                    {capitalize(monthName())}
                  </Text>
                  <Text style={[text(13, 'Bold'), { color: PAPER }]}>
                    {firstName}
                  </Text>
                </View>
                {(
                  [
                    ['Bares', 'bars'],
                    ['Jogos', 'games'],
                    ['Bairros', 'neighborhoods'],
                    ['Conquistas', 'achievements']
                  ] as const
                ).map(([label, key]) => (
                  <Compare
                    key={key}
                    label={label}
                    mine={person.month.me[key]}
                    theirs={person.month.them[key]}
                  />
                ))}
              </View>
            ) : null}

            {person.visible && person.nextGame ? (
              <NextGame
                name={firstName}
                game={person.nextGame}
                onOpen={() =>
                  router.push(`/bar/${person.nextGame?.barId}` as Href)
                }
                onGo={() =>
                  router.push({
                    pathname: '/vou/[barId]',
                    params: {
                      barId: person.nextGame?.barId ?? '',
                      eventId: person.nextGame?.eventId ?? ''
                    }
                  })
                }
              />
            ) : null}

            {person.visible && person.barsInCommon.length ? (
              <>
                <View style={styles.commonHead}>
                  <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                    Bares em comum · {person.barsInCommon.length}
                  </Text>
                  {person.barsInCommon.length > 3 ? (
                    <Text
                      accessibilityRole="button"
                      suppressHighlighting
                      onPress={() => setAllBars(!allBars)}
                      style={[text(12.5), { color: palette.muted }]}
                    >
                      {allBars ? 'Ver menos' : 'Ver todos'}
                    </Text>
                  ) : null}
                </View>
                {/* Três por linha, dividindo a largura, como no design. */}
                <View style={styles.common}>
                  {[
                    ...(allBars
                      ? person.barsInCommon
                      : person.barsInCommon.slice(0, 3)),
                    // Completa a última linha para os quadros não esticarem.
                    ...Array(
                      (3 -
                        ((allBars
                          ? person.barsInCommon.length
                          : Math.min(3, person.barsInCommon.length)) %
                          3)) %
                        3
                    ).fill(null)
                  ].map((bar, index) =>
                    bar === null ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: espaço vazio da linha
                      <View key={`gap-${index}`} style={styles.commonBar} />
                    ) : (
                      <Pressable
                        key={bar.id}
                        accessibilityRole="button"
                        style={styles.commonBar}
                        onPress={() => router.push(`/bar/${bar.id}` as Href)}
                      >
                        <Photo
                          uri={bar.photoUrl}
                          name={bar.name}
                          style={styles.commonPhoto}
                        />
                        <Text
                          style={[
                            text(12.5, 'SemiBold'),
                            { color: palette.ink }
                          ]}
                          numberOfLines={1}
                        >
                          {bar.name}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </>
            ) : null}

            {!person.visible && person.relation !== 'self' ? (
              <Text
                style={[text(14, 'Regular', 1.45), { color: palette.muted }]}
              >
                {person.relation === 'friends'
                  ? `${firstName} não mostra a ninguém os bares e os jogos.`
                  : `${firstName} mostra os bares e os jogos só para amigos.`}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

const capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1)

/** "set.", "out. de 2025": o mês da amizade. */
function sinceLabel(iso: string) {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('pt-BR', {
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'America/Sao_Paulo'
  })
}

/** O botão da relação no perfil, em pílula: Amigos, Adicionar, Pedido enviado, Aceitar. */
function RelationButton({
  relation,
  busy,
  onPress
}: {
  relation: 'friends' | 'sent' | 'received' | 'none'
  busy: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  if (relation === 'friends' || relation === 'sent')
    return (
      <ScalePress
        accessibilityRole="button"
        accessibilityHint={relation === 'sent' ? 'Cancela o pedido' : undefined}
        disabled={busy}
        onPress={onPress}
        containerStyle={{ flex: 1 }}
      >
        <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.pill}>
          {relation === 'friends' ? (
            <Icon name="check" size={15} color={palette.ink} accent={LIVE} />
          ) : null}
          <Text style={[text(14, 'Bold'), { color: palette.ink }]}>
            {relation === 'friends' ? 'Amigos' : 'Pedido enviado'}
          </Text>
        </Glass>
      </ScalePress>
    )
  return (
    <ScalePress
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      containerStyle={{ flex: 1 }}
      style={[styles.pill, styles.add, busy && { opacity: 0.6 }]}
    >
      <Icon name="userplus" size={15} color={INK} accent={INK} />
      <Text style={[text(14, 'Bold'), { color: INK }]}>
        {relation === 'received' ? 'Aceitar pedido' : 'Adicionar'}
      </Text>
    </ScalePress>
  )
}

/** Uma linha da comparação: o número de cada um e a barra que cresce do meio. */
function Compare({
  label,
  mine,
  theirs
}: {
  label: string
  mine: number
  theirs: number
}) {
  const max = Math.max(mine, theirs, 1)
  const meLead = mine >= theirs && mine > 0
  const themLead = theirs > mine
  return (
    <View style={styles.compareRow}>
      <Text
        style={[
          styles.compareNumber,
          { textAlign: 'right', color: meLead ? ACID : PAPER }
        ]}
      >
        {mine}
      </Text>
      <View style={[styles.track, { alignItems: 'flex-end' }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${(mine / max) * 100}%`,
              backgroundColor: meLead ? ACID : 'rgba(241,238,230,.5)'
            }
          ]}
        />
      </View>
      <Text style={[text(12.5), styles.compareLabel]}>{label}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${(theirs / max) * 100}%`,
              backgroundColor: themLead ? ACID : 'rgba(241,238,230,.5)'
            }
          ]}
        />
      </View>
      <Text style={[styles.compareNumber, { color: themLead ? ACID : PAPER }]}>
        {theirs}
      </Text>
    </View>
  )
}

/** "Marina vai ao Bar do Zé", com o "Vou também". */
function NextGame({
  name,
  game,
  onOpen,
  onGo
}: {
  name: string
  game: {
    barName: string
    photoUrl: string | null
    championship: string
    participants: string[]
    participantFreeText: string | null
    startsAt: string
    endsAt: string
  }
  onOpen: () => void
  onGo: () => void
}) {
  const palette = usePalette()
  const now = Date.now()
  const live = isLive(game, now)
  const when = live
    ? 'Ao vivo'
    : `${dayLabel(game.startsAt, now).split(',')[0]} · ${formatTime(game.startsAt)}`
  return (
    <ScalePress accessibilityRole="button" to={0.985} onPress={onOpen}>
      <Card shadow={palette.liveShadow}>
        <View style={styles.next}>
          <Photo
            uri={game.photoUrl}
            name={game.barName}
            style={styles.nextPhoto}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.liveTag}>
              <View style={styles.liveHalo}>
                <View style={styles.liveDot} />
              </View>
              <Text style={[text(12.5, 'Bold', 1.2), { color: palette.live }]}>
                {when}
              </Text>
            </View>
            <Text
              style={[
                text(14.5, 'Bold', 1.25),
                { color: palette.ink, marginTop: 2 }
              ]}
              numberOfLines={2}
            >
              {name} vai ao {game.barName}
            </Text>
            <Text
              style={[text(12), { color: palette.muted }]}
              numberOfLines={1}
            >
              {gameTitle(game)}
            </Text>
          </View>
          <ScalePress
            accessibilityRole="button"
            to={0.96}
            onPress={() => {
              haptic.select()
              onGo()
            }}
            style={[styles.go, { shadowColor: palette.dark ? '#000' : INK }]}
          >
            <Text style={[text(13, 'Bold'), { color: INK }]}>Vou também</Text>
          </ScalePress>
        </View>
      </Card>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  bar: { flexDirection: 'row', justifyContent: 'space-between' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -6 },
  name: {
    fontFamily: 'Archivo-Bold',
    fontSize: 23,
    letterSpacing: -0.35
  },
  badges: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4
  },
  buttons: { flexDirection: 'row', gap: 8 },
  pill: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  add: { backgroundColor: ACID },
  invite: {
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  compare: {
    padding: 14,
    borderRadius: 8,
    gap: 11,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0
  },
  compareHead: { flexDirection: 'row', justifyContent: 'space-between' },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Sem `lineHeight` (o iOS corta o topo do Anton): a margem negativa leva a
  // linha natural (1,505em) aos 20 do design.
  compareNumber: {
    width: 28,
    fontFamily: 'Anton',
    fontSize: 20,
    marginVertical: -5
  },
  compareLabel: { width: 74, textAlign: 'center', color: '#aaa9a4' },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2c2c27',
    overflow: 'hidden'
  },
  fill: { height: '100%', borderRadius: 3 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  nextPhoto: { width: 48, height: 48, borderRadius: 6 },
  liveTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveHalo: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(232,50,12,.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE },
  go: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: ACID,
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0
  },
  common: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  commonHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: -4
  },
  commonBar: { flexBasis: '30%', flexGrow: 1, minWidth: 0, gap: 6 },
  commonPhoto: { width: '100%', height: 72, borderRadius: 6 },
  empty: { alignItems: 'center', gap: 14, paddingVertical: 32 }
})
