import { gameTitle } from '@findsports_oficial/db/game-title'
import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActionSheetIOS,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dayLabel } from '@/components/explore'
import { useFriendActions, type Via } from '@/components/friends'
import { DuelCard } from '@/components/friends-activity'
import { GroupLabel } from '@/components/game-line'
import { Glass } from '@/components/glass'
import { MedalImage } from '@/components/medal'
import { ScalePress } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { Skeleton } from '@/components/states'
import { INK_ON_DARK, usePalette } from '@/components/theme'
import {
  ACID,
  ErrorState,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  text
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { monthName } from '@/lib/invite'
import type { MedalId } from '@/lib/medals'
import { crownLabel } from '@/lib/ranking'
import { trpc } from '@/lib/trpc'

const VIAS: Via[] = ['search', 'code', 'link', 'contacts', 'suggestion']

/**
 * Perfil de amigo (11d do design): quem é, o mês de vocês dois lado a lado,
 * o jogo que a pessoa marcou e os bares em comum. O que aparece segue a
 * privacidade dela (11i); quem não é amigo vê só o nome e o botão.
 *
 * Em tela própria (`app/amigo/[id].tsx`) ou ao lado do ranking no tablet
 * deitado e no dobrável aberto (A05), onde a lista fica numa metade e a
 * página tocada na outra (`pane`: sem voltar, com o respiro do espaço).
 */
export function FriendPage({
  id,
  via: viaParam,
  pane
}: {
  id: string
  via?: string
  pane?: { top: number; bottom: number }
}) {
  const router = useRouter()
  const safe = useSafeAreaInsets()
  const insets = pane ?? safe
  const palette = usePalette()
  const soon = useSoon()
  const via = VIAS.find((v) => v === viaParam) ?? 'search'
  const profile = useQuery(trpc.friends.profile.queryOptions({ userId: id }))
  const session = authClient.useSession()
  const actions = useFriendActions()
  const person = profile.data
  const firstName = person?.name.split(' ')[0] ?? ''
  const [_allBars, _setAllBars] = useState(false)

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
          {pane ? (
            <View />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              hitSlop={8}
              onPress={() => router.back()}
              style={[
                styles.round,
                { backgroundColor: palette.card, shadowColor: palette.drop }
              ]}
            >
              <Icon name="back" size={20} color={palette.ink} />
            </Pressable>
          )}
          {person &&
          person.relation !== 'none' &&
          person.relation !== 'self' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mais opções"
              hitSlop={8}
              onPress={more}
              style={[
                styles.round,
                { backgroundColor: palette.card, shadowColor: palette.drop }
              ]}
            >
              <Text
                style={[
                  text(15, 'Bold'),
                  { color: palette.ink, letterSpacing: 1 }
                ]}
              >
                ···
              </Text>
            </Pressable>
          ) : null}
        </View>

        {profile.isPending ? (
          <Skeleton />
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
            {/* O cartão de tinta (`.ah`): rosto, nome, @, desde quando e o
                nível; embaixo, a história de vocês. Frases sem gênero. */}
            <View style={[styles.hero, palette.dark && INK_ON_DARK]}>
              <View style={styles.heroTop}>
                <View style={styles.heroFace}>
                  <Text style={[text(27, 'Bold', 1.1), { color: INK }]}>
                    {firstName.charAt(0).toUpperCase()}
                  </Text>
                  {person.image ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      source={{ uri: person.image }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text
                    style={styles.heroName}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                  >
                    {firstName}
                  </Text>
                  <Text style={styles.heroLine}>
                    {[
                      person.username ? `@${person.username}` : null,
                      person.friendsSince
                        ? `amizade desde ${sinceLabel(person.friendsSince)}`
                        : person.mutual
                          ? `${person.mutual} ${person.mutual === 1 ? 'amigo' : 'amigos'} em comum`
                          : person.city
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {person.level ? (
                    <View style={styles.heroLevel}>
                      <View style={styles.heroLevelNumber}>
                        <Text style={[styles.levelText, { color: ACID }]}>
                          {person.level.level}
                        </Text>
                      </View>
                      <Text style={[styles.levelText, { color: INK }]}>
                        {person.level.name}
                      </Text>
                    </View>
                  ) : null}
                  {person.crowns[0] ? (
                    <View style={styles.heroCrown}>
                      <Icon name="medal" size={13} color={ACID} accent={ACID} />
                      <Text style={[styles.levelText, { color: ACID }]}>
                        {crownLabel(person.crowns[0].month)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {person.visible && person.together ? (
                <View style={styles.story}>
                  <Story
                    value={String(person.together.games)}
                    label={
                      person.together.games === 1
                        ? 'jogo com você'
                        : 'jogos com você'
                    }
                    flex={0.8}
                  />
                  <Story
                    value={String(person.barsInCommon.length)}
                    label="bares em comum"
                    flex={0.9}
                  />
                  {person.together.place ? (
                    <Story
                      value={person.together.place}
                      label="o lugar de vocês"
                      flex={1.3}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>

            {person.relation !== 'self' && person.relation !== 'friends' ? (
              <RelationButton
                relation={person.relation}
                busy={actions.busy}
                onPress={() => actions.act(person.id, person.relation, via)}
              />
            ) : null}

            {person.visible && person.month ? (
              <DuelCard
                title={`Vocês em ${monthName()}`}
                metric="bares"
                me={{
                  name: session.data?.user.name ?? 'Você',
                  value: person.month.me.bars
                }}
                them={{ name: person.name, value: person.month.them.bars }}
              />
            ) : null}

            {person.visible && person.nextGame ? (
              <FriendGame
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

            {person.visible && person.medals.length ? (
              <>
                <GroupLabel>{`Medalhas · ${person.medals.length} de ${person.medalTotal}`}</GroupLabel>
                <View style={styles.medals}>
                  {person.medals.slice(0, 5).map((id) => (
                    <View key={id} style={styles.medal}>
                      <MedalImage id={id as MedalId} size={56} />
                    </View>
                  ))}
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

/** Um número da história de vocês (`.tog`). */
function Story({
  value,
  label,
  flex
}: {
  value: string
  label: string
  flex: number
}) {
  return (
    <View style={[styles.storyBox, { flex }]}>
      <Text style={styles.storyValue} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.storyLabel}>{label}</Text>
    </View>
  )
}

/** "Marina vai · hoje 21:30", o jogo e "Vou também" (`.mini3`). */
export function FriendGame({
  name,
  game,
  onOpen,
  onGo
}: {
  name: string
  game: {
    barName: string
    startsAt: string
    championship: string
    participants: string[]
    participantFreeText: string | null
  }
  onOpen: () => void
  onGo: () => void
}) {
  const palette = usePalette()
  const now = Date.now()
  const two = gameTitle(game).split(' × ')
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={[styles.game, palette.dark && INK_ON_DARK]}
    >
      <View style={styles.gameHead}>
        <Text style={styles.gameKicker} numberOfLines={1}>
          {name.toLocaleUpperCase('pt-BR')} VAI ·{' '}
          {dayLabel(game.startsAt, now).toLocaleUpperCase('pt-BR')}{' '}
          {formatTime(game.startsAt)}
        </Text>
        <Text style={styles.gameKicker} numberOfLines={1}>
          {game.barName.toLocaleUpperCase('pt-BR')}
        </Text>
      </View>
      <Text style={styles.gameTitle} numberOfLines={2}>
        {two.map((side, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: os dois lados fixos
          <Text key={i}>
            {i ? <Text style={styles.gameX}> × </Text> : null}
            {side}
          </Text>
        ))}
      </Text>
      <PillButton label="Vou também" height={44} onPress={onGo} />
    </Pressable>
  )
}

const _capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1)

/** "set", "out 2025": o mês da amizade, sem ponto (como no desenho). */
function sinceLabel(iso: string) {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date
    .toLocaleDateString('pt-BR', {
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
      timeZone: 'America/Sao_Paulo'
    })
    .replace('.', '')
    .replace(' de ', ' ')
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

const styles = StyleSheet.create({
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
  hero: {
    borderRadius: 24,
    backgroundColor: INK,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroFace: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  // Anton 40: margem negativa no lugar do entrelinha curto.
  heroName: {
    fontFamily: 'Anton',
    fontSize: 40,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -9.7
  },
  heroLine: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    color: '#aaa9a4'
  },
  heroCrown: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ACID
  },
  heroLevel: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 24,
    paddingLeft: 3,
    paddingRight: 9,
    borderRadius: 12,
    backgroundColor: ACID,
    marginTop: 2
  },
  heroLevelNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  levelText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  story: { flexDirection: 'row', gap: 8 },
  storyBox: {
    borderRadius: 14,
    backgroundColor: 'rgba(241,238,230,.07)',
    padding: 10
  },
  storyValue: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -4.5
  },
  storyLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    color: '#aaa9a4',
    marginTop: 6
  },
  game: {
    borderRadius: 24,
    backgroundColor: INK,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  gameHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  gameKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.88,
    color: '#aaa9a4'
  },
  // Anton 30/.95: margem negativa no lugar do entrelinha curto.
  gameTitle: {
    fontFamily: 'Anton',
    fontSize: 30,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -7.3
  },
  gameX: { color: ACID, fontSize: 22.5 },
  medals: { flexDirection: 'row', gap: 6 },
  medal: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 4 }
  },
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
