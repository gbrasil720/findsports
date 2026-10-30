import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Glass } from '@/components/glass'
import { ACID, Icon, INK, Text, TextInput, text } from '@/components/ui'
import {
  conversationDate,
  plainText,
  type Recent,
  shownReply
} from '@/lib/ai-chat'
import { Round } from './header'
import { AiIcon } from './icons'
import type { AiPalette } from './theme'

/*
 * "Conversas" (Adaptativo 03, WEB-488): no tablet deitado e no Duo aberto,
 * as conversas guardadas no aparelho ficam numa coluna à esquerda do chat,
 * sempre à vista, com a busca por elas e o "+" de conversa nova.
 */
export function Conversations({
  recents,
  current,
  now,
  palette,
  top,
  onOpen,
  onNew
}: {
  recents: Recent[]
  /** A conversa aberta, marcada na lista. */
  current: string
  now: number
  palette: AiPalette
  /** Respiro de cima (a barra de status). */
  top: number
  onOpen: (recent: Recent) => void
  onNew: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLocaleLowerCase('pt-BR')
  const shown = q
    ? recents.filter((r) => r.title.toLocaleLowerCase('pt-BR').includes(q))
    : recents
  return (
    <View
      style={[
        styles.column,
        {
          backgroundColor: palette.dark ? '#161613' : '#ebe8df',
          borderRightColor: palette.line
        }
      ]}
    >
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: top }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: palette.ink }]}>Conversas</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova conversa"
            hitSlop={6}
            onPress={onNew}
          >
            <Round palette={palette}>
              <AiIcon name="plus" size={17} color={palette.ink} />
            </Round>
          </Pressable>
        </View>
        <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.search}>
          <Icon name="search" size={16} color={palette.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar em conversas"
            placeholderTextColor={palette.muted}
            returnKeyType="search"
            style={[text(14), styles.input, { color: palette.ink }]}
          />
        </Glass>
        <View style={{ gap: 4 }}>
          {shown.map((r) => {
            const on = r.id === current
            const date = conversationDate(r.at, now)
            const first = r.turns[0] ? shownReply(r.turns[0]).text : ''
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Reabrir: ${r.title}`}
                onPress={() => onOpen(r)}
                style={[
                  styles.item,
                  on && {
                    backgroundColor: palette.dark ? '#262621' : '#fff',
                    borderColor: palette.dark ? 'rgba(241,238,230,.6)' : INK,
                    boxShadow: `3px 3px 0 ${ACID}`
                  }
                ]}
              >
                <View style={styles.date}>
                  <Text style={[styles.dateTop, { color: palette.muted }]}>
                    {date.top}
                  </Text>
                  <Text
                    style={[
                      date.today ? styles.dateClock : styles.dateDay,
                      { color: palette.ink }
                    ]}
                    numberOfLines={1}
                  >
                    {date.main}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[text(14.5, 'Bold', 1.3), { color: palette.ink }]}
                    numberOfLines={1}
                  >
                    {r.title}
                  </Text>
                  <Text
                    style={[
                      text(12.5, 'Regular', 1.4),
                      { color: palette.muted }
                    ]}
                    numberOfLines={1}
                  >
                    {first ? plainText(first) : ' '}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  column: { height: '100%', borderRightWidth: 1 },
  body: { paddingHorizontal: 14, paddingBottom: 24, gap: 12 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  // Anton 28 do design, sem `lineHeight` (corta no iOS): margem negativa.
  title: {
    fontFamily: 'Anton',
    fontSize: 28,
    textTransform: 'uppercase',
    marginVertical: -7
  },
  search: {
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    overflow: 'hidden'
  },
  input: { flex: 1, height: 42 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent'
  },
  date: { width: 46, alignItems: 'center', gap: 4 },
  dateTop: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  dateClock: { fontFamily: 'GeistMono-SemiBold', fontSize: 15 },
  dateDay: { fontFamily: 'Anton', fontSize: 20, marginVertical: -5 }
})
