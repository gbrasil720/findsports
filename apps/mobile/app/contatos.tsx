import { useMutation, useQuery } from '@tanstack/react-query'
import * as Contacts from 'expo-contacts/legacy'
import * as Crypto from 'expo-crypto'
import { type Href, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DotField } from '@/components/fan-card'
import {
  AddButton,
  PersonRow,
  personLine,
  type Relation,
  useFriendActions
} from '@/components/friends'
import { GroupLabel, LineList } from '@/components/game-line'
import { haptic } from '@/components/motion'
import { INK_ON_DARK, usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  PillButton,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { inviteMessage } from '@/lib/invite'
import { trpc } from '@/lib/trpc'

/** Teto do que vai ao servidor; agenda maior manda os primeiros. */
const MAX_EMAILS = 2000

/**
 * Quem da agenda já está na Onside ("Contatos" da 11a). A conta tem e-mail,
 * não telefone: o app lê os e-mails dos contatos e manda só o SHA-256 de cada
 * um. Quem não aceita pedidos de qualquer pessoa não aparece.
 */
export default function ContactsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  const [state, setState] = useState<
    'asking' | 'denied' | 'blocked' | 'reading' | 'failed' | 'done'
  >('asking')
  const match = useMutation(trpc.friends.matchContacts.mutationOptions())
  // A relação depois de um toque: a lista veio de uma mutation, não se refaz.
  const [changed, setChanged] = useState<Record<string, Relation>>({})
  const actions = useFriendActions()
  const me = useQuery(trpc.friends.me.queryOptions())
  const [book, setBook] = useState<{ name: string; hash: string }[]>([])

  const read = () => readContacts().catch(() => setState('failed'))
  const readContacts = async () => {
    const permission = await Contacts.requestPermissionsAsync()
    if (!permission.granted)
      return setState(permission.canAskAgain ? 'denied' : 'blocked')
    setState('reading')
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Emails, Contacts.Fields.Name]
    })
    // Um e-mail por contato basta; o nome fica no celular, para o "na
    // agenda como" e para o "Chamar quem não está".
    const people = data.flatMap((contact) => {
      const email = contact.emails?.find((e) => e.email)?.email
      return email && contact.name
        ? [{ name: contact.name, email: email.trim().toLowerCase() }]
        : []
    })
    const unique = [...new Map(people.map((p) => [p.email, p])).values()].slice(
      0,
      MAX_EMAILS
    )
    const hashed = await Promise.all(
      unique.map(async (p) => ({
        name: p.name,
        hash: await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          p.email
        )
      }))
    )
    setBook(hashed)
    match.mutate(
      { hashes: hashed.map((p) => p.hash) },
      { onSettled: () => setState('done') }
    )
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: lê uma vez, ao abrir
  useEffect(() => {
    read()
  }, [])

  const people = match.data ?? []
  const nameOf = new Map(book.map((p) => [p.hash, p.name]))
  const found = new Set(people.map((p) => p.hash))
  // Quem não está: os primeiros da agenda, para chamar com o seu link.
  const missing = book.filter((p) => !found.has(p.hash)).slice(0, 8)
  const invite = () => {
    if (!me.data) return
    haptic.select()
    Share.share({ message: inviteMessage(me.data.friendCode) })
  }

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.head}>
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
          <Text style={[styles.kicker, { color: palette.muted }]}>AMIGOS</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={[styles.title, { color: palette.ink }]}>
          Da sua <Text style={{ color: palette.hot }}>agenda</Text>
        </Text>

        {state === 'asking' || state === 'reading' || match.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 24 }} />
        ) : state === 'denied' || state === 'blocked' ? (
          <View style={styles.empty}>
            <Icon name="people" size={30} color={palette.ink} />
            <Text
              style={[
                text(15, 'Regular', 1.45),
                { color: palette.ink, textAlign: 'center' }
              ]}
            >
              {state === 'blocked'
                ? 'A agenda está bloqueada para a Onside. Libere nos Ajustes do celular.'
                : 'Para achar seus amigos, a Onside precisa ver a agenda.'}
            </Text>
            <PillButton
              label={state === 'blocked' ? 'Abrir Ajustes' : 'Permitir agenda'}
              onPress={() =>
                state === 'blocked' ? Linking.openSettings() : read()
              }
            />
          </View>
        ) : match.isError || state === 'failed' ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para procurar seus contatos.
            </Text>
            <PillButton label="Tentar de novo" onPress={read} />
          </View>
        ) : (
          <>
            <View style={[styles.board, palette.dark && INK_ON_DARK]}>
              <DotField id="agenda" />
              <Text style={styles.boardKicker}>JÁ ESTÃO NA ONSIDE</Text>
              <View style={styles.boardRow}>
                <Text style={styles.big}>{people.length}</Text>
                <Text style={[text(13, 'Regular', 1.3), { color: '#aaa9a4' }]}>
                  de {book.length.toLocaleString('pt-BR')}{' '}
                  {book.length === 1 ? 'contato' : 'contatos'} com e-mail
                </Text>
              </View>
            </View>
            {people.length ? (
              <LineList>
                {people.map((person, index) => {
                  const known = nameOf.get(person.hash)
                  return (
                    <PersonRow
                      key={person.id}
                      id={person.id}
                      name={person.name}
                      image={person.image}
                      sub={
                        known && known !== person.name
                          ? `na agenda como “${known}”`
                          : personLine(person)
                      }
                      size={40}
                      first={index === 0}
                      onPress={() =>
                        router.push(`/amigo/${person.id}?via=contacts` as Href)
                      }
                      right={
                        <AddButton
                          relation={changed[person.id] ?? person.relation}
                          busy={actions.busyFor(person.id)}
                          onPress={() =>
                            actions.act(
                              person.id,
                              changed[person.id] ?? person.relation,
                              'contacts',
                              (next) =>
                                setChanged((all) => ({
                                  ...all,
                                  [person.id]: next
                                }))
                            )
                          }
                        />
                      }
                    />
                  )
                })}
              </LineList>
            ) : null}
            {missing.length ? (
              <>
                <GroupLabel>Chamar quem não está</GroupLabel>
                <LineList>
                  {missing.map((person, index) => (
                    <View
                      key={person.hash}
                      style={[
                        styles.row,
                        index > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: palette.line
                        }
                      ]}
                    >
                      <View
                        style={[styles.face, { backgroundColor: palette.mark }]}
                      >
                        <Text
                          style={[
                            text(14, 'Bold', 1.1),
                            { color: palette.ink }
                          ]}
                        >
                          {person.name.trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            text(15, 'Bold', 1.2),
                            { color: palette.ink }
                          ]}
                        >
                          {person.name}
                        </Text>
                        {index === 0 ? (
                          <Text
                            style={[
                              text(12.5, 'Regular', 1.3),
                              { color: palette.muted }
                            ]}
                          >
                            o link já leva o seu código
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Convidar ${person.name}`}
                        onPress={invite}
                        style={styles.invite}
                      >
                        <Icon name="share" size={14} color={INK} />
                        <Text style={[text(13, 'Bold', 1.2), { color: INK }]}>
                          Convidar
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </LineList>
              </>
            ) : null}
          </>
        )}
        <View style={[styles.note, { backgroundColor: palette.card }]}>
          <Icon name="lock" size={18} color={palette.muted} />
          <Text
            style={[
              text(13, 'Regular', 1.45),
              { color: palette.muted, flex: 1 }
            ]}
          >
            A agenda{' '}
            <Text style={{ fontFamily: 'Archivo-Bold', color: palette.ink }}>
              não sai do celular
            </Text>
            : mandamos só uma impressão de cada e-mail, que não volta a ser
            e-mail. Só aparece quem aceita pedido de todos.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
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
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1.04
  },
  // Anton 32: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 32,
    textTransform: 'uppercase',
    marginVertical: -7.8
  },
  empty: { alignItems: 'center', gap: 16, paddingTop: 32 },
  board: {
    borderRadius: 20,
    backgroundColor: INK,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  boardKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 1,
    color: ACID
  },
  boardRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  // Anton 44: margem negativa no lugar do entrelinha curto.
  big: {
    fontFamily: 'Anton',
    fontSize: 44,
    color: ACID,
    marginVertical: -10.7
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11
  },
  face: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: ACID
  },
  note: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 16
  }
})
