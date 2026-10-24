import { useMutation } from '@tanstack/react-query'
import * as Contacts from 'expo-contacts/legacy'
import * as Crypto from 'expo-crypto'
import { type Href, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AddButton,
  PersonRow,
  personLine,
  type Relation,
  useFriendActions
} from '@/components/friends'
import { usePalette } from '@/components/theme'
import {
  BackButton,
  Icon,
  PillButton,
  Title,
  text,
  useStatusBar
} from '@/components/ui'
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

  const read = () => readContacts().catch(() => setState('failed'))
  const readContacts = async () => {
    const permission = await Contacts.requestPermissionsAsync()
    if (!permission.granted)
      return setState(permission.canAskAgain ? 'denied' : 'blocked')
    setState('reading')
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Emails]
    })
    const emails = [
      ...new Set(
        data.flatMap((contact) =>
          (contact.emails ?? []).flatMap((e) =>
            e.email ? [e.email.trim().toLowerCase()] : []
          )
        )
      )
    ].slice(0, MAX_EMAILS)
    const hashes = await Promise.all(
      emails.map((email) =>
        Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email)
      )
    )
    match.mutate({ hashes }, { onSettled: () => setState('done') })
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: lê uma vez, ao abrir
  useEffect(() => {
    read()
  }, [])

  const people = match.data ?? []

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.head}>
          <BackButton />
          <Title lines={[['Contatos']]} size={32} color={palette.ink} />
        </View>
        <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
          Quem da sua agenda já está na Onside. Os e-mails não saem do celular:
          só uma assinatura de cada um é comparada.
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
        ) : people.length === 0 ? (
          <Text style={[text(15, 'Regular', 1.45), { color: palette.ink }]}>
            Ninguém da sua agenda está na Onside ainda. Mande seu link de
            convite em Amigos.
          </Text>
        ) : (
          <View>
            {people.map((person, index) => (
              <PersonRow
                key={person.id}
                id={person.id}
                name={person.name}
                image={person.image}
                sub={personLine(person)}
                size={42}
                first={index === 0}
                onPress={() =>
                  router.push(`/amigo/${person.id}?via=contacts` as Href)
                }
                right={
                  <AddButton
                    relation={changed[person.id] ?? person.relation}
                    busy={actions.busy}
                    onPress={() =>
                      actions.act(
                        person.id,
                        changed[person.id] ?? person.relation,
                        'contacts',
                        (next) =>
                          setChanged((all) => ({ ...all, [person.id]: next }))
                      )
                    }
                  />
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  empty: { alignItems: 'center', gap: 16, paddingTop: 32 }
})
