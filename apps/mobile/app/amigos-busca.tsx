import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { type ReactNode, useDeferredValue, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
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
import { GroupLabel, LineList } from '@/components/game-line'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  Text,
  TextInput,
  text,
  useStatusBar
} from '@/components/ui'
import { trpc } from '@/lib/trpc'

/**
 * Buscar amigos (rodada 6, tela 4b): o trecho digitado marcado em acid e cada
 * pessoa com o que ajuda a reconhecer (@, amigos em comum, bairro). O botão
 * diz o estado (Adicionar, Pedido enviado, Amigos) e a linha fica no lugar.
 * Abaixo, "Perto de você" (a mesma cidade) e "Amigos de amigos", as únicas
 * sugestões; no fim, Meu código e Contatos. Quem escolheu "Ninguém" em "quem
 * pode te adicionar" não aparece em busca nenhuma.
 */
export default function FriendSearch() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query.trim())
  const typing = deferred.replace(/^@/, '').length >= 2
  const results = useQuery({
    ...trpc.friends.search.queryOptions({ query: deferred, scope: 'all' }),
    enabled: typing,
    placeholderData: keepPreviousData
  })
  const near = useQuery(
    trpc.friends.search.queryOptions({ query: '', scope: 'near' })
  )
  const overview = useQuery(trpc.friends.overview.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const actions = useFriendActions()
  // "Amigos de amigos" não volta da consulta com a relação: guardamos a
  // resposta do servidor para a linha trocar o botão e não pedir de novo.
  const [kept, setKept] = useState<Record<string, Relation>>({})
  const people = typing ? (results.data ?? []) : []
  const open = (id: string) => router.push(`/amigo/${id}` as Href)

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
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
        <Text style={[styles.title, { color: palette.muted }]}>AMIGOS</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View
          style={[
            styles.field,
            { backgroundColor: palette.card, borderColor: palette.ink }
          ]}
        >
          <Icon name="search" size={20} color={palette.ink} />
          <TextInput
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            placeholder="Nome ou @usuário"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            selectionColor={palette.dark ? ACID : '#5b6d0c'}
            style={[
              text(16, 'Regular', 1.2),
              styles.input,
              { color: palette.ink }
            ]}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apagar"
              hitSlop={8}
              onPress={() => setQuery('')}
            >
              <Icon name="close" size={16} color={palette.ink} />
            </Pressable>
          ) : null}
        </View>

        {typing && results.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 16 }} />
        ) : typing && people.length === 0 ? (
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            Ninguém com “{deferred}”.
          </Text>
        ) : people.length ? (
          <People>
            {people.map((person, index) => (
              <PersonRow
                key={person.id}
                id={person.id}
                name={person.name}
                image={person.image}
                sub={personLine(person)}
                highlight={deferred.replace(/^@/, '')}
                size={40}
                first={index === 0}
                onPress={() => open(person.id)}
                right={
                  <AddButton
                    relation={person.relation}
                    busy={actions.busyFor(person.id)}
                    onPress={() =>
                      actions.act(person.id, person.relation, 'search')
                    }
                  />
                }
              />
            ))}
          </People>
        ) : null}

        {near.data?.length ? (
          <>
            <GroupLabel>
              {`Perto de você${city.data?.name ? ` · ${city.data.name}` : ''}`}
            </GroupLabel>
            <People>
              {near.data.map((person, index) => (
                <PersonRow
                  key={person.id}
                  id={person.id}
                  name={person.name}
                  image={person.image}
                  sub={personLine(person)}
                  size={40}
                  first={index === 0}
                  onPress={() => open(person.id)}
                  right={
                    <AddButton
                      relation={person.relation}
                      busy={actions.busyFor(person.id)}
                      onPress={() =>
                        actions.act(person.id, person.relation, 'search')
                      }
                    />
                  }
                />
              ))}
            </People>
          </>
        ) : null}

        {overview.data?.suggestions.length ? (
          <>
            <GroupLabel>Amigos de amigos</GroupLabel>
            <People>
              {overview.data.suggestions.slice(0, 5).map((person, index) => (
                <PersonRow
                  key={person.id}
                  id={person.id}
                  name={person.name}
                  image={person.image}
                  sub={`${person.mutual} ${person.mutual === 1 ? 'amigo' : 'amigos'} em comum`}
                  size={40}
                  first={index === 0}
                  onPress={() => open(person.id)}
                  right={
                    <AddButton
                      relation={kept[person.id] ?? 'none'}
                      busy={actions.busyFor(person.id)}
                      onPress={() =>
                        actions.act(
                          person.id,
                          kept[person.id] ?? 'none',
                          'suggestion',
                          (next) =>
                            setKept((all) => ({ ...all, [person.id]: next }))
                        )
                      }
                    />
                  }
                />
              ))}
            </People>
          </>
        ) : null}

        <View style={styles.shortcuts}>
          <Shortcut
            icon="qr"
            title="Meu código"
            sub="QR e link"
            onPress={() => router.push('/meu-codigo')}
          />
          <Shortcut
            icon="people"
            title="Contatos"
            sub="quem já está aqui"
            onPress={() => router.push('/contatos')}
          />
        </View>
      </ScrollView>
    </View>
  )
}

/** O cartão das linhas. */
function People({ children }: { children: ReactNode }) {
  return (
    <LineList>
      <View>{children}</View>
    </LineList>
  )
}

function Shortcut({
  icon,
  title,
  sub,
  onPress
}: {
  icon: 'qr' | 'people'
  title: string
  sub: string
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcut,
        { backgroundColor: palette.card, shadowColor: palette.drop },
        pressed && { opacity: 0.8 }
      ]}
    >
      <Icon name={icon} size={22} color={palette.ink} />
      <View style={{ flex: 1 }}>
        <Text style={[text(14.5, 'Bold', 1.2), { color: palette.ink }]}>
          {title}
        </Text>
        <Text style={[text(12, 'Regular', 1.3), { color: palette.muted }]}>
          {sub}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10
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
  title: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1.04
  },
  field: {
    height: 52,
    borderRadius: 18,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16
  },
  input: { flex: 1, height: 48 },
  body: { paddingHorizontal: 16, gap: 14, paddingTop: 4 },
  shortcuts: { flexDirection: 'row', gap: 8 },
  shortcut: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  }
})
