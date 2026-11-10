import type { AppRouter } from '@findsports_oficial/api/routers/index'
import type { inferRouterOutputs } from '@trpc/server'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { Photo } from '@/components/explore'
import { LineList } from '@/components/game-line'
import { MedalImage } from '@/components/medal'
import { SWAP } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, PillButton, Text, text } from '@/components/ui'
import { formatTime } from '@/lib/explore'
import type { MedalId } from '@/lib/medals'
import { noticeAgo } from '@/lib/notices'
import { firstName } from '@/lib/ranking'

/*
 * O que a galera está fazendo (rodada 6, tela 4): Hoje (os bares onde os
 * amigos vão, com "Vou também" no cartão), o Duelo do mês com o amigo mais
 * perto no ranking e a Atividade. Os cartões de tinta são os do placar; a
 * barra do duelo só muda quando o placar muda.
 */

type Activity = inferRouterOutputs<AppRouter>['friends']['activity']
type Today = Activity['today'][number]
type Feed = Activity['feed'][number]

const ACIDS = [ACID, PAPER, '#e7e3db']

/** As iniciais em círculos sobrepostos (`.sa`). */
function Faces({ names }: { names: string[] }) {
  return (
    <View style={{ flexDirection: 'row', marginRight: 6 }}>
      {names.slice(0, 3).map((name, index) => (
        <View
          key={name + index}
          style={[
            styles.face,
            {
              backgroundColor: ACIDS[index] ?? PAPER,
              marginLeft: index ? -4 : 0
            }
          ]}
        >
          <Text style={[text(9.5, 'Bold', 1), { color: INK }]}>
            {name.trim().charAt(0).toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** "Marina e Rafael", "Marina, Rafael e mais 2". */
function namesLine(names: string[]) {
  const first = names.map(firstName)
  if (first.length <= 2) return first.join(' e ')
  return `${first.slice(0, 2).join(', ')} e mais ${first.length - 2}`
}

export function TodayCard({
  items,
  busy,
  onGoing,
  onBar
}: {
  items: Today[]
  busy: string | null
  onGoing: (item: Today) => void
  onBar: (item: Today) => void
}) {
  const people = new Set(items.flatMap((i) => i.friends.map((f) => f.id)))
  return (
    <View style={styles.ink}>
      <View style={styles.head}>
        <Text style={styles.kicker}>
          HOJE · {people.size} {people.size === 1 ? 'AMIGO VAI' : 'AMIGOS VÃO'}
        </Text>
        <Icon name="fire" size={14} color={ACID} accent={'#e8320c'} />
      </View>
      {items.map((item) => (
        <Pressable
          key={item.eventId}
          accessibilityRole="button"
          onPress={() => onBar(item)}
          style={styles.game}
        >
          <Photo uri={item.photoUrl} name={item.barName} style={styles.photo} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[text(14.5, 'Bold', 1.2), { color: PAPER }]}
            >
              {item.barName}
            </Text>
            <Text
              numberOfLines={1}
              style={[text(12, 'Regular', 1.3), { color: '#aaa9a4' }]}
            >
              {item.title} · {formatTime(item.startsAt)}
            </Text>
            <View style={styles.who}>
              <Faces names={item.friends.map((f) => f.name)} />
              <Text
                numberOfLines={1}
                style={[
                  text(12, 'Regular', 1.3),
                  { color: '#c9c7c0', flex: 1 }
                ]}
              >
                {namesLine(item.friends.map((f) => f.name))}
              </Text>
            </View>
          </View>
          {/* O botão vira "Você vai" no lugar (crossfade). */}
          <Animated.View key={item.mine ? 'vou' : 'nao'} entering={SWAP}>
            {item.mine ? (
              <View style={styles.going}>
                <Icon name="check" size={14} color={ACID} />
                <Text style={[text(13, 'Bold', 1.2), { color: ACID }]}>
                  Você vai
                </Text>
              </View>
            ) : (
              <PillButton
                label={busy === item.eventId ? 'Marcando…' : 'Vou também'}
                height={36}
                onPress={() => onGoing(item)}
              />
            )}
          </Animated.View>
        </Pressable>
      ))}
    </View>
  )
}

/** O duelo do mês (`.duel`): você × o amigo mais perto no ranking. */
export function DuelCard({
  title,
  metric,
  me,
  them,
  closesInDays
}: {
  title: string
  metric: string
  me: { name: string; value: number }
  them: { name: string; value: number }
  closesInDays?: number
}) {
  const total = me.value + them.value
  const share = total ? me.value / total : 0.5
  const lead = me.value - them.value
  return (
    <View style={styles.ink}>
      <View style={styles.head}>
        <Text style={styles.kicker}>{title.toLocaleUpperCase('pt-BR')}</Text>
        <Text style={styles.kicker}>{metric.toLocaleUpperCase('pt-BR')}</Text>
      </View>
      <View style={styles.duel}>
        <View style={styles.side}>
          <Initial name={me.name} me />
          <Text style={[styles.score, lead > 0 && { color: ACID }]}>
            {me.value}
          </Text>
        </View>
        <Text style={styles.vs}>×</Text>
        <View style={[styles.side, { justifyContent: 'flex-end' }]}>
          <Text style={[styles.score, lead < 0 && { color: ACID }]}>
            {them.value}
          </Text>
          <Initial name={them.name} />
        </View>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barMine, { width: `${share * 100}%` }]} />
      </View>
      {closesInDays !== undefined ? (
        <Text style={[text(12.5, 'Regular', 1.3), { color: '#aaa9a4' }]}>
          {lead === 0
            ? 'Empatados'
            : lead > 0
              ? `Você na frente por ${lead}`
              : `${firstName(them.name)} na frente por ${-lead}`}
          .{' '}
          {closesInDays <= 0
            ? 'Fecha hoje.'
            : `Faltam ${closesInDays} ${closesInDays === 1 ? 'dia' : 'dias'}.`}
        </Text>
      ) : null}
    </View>
  )
}

function Initial({ name, me }: { name: string; me?: boolean }) {
  const letters = me
    ? name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : name.trim().charAt(0).toUpperCase()
  return (
    <View
      style={[
        styles.initial,
        me
          ? { backgroundColor: INK, borderWidth: 1, borderColor: '#34342d' }
          : { backgroundColor: ACID }
      ]}
    >
      <Text style={[text(15, 'Bold', 1.1), { color: me ? ACID : INK }]}>
        {letters}
      </Text>
    </View>
  )
}

/** A atividade (`.fd`): quem fez o quê, com a medalha ou o nível ao lado. */
export function FeedList({
  items,
  onPerson
}: {
  items: Feed[]
  onPerson: (id: string) => void
}) {
  const palette = usePalette()
  const now = Date.now()
  const B = { fontFamily: 'Archivo-Bold' }
  return (
    <LineList>
      {items.map((item, index) => (
        <Pressable
          key={`${item.kind}-${item.person.id}-${item.at}-${index}`}
          accessibilityRole="button"
          onPress={() => onPerson(item.person.id)}
          style={[
            styles.feed,
            index > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
          ]}
        >
          <View
            style={[
              styles.feedFace,
              { backgroundColor: index % 3 ? palette.mark : ACID }
            ]}
          >
            <Text style={[text(13.5, 'Bold', 1.1), { color: INK }]}>
              {item.person.name.trim().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(13.5, 'Regular', 1.35), { color: palette.ink }]}>
              <Text style={B}>{firstName(item.person.name)}</Text>
              {item.kind === 'visit' ? (
                <>
                  {' validou o código no '}
                  <Text style={B}>{item.barName}</Text>
                </>
              ) : item.kind === 'medal' ? (
                <>
                  {' ganhou '}
                  <Text style={B}>{medalName(item.medalId)}</Text>
                </>
              ) : (
                ` subiu para o nível ${item.level} · ${item.levelName}`
              )}
            </Text>
            <Text style={[styles.ago, { color: palette.muted }]}>
              {noticeAgo(item.at, now) ?? ''}
            </Text>
          </View>
          {item.kind === 'medal' ? (
            <MedalImage id={item.medalId as MedalId} size={36} />
          ) : item.kind === 'level' ? (
            <View
              style={[
                styles.levelDot,
                { borderColor: palette.ink, backgroundColor: ACID }
              ]}
            >
              <Text style={[styles.levelText, { color: INK }]}>
                {item.level}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </LineList>
  )
}

const MEDALS: Record<string, string> = {
  bar1: 'Primeira rodada',
  bar5: 'Desbravador',
  bar10: 'Rato de bar',
  bar25: 'Lenda do bairro',
  bai3: 'Rodou a cidade',
  bai6: 'Cidadão',
  esp2: 'Eclético',
  esp4: 'Poliesportivo',
  ava1: 'Primeira resenha',
  ava10: 'Crítico'
}
const medalName = (id: string) => MEDALS[id] ?? id

const styles = StyleSheet.create({
  ink: {
    borderRadius: 24,
    backgroundColor: INK,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.84,
    color: '#aaa9a4'
  },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(241,238,230,.07)'
  },
  photo: { width: 48, height: 48, borderRadius: 12 },
  who: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  face: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  going: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6
  },
  duel: { flexDirection: 'row', alignItems: 'center' },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Anton 46/1: margem negativa no lugar do entrelinha curto.
  score: {
    fontFamily: 'Anton',
    fontSize: 46,
    color: PAPER,
    marginVertical: -11
  },
  vs: {
    fontFamily: 'Anton',
    fontSize: 22,
    color: '#6b6a63',
    marginVertical: -5
  },
  initial: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  bar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: ACID,
    overflow: 'hidden'
  },
  barMine: { height: '100%', backgroundColor: PAPER },
  feed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10
  },
  feedFace: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ago: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, marginTop: 2 },
  levelDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  levelText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 }
})
