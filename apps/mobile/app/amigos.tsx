import { useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { type Palette, usePalette } from '@/components/explore'
import {
  AddButton,
  Avatar,
  heroShadow,
  PersonRow,
  personLine,
  useFriendActions
} from '@/components/friends'
import { Glass } from '@/components/glass'
import { haptic, ScalePress } from '@/components/motion'
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
            palette={palette}
            icon="qr"
            label="Meu código"
            hero
            onPress={() => router.push('/meu-codigo')}
          />
          <Action
            palette={palette}
            icon="people"
            label="Contatos"
            onPress={() => router.push('/contatos')}
          />
          <Action
            palette={palette}
            icon="link"
            label="Link de convite"
            onPress={shareLink}
          />
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
            {data.requests.length ? (
              <>
                <Label palette={palette}>
                  Pedidos · {data.requests.length}
                </Label>
                <Card palette={palette} shadow={palette.liveShadow}>
                  <View style={styles.inCard}>
                    {data.requests.map((person, index) => (
                      <PersonRow
                        key={person.id}
                        id={person.id}
                        name={person.name}
                        sub={
                          person.via === 'link'
                            ? 'Pelo seu link'
                            : person.mutual
                              ? `${person.mutual} ${person.mutual === 1 ? 'amigo' : 'amigos'} em comum`
                              : personLine(person)
                        }
                        palette={palette}
                        first={index === 0}
                        onPress={() => open(person.id)}
                        right={
                          <View style={styles.answer}>
                            <Answer
                              palette={palette}
                              label={`Recusar ${person.name}`}
                              disabled={actions.busy}
                              onPress={() =>
                                actions.respond.mutate({
                                  userId: person.id,
                                  accept: false
                                })
                              }
                            />
                            <Answer
                              palette={palette}
                              accept
                              label={`Aceitar ${person.name}`}
                              disabled={actions.busy}
                              onPress={() =>
                                actions.respond.mutate({
                                  userId: person.id,
                                  accept: true
                                })
                              }
                            />
                          </View>
                        }
                      />
                    ))}
                  </View>
                </Card>
              </>
            ) : null}

            {data.suggestions.length ? (
              <>
                <Label palette={palette}>Talvez você conheça</Label>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.bleed}
                  contentContainerStyle={styles.suggestions}
                >
                  {data.suggestions.map((person) => (
                    <Suggestion
                      key={person.id}
                      palette={palette}
                      person={person}
                      busy={actions.busy}
                      onOpen={() => open(person.id)}
                      onAdd={() =>
                        actions.request.mutate({
                          userId: person.id,
                          via: 'suggestion'
                        })
                      }
                    />
                  ))}
                </ScrollView>
              </>
            ) : null}

            <Label palette={palette}>
              Seus amigos
              {data.friends.length ? ` · ${data.friends.length}` : ''}
            </Label>
            {data.friends.length ? (
              <Card palette={palette}>
                <View style={styles.inCard}>
                  {data.friends.map((friend, index) => (
                    <PersonRow
                      key={friend.id}
                      id={friend.id}
                      name={friend.name}
                      size={38}
                      sub={[
                        friend.barsThisMonth === null
                          ? null
                          : `${friend.barsThisMonth} ${friend.barsThisMonth === 1 ? 'bar' : 'bares'} em ${month}`,
                        friend.city
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      palette={palette}
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
function Label({
  palette,
  children
}: {
  palette: Palette
  children: React.ReactNode
}) {
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
  palette,
  icon,
  label,
  hero,
  onPress
}: {
  palette: Palette
  icon: 'qr' | 'people' | 'link'
  label: string
  hero?: boolean
  onPress: () => void
}) {
  return (
    <ScalePress
      accessibilityRole="button"
      onPress={onPress}
      containerStyle={{ flex: 1 }}
      style={{ flex: 1 }}
    >
      <Card
        palette={palette}
        shadow={hero ? heroShadow(palette) : undefined}
        style={{ flex: 1 }}
      >
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
  palette,
  accept,
  label,
  disabled,
  onPress
}: {
  palette: Palette
  accept?: boolean
  label: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.answerButton,
        accept
          ? {
              backgroundColor: ACID,
              shadowColor: palette.dark ? '#000' : INK,
              shadowOffset: { width: 3, height: 3 },
              shadowOpacity: 1,
              shadowRadius: 0
            }
          : {
              borderWidth: 1,
              borderColor: palette.dark ? 'rgba(241,238,230,.22)' : palette.line
            },
        pressed && { transform: [{ scale: 0.94 }] }
      ]}
    >
      <Icon
        name={accept ? 'check' : 'close'}
        size={16}
        color={accept ? INK : palette.ink}
        accent={accept ? INK : LIVE}
      />
    </Pressable>
  )
}

/** Um card de "Talvez você conheça". */
function Suggestion({
  palette,
  person,
  busy,
  onOpen,
  onAdd
}: {
  palette: Palette
  person: { id: string; name: string; mutual: number }
  busy: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onOpen}>
      <Card palette={palette}>
        <View style={styles.suggestion}>
          <Avatar
            id={person.id}
            name={person.name}
            size={46}
            palette={palette}
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
          <AddButton
            relation="none"
            palette={palette}
            busy={busy}
            onPress={onAdd}
          />
        </View>
      </Card>
    </Pressable>
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
