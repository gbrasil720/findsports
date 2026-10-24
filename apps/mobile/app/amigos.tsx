import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { HardShadow } from '@/components/explore'
import {
  AddButton,
  Avatar,
  heroShadow,
  PersonRow,
  personLine,
  useFriendActions,
  useKept
} from '@/components/friends'
import { Glass } from '@/components/glass'
import {
  haptic,
  ScalePress,
  SWAP,
  usePress,
  usePressScale
} from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  Icon,
  INK,
  LIVE,
  PillButton,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { inviteMessage, monthName } from '@/lib/invite'
import { trpc } from '@/lib/trpc'

/**
 * Amigos (11a do design): busca, os três jeitos de adicionar, pedidos
 * recebidos, sugestões de amigos de amigos e a lista. Empilhada sem a barra
 * de abas, com voltar, como no design (lá ela abre pelo Ranking, 11e; aqui,
 * pelo menu "Você").
 */
export default function Friends() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  const me = useQuery(trpc.friends.me.queryOptions())
  const overview = useQuery(trpc.friends.overview.queryOptions())
  const actions = useFriendActions()
  const pull = usePullRefresh(() =>
    Promise.all([me.refetch(), overview.refetch()])
  )
  const data = overview.data
  // Respondido aqui fica na tela até ela abrir de novo, com o botão trocado
  // ("Amigos", "Recusado", "Pedido enviado"): tirar a linha fazia o card e o
  // resto da tela pularem.
  const [answered, setAnswered] = useState<Record<string, Answered>>({})
  const answer = (id: string, value: Answered) =>
    setAnswered((all) => ({ ...all, [id]: value }))
  const requests = useKept(data?.requests)
  const suggestions = useKept(data?.suggestions)
  const month = monthName()
  const open = (id: string) => router.push(`/amigo/${id}` as Href)

  const shareLink = () => {
    if (!me.data) return
    haptic.select()
    Share.share({ message: inviteMessage(me.data.friendCode) })
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <View style={styles.head}>
          <BackButton />
          <Title lines={[['Amigos']]} size={36} color={palette.ink} />
        </View>

        <Pressable
          accessibilityRole="search"
          onPress={() => router.push('/amigos-busca')}
        >
          <Glass
            tone={palette.dark ? 'dark' : 'light'}
            tint={palette.dark ? undefined : 'rgba(255,255,255,.62)'}
            style={styles.search}
          >
            <Icon name="search" size={18} color={palette.muted} />
            <Text style={[text(15), { color: palette.muted }]}>
              Nome ou @usuário
            </Text>
          </Glass>
        </Pressable>

        <View style={styles.actions}>
          <Action
            icon="qr"
            label="Meu código"
            hero
            onPress={() => router.push('/meu-codigo')}
          />
          <Action
            icon="people"
            label="Contatos"
            onPress={() => router.push('/contatos')}
          />
          <Action icon="link" label="Link de convite" onPress={shareLink} />
        </View>

        {overview.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 24 }} />
        ) : overview.isError || !data ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir seus amigos.
            </Text>
            <PillButton
              label="Tentar de novo"
              onPress={() => overview.refetch()}
            />
          </View>
        ) : (
          <>
            {requests.length ? (
              <>
                <Label>Pedidos · {requests.length}</Label>
                <Card shadow={palette.liveShadow}>
                  <View style={styles.inCard}>
                    {requests.map((person, index) => (
                      <PersonRow
                        key={person.id}
                        id={person.id}
                        name={person.name}
                        image={person.image}
                        sub={
                          person.via === 'link'
                            ? 'Pelo seu link'
                            : person.mutual
                              ? `${person.mutual} ${person.mutual === 1 ? 'amigo' : 'amigos'} em comum`
                              : personLine(person)
                        }
                        first={index === 0}
                        onPress={() => open(person.id)}
                        right={
                          answered[person.id] ? (
                            <Animated.View entering={SWAP}>
                              {answered[person.id] === 'declined' ? (
                                <Text
                                  style={[
                                    text(13, 'Bold'),
                                    { color: palette.muted }
                                  ]}
                                >
                                  Recusado
                                </Text>
                              ) : (
                                <AddButton
                                  relation="friends"
                                  onPress={() => {}}
                                />
                              )}
                            </Animated.View>
                          ) : (
                            <View style={styles.answer}>
                              <Answer
                                label={`Recusar ${person.name}`}
                                disabled={actions.busy}
                                onPress={() =>
                                  actions.respond.mutate(
                                    { userId: person.id, accept: false },
                                    {
                                      onSuccess: () =>
                                        answer(person.id, 'declined')
                                    }
                                  )
                                }
                              />
                              <Answer
                                accept
                                label={`Aceitar ${person.name}`}
                                disabled={actions.busy}
                                onPress={() =>
                                  actions.respond.mutate(
                                    { userId: person.id, accept: true },
                                    {
                                      onSuccess: () =>
                                        answer(person.id, 'friends')
                                    }
                                  )
                                }
                              />
                            </View>
                          )
                        }
                      />
                    ))}
                  </View>
                </Card>
              </>
            ) : null}

            {suggestions.length ? (
              <>
                <Label>Talvez você conheça</Label>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bleed}
                  contentContainerStyle={styles.suggestions}
                >
                  {suggestions.map((person) => (
                    <Suggestion
                      key={person.id}
                      person={person}
                      sent={answered[person.id] === 'sent'}
                      busy={actions.busy}
                      onOpen={() => open(person.id)}
                      onAdd={() =>
                        actions.request.mutate(
                          { userId: person.id, via: 'suggestion' },
                          { onSuccess: () => answer(person.id, 'sent') }
                        )
                      }
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Label>
              Seus amigos
              {data.friends.length ? ` · ${data.friends.length}` : ''}
            </Label>
            {data.friends.length ? (
              <Card>
                <View style={styles.inCard}>
                  {data.friends.map((friend, index) => (
                    <PersonRow
                      key={friend.id}
                      id={friend.id}
                      name={friend.name}
                      image={friend.image}
                      size={38}
                      sub={[
                        friend.barsThisMonth === null
                          ? null
                          : `${friend.barsThisMonth} ${friend.barsThisMonth === 1 ? 'bar' : 'bares'} em ${month}`,
                        friend.city
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      first={index === 0}
                      onPress={() => open(friend.id)}
                      right={
                        <Icon name="next" size={12} color={palette.muted} />
                      }
                    />
                  ))}
                </View>
              </Card>
            ) : (
              <Text
                style={[text(14, 'Regular', 1.45), { color: palette.muted }]}
              >
                Ninguém ainda. Mande seu link ou mostre seu código: quem entrar
                pelo link já vira seu amigo.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

/** "Pedidos · 2", "Talvez você conheça": o rótulo cinza de cada bloco. */
function Label({ children }: { children: React.ReactNode }) {
  const palette = usePalette()
  return (
    <Text
      style={[text(13, 'SemiBold'), styles.label, { color: palette.muted }]}
    >
      {children}
    </Text>
  )
}

/** Meu código, Contatos, Link de convite. */
function Action({
  icon,
  label,
  hero,
  onPress
}: {
  icon: 'qr' | 'people' | 'link'
  label: string
  hero?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <ScalePress
      accessibilityRole="button"
      onPress={onPress}
      containerStyle={{ flex: 1 }}
      style={{ flex: 1 }}
    >
      <Card shadow={hero ? heroShadow(palette) : undefined} style={{ flex: 1 }}>
        <View style={styles.action}>
          <Icon
            name={icon}
            size={26}
            color={palette.ink}
            accent={palette.accent}
          />
          <Text style={[text(13.5, 'Bold', 1.2), { color: palette.ink }]}>
            {label}
          </Text>
        </View>
      </Card>
    </ScalePress>
  )
}

/** Recusar (x) e aceitar (✓) de um pedido. */
function Answer({
  accept,
  label,
  disabled,
  onPress
}: {
  accept?: boolean
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  // Aceitar tem sombra dura: afunda sobre ela. Recusar, sem sombra, encolhe.
  const palette = usePalette()
  const sink = usePress(3, 3)
  const shrink = usePressScale(0.94)
  const press = accept ? sink : shrink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      {accept ? (
        <HardShadow color={palette.dark ? '#000' : INK} offset={3} />
      ) : null}
      <Animated.View
        style={[
          styles.answerButton,
          accept
            ? { backgroundColor: ACID }
            : {
                borderWidth: 1,
                borderColor: palette.dark
                  ? 'rgba(241,238,230,.22)'
                  : palette.line
              },
          press.style
        ]}
      >
        <Icon
          name={accept ? 'check' : 'close'}
          size={16}
          color={accept ? INK : palette.ink}
          accent={accept ? INK : LIVE}
        />
      </Animated.View>
    </Pressable>
  )
}

/** Um card de "Talvez você conheça". */
function Suggestion({
  person,
  sent,
  busy,
  onOpen,
  onAdd
}: {
  person: { id: string; name: string; image: string | null; mutual: number }
  sent: boolean
  busy: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  const palette = usePalette()
  return (
    <ScalePress accessibilityRole="button" to={0.985} onPress={onOpen}>
      <Card>
        <View style={styles.suggestion}>
          <Avatar
            id={person.id}
            name={person.name}
            image={person.image}
            size={46}
          />
          <View>
            <Text
              style={[text(14, 'Bold', 1.25), { color: palette.ink }]}
              numberOfLines={1}
            >
              {person.name}
            </Text>
            <Text
              style={[
                text(11.5, 'Regular', 1.3),
                styles.why,
                { color: palette.muted }
              ]}
              numberOfLines={2}
            >
              {person.mutual} {person.mutual === 1 ? 'amigo' : 'amigos'} em
              comum
            </Text>
          </View>
          <Animated.View key={String(sent)} entering={SWAP}>
            <AddButton
              relation={sent ? 'sent' : 'none'}
              busy={busy || sent}
              onPress={onAdd}
            />
          </Animated.View>
        </View>
      </Card>
    </ScalePress>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 13 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16
  },
  actions: { flexDirection: 'row', gap: 8 },
  action: { padding: 12, gap: 10 },
  label: { marginBottom: -6, marginLeft: 2 },
  inCard: { paddingHorizontal: 14 },
  answer: { flexDirection: 'row', gap: 8 },
  answerButton: {
    width: 38,
    height: 38,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bleed: { marginHorizontal: -16, flexGrow: 0 },
  suggestions: { gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  // 142 de conteúdo mais o padding, como o `width:142px;padding:12px` do design.
  suggestion: { width: 166, padding: 12, gap: 8, alignItems: 'flex-start' },
  why: { minHeight: 30 },
  empty: { alignItems: 'center', gap: 14, paddingVertical: 32 }
})

type Answered = 'friends' | 'declined' | 'sent'
