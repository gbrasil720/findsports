import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { useDeferredValue, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, FilterChip } from '@/components/card'
import {
  AddButton,
  heroShadow,
  PersonRow,
  personLine,
  useFriendActions
} from '@/components/friends'
import { Glass } from '@/components/glass'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { HOT, Icon, INK, LIVE, text, useStatusBar } from '@/components/ui'
import { inviteMessage } from '@/lib/invite'
import { trpc } from '@/lib/trpc'

const SCOPES = [
  ['all', 'Todos'],
  ['friendsOfFriends', 'Amigos de amigos'],
  ['near', 'Perto de você']
] as const

/**
 * Buscar amigos (11b do design): por nome ou `@`, com o trecho digitado em
 * destaque. "Perto de você" é a mesma cidade do seu perfil.
 */
export default function FriendSearch() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<(typeof SCOPES)[number][0]>('all')
  const deferred = useDeferredValue(query.trim())
  const me = useQuery(trpc.friends.me.queryOptions())
  const results = useQuery({
    ...trpc.friends.search.queryOptions({ query: deferred, scope }),
    enabled: deferred.replace(/^@/, '').length >= 2,
    placeholderData: keepPreviousData
  })
  const actions = useFriendActions()
  const typing = deferred.replace(/^@/, '').length >= 2
  const people = typing ? (results.data ?? []) : []

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          tint={palette.dark ? undefined : 'rgba(255,255,255,.62)'}
          style={styles.field}
        >
          {/* A borda numa camada por cima: no vidro, o iOS a tinge e o acid
              do design sai apagado. */}
          <View
            pointerEvents="none"
            style={[
              styles.ring,
              { borderColor: palette.dark ? '#c9f135' : INK }
            ]}
          />
          <Icon name="search" size={18} color={palette.ink} />
          <TextInput
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            placeholder="Nome ou @usuário"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            selectionColor={palette.dark ? '#c9f135' : LIVE}
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
              style={[styles.clear, { backgroundColor: palette.mark }]}
            >
              <Icon name="close" size={12} color={palette.ink} />
            </Pressable>
          ) : null}
        </Glass>
        <Pressable
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.back()}
        >
          <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
            Cancelar
          </Text>
        </Pressable>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.chips}>
          {SCOPES.map(([key, label]) => (
            <FilterChip
              key={key}
              label={label}
              on={scope === key}
              raised
              onPress={() => setScope(key)}
            />
          ))}
        </View>

        {typing && results.isPending ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 16 }} />
        ) : typing && people.length === 0 ? (
          <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
            Ninguém com “{deferred}”{scope === 'near' ? ' na sua cidade' : ''}
            {scope === 'friendsOfFriends' ? ' entre amigos de amigos' : ''}.
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
                highlight={deferred.replace(/^@/, '')}
                big
                size={42}
                first={index === 0}
                onPress={() => router.push(`/amigo/${person.id}` as Href)}
                right={
                  <AddButton
                    relation={person.relation}
                    busy={actions.busy}
                    onPress={() =>
                      actions.act(person.id, person.relation, 'search')
                    }
                  />
                }
              />
            ))}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={!me.data}
          onPress={() => {
            if (!me.data) return
            haptic.select()
            Share.share({ message: inviteMessage(me.data.friendCode) })
          }}
        >
          <Card shadow={heroShadow(palette)}>
            <View style={styles.invite}>
              <Icon name="link" size={26} color={palette.ink} accent={HOT} />
              <View style={{ flex: 1 }}>
                <Text style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}>
                  Não achou quem procurava?
                </Text>
                <Text
                  style={[
                    text(12.5, 'Regular', 1.35),
                    { color: palette.muted }
                  ]}
                >
                  Mande seu link. Quem criar conta por ele já entra como seu
                  amigo.
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6
  },
  field: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8
  },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    borderWidth: 1.5
  },
  input: { flex: 1, height: 46 },
  clear: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  body: { paddingHorizontal: 16, gap: 14, paddingTop: 8 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }
})
