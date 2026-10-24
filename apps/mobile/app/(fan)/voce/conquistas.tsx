import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, FilterChip } from '@/components/card'
import { MedalImage, useMedalPalette } from '@/components/medal'
import { SWAP, usePressScale } from '@/components/motion'
import { useTabBarSpace } from '@/components/tab-bar'
import {
  GlassRound,
  Icon,
  PillButton,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import {
  type Achievement,
  type Achievements,
  GROUPS,
  type Group,
  latest,
  progressLabel,
  progressShare,
  shortDate
} from '@/lib/achievements'
import { trpc } from '@/lib/trpc'

/*
 * Estante de conquistas (2i do design): o nível, os filtros por série e a
 * grade das dez medalhas. Claro ou escuro pelo tema (`useMedalPalette`).
 * Tocar numa medalha abre o detalhe em 3D (`app/conquista/[id].tsx`).
 */

export default function Shelf() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const P = useMedalPalette()
  useStatusBar('auto')
  const mine = useQuery(trpc.achievements.mine.queryOptions())
  const [group, setGroup] = useState<Group | null>(null)
  const firstGroup = useRef(group).current
  const list = mine.data?.achievements ?? []
  const shown = group ? list.filter((a) => a.group === group) : list
  const star = latest(list)

  const share = () => {
    const level = mine.data?.level
    if (!level) return
    Share.share({
      message: `Estou no nível ${level.level} da Onside, ${level.name}, com ${level.unlocked} ${level.unlocked === 1 ? 'conquista' : 'conquistas'}. https://onside.sh`
    })
  }

  const pull = usePullRefresh(() => mine.refetch())

  return (
    <View style={[styles.screen, { backgroundColor: P.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 13, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={P.muted} />}
      >
        <View style={styles.top}>
          <Title lines={[['Conquistas']]} size={40} color={P.ink} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Compartilhar seu nível"
            hitSlop={8}
            onPress={share}
          >
            <GlassRound>
              <Icon name="share" size={18} color={P.ink} />
            </GlassRound>
          </Pressable>
        </View>

        {mine.isPending ? (
          <ActivityIndicator color={P.ink} style={{ marginTop: 40 }} />
        ) : mine.isError || !mine.data ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: P.ink }]}>
              Não deu para abrir suas conquistas.
            </Text>
            <PillButton label="Tentar de novo" onPress={() => mine.refetch()} />
          </View>
        ) : (
          <>
            <Level data={mine.data} star={star} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              <FilterChip
                label={`Todas · ${list.length}`}
                on={group === null}
                onPress={() => setGroup(null)}
              />
              {GROUPS.map((g) => (
                <FilterChip
                  key={g.key}
                  label={g.label}
                  on={group === g.key}
                  onPress={() => setGroup(g.key)}
                />
              ))}
            </ScrollView>
            {/* Trocar de filtro troca a grade em fade curto, sem salto. */}
            <Animated.View
              key={group ?? 'todas'}
              entering={group === firstGroup ? undefined : SWAP}
              style={styles.grid}
            >
              {shown.map((a) => (
                <Tile
                  key={a.id}
                  achievement={a}
                  highlight={a.id === star?.id}
                  onPress={() => router.push(`/conquista/${a.id}`)}
                />
              ))}
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Level({
  data,
  star
}: {
  data: Achievements
  star: Achievement | null
}) {
  const P = useMedalPalette()
  const { level } = data
  const share = level.nextAt ? level.unlocked / level.nextAt : 1
  return (
    <Card shadow={P.glow} offset={5}>
      <View style={styles.level}>
        <View style={{ flex: 1 }}>
          <Text style={[text(13), { color: P.muted }]}>Seu nível</Text>
          <View style={styles.levelName}>
            <Text style={[styles.levelNumber, { color: P.hot }]}>
              {level.level}
            </Text>
            <Text style={[text(19, 'Bold', 1.2), { color: P.ink }]}>
              {level.name}
            </Text>
          </View>
          <Bar share={share} height={6} style={{ marginTop: 8 }} />
          <Text style={[text(12.5), { color: P.muted, marginTop: 6 }]}>
            {level.nextAt
              ? `${level.unlocked} de ${level.nextAt} ${level.nextAt === 1 ? 'conquista' : 'conquistas'} para o nível ${level.level + 1}`
              : `Nível máximo, com ${level.unlocked} conquistas`}
          </Text>
        </View>
        {star ? <MedalImage id={star.id} size={96} /> : null}
      </View>
    </Card>
  )
}

function Bar({
  share,
  height,
  style
}: {
  share: number
  height: number
  style?: object
}) {
  const P = useMedalPalette()
  return (
    <View
      style={[
        styles.bar,
        { height, borderRadius: height / 2, backgroundColor: P.track },
        style
      ]}
    >
      <View
        style={{
          width: `${Math.round(share * 100)}%`,
          height: '100%',
          backgroundColor: P.fill
        }}
      />
    </View>
  )
}

function Tile({
  achievement: a,
  highlight,
  onPress
}: {
  achievement: Achievement
  highlight: boolean
  onPress: () => void
}) {
  const P = useMedalPalette()
  const press = usePressScale()
  // Três por linha: a tela menos as margens (16) e os dois vãos (8).
  const width = (useWindowDimensions().width - 32 - 16) / 3
  const done = Boolean(a.unlockedAt)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.name}, ${done ? `conquistada em ${shortDate(a.unlockedAt as string)}` : `${progressLabel(a)}`}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ width }}
    >
      {/* Altura da linha: a medalha ganha fica do tamanho da que tem barra. */}
      <Animated.View style={[{ flex: 1 }, press.style]}>
        <Card
          shadow={highlight ? P.glow : P.drop}
          offset={highlight ? 5 : 4}
          style={{ flex: 1 }}
        >
          <View style={styles.tile}>
            <MedalImage id={a.id} locked={!done} size={96} />
            <Text
              style={[
                text(12.5, 'Bold', 1.2),
                styles.tileName,
                { color: P.ink }
              ]}
              numberOfLines={2}
            >
              {a.name}
            </Text>
            {done ? (
              <Text style={[text(11), { color: P.muted }]}>
                {shortDate(a.unlockedAt as string)}
              </Text>
            ) : (
              <>
                <Bar
                  share={progressShare(a)}
                  height={4}
                  style={{ width: '70%' }}
                />
                <Text style={[styles.count, { color: P.muted }]}>
                  {progressLabel(a)}
                </Text>
              </>
            )}
          </View>
        </Card>
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 14 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  empty: { gap: 16, marginTop: 24 },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  levelName: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  levelNumber: {
    fontFamily: 'Anton',
    fontSize: 46,
    // Sem lineHeight menor que a fonte: o iOS cortaria o topo (AGENTS.md).
    marginVertical: -8
  },
  bar: { overflow: 'hidden' },
  chipsScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 6, paddingHorizontal: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4
  },
  tileName: { textAlign: 'center' },
  count: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5
  }
})
