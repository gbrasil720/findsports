import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, FilterChip } from '@/components/card'
import { useLayout, useNavInsets } from '@/components/layout'
import { Medal3D, MedalImage, useMedalPalette } from '@/components/medal'
import {
  CoverMedal,
  engraving,
  Glow,
  MedalDetail
} from '@/components/medal-detail'
import { haptic, SWAP, usePressScale } from '@/components/motion'
import { useTabBarSpace } from '@/components/tab-bar'
import {
  ACID,
  ErrorState,
  GlassRound,
  Icon,
  INK,
  Text,
  Title,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import {
  type Achievement,
  type Achievements,
  describe,
  GROUPS,
  type Group,
  latest,
  missingLine,
  nearest,
  progressLabel,
  progressShare,
  series,
  seriesLabel,
  shortDate,
  timeline,
  unit
} from '@/lib/achievements'
import { trpc } from '@/lib/trpc'

/*
 * Estante de conquistas (2i do design): o nível, os filtros por série e a
 * grade das dez medalhas. Claro ou escuro pelo tema (`useMedalPalette`).
 * Tocar numa medalha abre o detalhe em 3D (`app/conquista/[id].tsx`).
 *
 * Fora do celular (A06): no tablet em pé, a mais recente em destaque, a
 * grade larga, as que estão perto e a linha do tempo; lado a lado (tablet
 * deitado, dobrável aberto), a estante e o detalhe da medalha tocada, sem
 * trocar de tela; na mesa, a medalha em cima e a estante embaixo; na tela de
 * fora do Flip, a última conquista.
 */

export default function Shelf() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const P = useMedalPalette()
  const layout = useLayout()
  const nav = useNavInsets()
  const window = useWindowDimensions()
  useStatusBar('auto')
  const mine = useQuery(trpc.achievements.mine.queryOptions())
  const [group, setGroup] = useState<Group | null>(null)
  const firstGroup = useRef(group).current
  const list = mine.data?.achievements ?? []
  const shown = group ? list.filter((a) => a.group === group) : list
  const star = latest(list)
  // Lado a lado e na mesa, a medalha tocada fica marcada e aparece grande.
  const [chosen, setChosen] = useState<string | null>(null)
  const picked = list.find((a) => a.id === chosen) ?? star ?? list[0]

  const share = () => {
    const level = mine.data?.level
    if (!level) return
    Share.share({
      message: `Estou no nível ${level.level} da Onside, ${level.name}, com ${level.unlocked} ${level.unlocked === 1 ? 'conquista' : 'conquistas'}. https://onside.sh`
    })
  }
  const shareMedal = (medal: Achievement) =>
    Share.share({
      message: medal.unlockedAt
        ? `Ganhei a medalha ${medal.name} na Onside. ${describe(medal)} https://onside.sh`
        : `Estou atrás da medalha ${medal.name} na Onside: ${progressLabel(medal)}. https://onside.sh`
    })
  const pick = (id: string) => {
    if (id === picked?.id) return
    haptic.select()
    setChosen(id)
  }

  const pull = usePullRefresh(() => mine.refetch())
  const refresh = <RefreshControl {...pull} tintColor={P.muted} />
  const root = [
    styles.screen,
    { backgroundColor: P.bg, paddingLeft: nav.left, paddingRight: nav.right }
  ]
  const data = mine.data

  const chips = (
    <>
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
    </>
  )
  /** A grade: `width` é o espaço todo, dividido em `cols`. */
  const grid = (
    width: number,
    cols: number,
    size: number,
    gap: number,
    side: boolean
  ) => (
    // Trocar de filtro troca a grade em fade curto, sem salto.
    <Animated.View
      key={group ?? 'todas'}
      entering={group === firstGroup ? undefined : SWAP}
      style={[styles.grid, { gap }]}
    >
      {shown.map((a) => (
        <Tile
          key={a.id}
          achievement={a}
          width={(width - gap * (cols - 1)) / cols}
          size={size}
          highlight={!side && a.id === star?.id}
          selected={side && a.id === picked?.id}
          onPress={() =>
            side ? pick(a.id) : router.push(`/conquista/${a.id}`)
          }
        />
      ))}
    </Animated.View>
  )

  // Tela de fora do Z Flip 8 (A06): a última conquista girando; sem
  // nenhuma ainda, a primeira, com quanto falta.
  if (layout.kind === 'cover') {
    const medal = star ?? list[0]
    return medal ? (
      <CoverMedal medal={medal} list={list} share={() => shareMedal(medal)} />
    ) : (
      <View style={[styles.screen, { backgroundColor: INK }]} />
    )
  }

  const ready = data && picked ? data : null

  // Na mesa (Duo em laptop, Flex Mode): a medalha gira na metade de cima,
  // longe da mão; a estante fica embaixo, perto do polegar.
  if (layout.kind === 'table' && ready && picked) {
    const wide = layout.width > 800
    const medal = Math.min(layout.split - insets.top - 24, 300)
    const size = wide ? 96 : 84
    return (
      <View style={root}>
        <View style={{ height: layout.split, overflow: 'hidden' }}>
          <Glow strength={P.dark ? 0.14 : 0.3} rx="50%" />
          <View style={[styles.tableTop, { paddingTop: insets.top }]}>
            <Medal3D
              medal={engraving(picked)}
              drag
              style={{ width: medal, height: medal }}
            />
            <Animated.View
              key={picked.id}
              entering={SWAP}
              style={styles.tableCopy}
            >
              <Text style={[text(13), { color: P.muted }]}>
                {seriesLabel(list, picked)}
              </Text>
              <Title
                lines={[[picked.name]]}
                size={wide ? 44 : 36}
                color={P.ink}
              />
              <Text style={[text(14.5, 'Regular', 1.45), { color: P.body }]}>
                {describe(picked)}
              </Text>
              <Tiers medal={picked} list={list} size={44} onPick={pick} />
            </Animated.View>
          </View>
        </View>
        <View
          style={[
            styles.tableBottom,
            { marginTop: layout.gap, paddingBottom: tabBar + 12 }
          ]}
        >
          <View style={styles.tableBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              {chips}
            </ScrollView>
            <Text style={[text(12.5), { color: P.muted }]}>
              Nível {ready.level.level}
              {ready.level.nextAt
                ? ` · ${ready.level.unlocked} de ${ready.level.nextAt}`
                : ''}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tableShelf}
          >
            {shown.map((a) => (
              <Tile
                key={a.id}
                achievement={a}
                width={size + 24}
                size={size}
                highlight={false}
                selected={a.id === picked.id}
                single
                onPress={() => pick(a.id)}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    )
  }

  // Lado a lado: a estante à esquerda e o detalhe fixo à direita. No tablet
  // o detalhe tem até 480 (38% da tela); no dobrável, a outra metade.
  if (layout.kind === 'split' && ready && picked) {
    const tablet =
      Platform.OS === 'ios' ? Platform.isPad : layout.nav === 'rail'
    const space = layout.width - nav.left - nav.right
    const detail = tablet
      ? Math.min(480, Math.round(space * 0.38))
      : space - (layout.split - nav.left) - layout.gap
    const shelf = tablet ? space - detail : layout.split - nav.left
    const pad = tablet ? 24 : 16
    const cols = tablet ? (shelf > 800 ? 5 : 4) : 3
    return (
      <View style={[root, styles.row]}>
        <ScrollView
          style={{ width: shelf, flexGrow: 0 }}
          contentContainerStyle={[
            styles.body,
            {
              paddingHorizontal: pad,
              paddingTop: insets.top + 26,
              paddingBottom: tabBar + 24
            }
          ]}
          refreshControl={refresh}
        >
          <View style={styles.top}>
            <Title
              lines={[['Conquistas']]}
              size={tablet ? 44 : 32}
              color={P.ink}
            />
            <ShareRound onPress={share} />
          </View>
          <Level data={ready} star={null} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.chipsScroll, { marginHorizontal: -pad }]}
            contentContainerStyle={[styles.chips, { paddingHorizontal: pad }]}
          >
            {chips}
          </ScrollView>
          {grid(
            shelf - pad * 2,
            cols,
            tablet ? (shelf > 800 ? 104 : 96) : shelf > 420 ? 92 : 80,
            tablet ? 10 : 8,
            true
          )}
        </ScrollView>
        <View
          style={[
            styles.pane,
            {
              width: detail,
              marginLeft: tablet ? 0 : layout.gap,
              backgroundColor: P.dark ? '#161613' : '#ebe8df'
            }
          ]}
        >
          <Glow strength={P.dark ? 0.13 : 0.3} rx="70%" />
          <MedalDetail
            medal={picked}
            list={list}
            insets={{ top: insets.top + 6, bottom: tabBar }}
            share={() => shareMedal(picked)}
            onPick={pick}
            frame={{
              width: detail,
              medal: Math.min(320, detail - 60, layout.height * 0.36),
              title: tablet ? 42 : detail < 400 ? 36 : 44,
              close: false
            }}
          />
        </View>
      </View>
    )
  }

  // Tablet em pé (A06): a mais recente em destaque e o nível ao lado, a
  // grade em quatro a seis colunas, as que estão perto e a linha do tempo.
  if (layout.kind === 'stack' && ready) {
    const content = layout.width - nav.left - nav.right - 56
    // Mini e Galaxy Tab em pé (1,52 e 1,6): quatro colunas grandes. O 11″
    // (1,44; o Pro, 1,45) fica com cinco, como o Air do design.
    const tall = layout.height / layout.width > 1.48
    const cols = tall ? 4 : content > 900 ? 6 : content > 700 ? 5 : 4
    const size = tall
      ? Math.min(150, Math.floor((content - 36) / 4) - 24)
      : cols >= 6
        ? 108
        : cols === 5
          ? 104
          : 110
    const big = content > 900
    const near = nearest(list)
    const done = timeline(list)
    return (
      <View style={root}>
        <ScrollView
          contentContainerStyle={[
            styles.stackBody,
            { paddingTop: insets.top + 28, paddingBottom: tabBar + 24 }
          ]}
          refreshControl={refresh}
        >
          <View style={styles.top}>
            <Title lines={[['Conquistas']]} size={52} color={P.ink} />
            <ShareRound onPress={share} />
          </View>
          <View style={styles.heroRow}>
            {star ? (
              <View style={{ flex: 1.4, minWidth: 0 }}>
                <Card shadow={P.glow} offset={5} style={{ flex: 1 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${star.name}, a mais recente`}
                    onPress={() => router.push(`/conquista/${star.id}`)}
                    style={styles.hero}
                  >
                    <MedalImage id={star.id} size={big ? 170 : 140} />
                    <View style={styles.heroCopy}>
                      <Text style={[styles.kicker, { color: P.hot }]}>
                        MAIS RECENTE ·{' '}
                        {shortDate(star.unlockedAt as string).toUpperCase()}
                      </Text>
                      <Title
                        lines={[[star.name]]}
                        size={big ? 38 : 30}
                        color={P.ink}
                      />
                      <Text style={[text(13.5), { color: P.muted }]}>
                        {unit(star.group, star.target)} · {star.share}% dos
                        torcedores têm
                      </Text>
                      <Tiers
                        medal={star}
                        list={list}
                        size={big ? 40 : 32}
                        onPick={(id) => router.push(`/conquista/${id}`)}
                      />
                    </View>
                  </Pressable>
                </Card>
              </View>
            ) : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Level data={ready} star={null} big />
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[styles.chipsScroll, { marginHorizontal: -28 }]}
            contentContainerStyle={[styles.chips, { paddingHorizontal: 28 }]}
          >
            {chips}
          </ScrollView>
          {grid(content, cols, size, 12, false)}
          {near.length ? (
            <View style={{ gap: 12 }}>
              <Section title="Perto de desbloquear" sub={String(near.length)} />
              <View style={styles.nearGrid}>
                {near.map((a) => (
                  <View
                    key={a.id}
                    style={{
                      width:
                        (content - 12 * (big && !tall ? 2 : 1)) /
                        (big && !tall ? 3 : 2)
                    }}
                  >
                    <Near
                      achievement={a}
                      onPress={() => router.push(`/conquista/${a.id}`)}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          {layout.height > 1250 && done.length ? (
            <View style={{ gap: 12 }}>
              <Section
                title="Linha do tempo"
                sub={`desde ${shortDate(done.at(-1)?.unlockedAt as string).split(' ')[1]}.`}
              />
              <Card shadow={P.drop}>
                <View style={styles.timeline}>
                  {done.map((a, index) => (
                    <Pressable
                      key={a.id}
                      accessibilityRole="button"
                      onPress={() => router.push(`/conquista/${a.id}`)}
                      style={({ pressed }) => [
                        styles.timeRow,
                        index > 0 && {
                          borderTopWidth: 1,
                          borderTopColor: P.line
                        },
                        pressed && { opacity: 0.7 }
                      ]}
                    >
                      <Text style={[styles.timeDate, { color: P.muted }]}>
                        {shortDate(a.unlockedAt as string).toUpperCase()}
                      </Text>
                      <MedalImage id={a.id} size={48} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={[text(15, 'Bold'), { color: P.ink }]}
                        >
                          {a.name}
                        </Text>
                        {a.where ? (
                          <Text
                            numberOfLines={1}
                            style={[text(12.5), { color: P.muted }]}
                          >
                            {a.group === 'bares'
                              ? `${a.where} validou seu código`
                              : a.where}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}
        </ScrollView>
      </View>
    )
  }

  // Celular, Duo fechado (quatro colunas) e o que ainda carrega fora dele.
  const phone = layout.kind === 'phone' || layout.kind === 'duoClosed'
  const space = window.width - nav.left - nav.right
  const width = Math.min(space, 640) - 32
  // Quatro colunas onde passa de 440 (capa do Fold 8); o resto, três.
  const cols = space > 440 ? 4 : 3
  return (
    <View style={root}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 13, paddingBottom: tabBar + 24 },
          !phone && styles.narrow
        ]}
        refreshControl={refresh}
      >
        <View style={styles.top}>
          <Title lines={[['Conquistas']]} size={40} color={P.ink} />
          <ShareRound onPress={share} />
        </View>

        {mine.isPending ? (
          <ActivityIndicator color={P.ink} style={{ marginTop: 40 }} />
        ) : mine.isError || !data ? (
          <ErrorState
            style={styles.empty}
            title="Não deu para abrir suas conquistas."
            error={mine.error}
            onRetry={mine.refetch}
            retrying={mine.isFetching}
          />
        ) : (
          <>
            <Level data={data} star={star} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {chips}
            </ScrollView>
            {grid(width, cols, cols === 4 ? 84 : 96, 8, false)}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function ShareRound({ onPress }: { onPress: () => void }) {
  const P = useMedalPalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Compartilhar seu nível"
      hitSlop={8}
      onPress={onPress}
    >
      <GlassRound>
        <Icon name="share" size={18} color={P.ink} />
      </GlassRound>
    </Pressable>
  )
}

/** "Perto de desbloquear 3", o título de seção do tablet (A06). */
function Section({ title, sub }: { title: string; sub: string }) {
  const P = useMedalPalette()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: P.hot }]}>{title}</Text>
      <Text style={[text(12.5), { color: P.muted }]}>{sub}</Text>
    </View>
  )
}

/** As medalhas da série com o alvo de cada uma ("1 5 10 25"). */
function Tiers({
  medal,
  list,
  size,
  onPick
}: {
  medal: Achievement
  list: Achievement[]
  size: number
  onPick: (id: string) => void
}) {
  const P = useMedalPalette()
  return (
    <View style={styles.tiers}>
      {series(list, medal.group).map((a) => {
        const on = a.id === medal.id
        return (
          <Pressable
            key={a.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={a.name}
            onPress={() => onPick(a.id)}
            style={[
              styles.tier,
              on && { backgroundColor: P.pick, borderColor: P.pickEdge }
            ]}
          >
            <MedalImage id={a.id} locked={!a.unlockedAt} size={size} />
            <Text style={[styles.count, { color: P.muted }]}>{a.target}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Uma das que estão perto: a medalha, a barra e quanto falta. */
function Near({
  achievement: a,
  onPress
}: {
  achievement: Achievement
  onPress: () => void
}) {
  const P = useMedalPalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.name}, ${progressLabel(a)}`}
      onPress={onPress}
    >
      <Card shadow={P.drop}>
        <View style={styles.near}>
          <MedalImage id={a.id} locked size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <View style={styles.nearHead}>
              <Text
                numberOfLines={1}
                style={[text(14.5, 'Bold'), { flex: 1, color: P.ink }]}
              >
                {a.name}
              </Text>
              <Text style={[styles.count, { fontSize: 11.5, color: P.muted }]}>
                {progressLabel(a)}
              </Text>
            </View>
            <Bar share={progressShare(a)} height={5} />
            <Text style={[text(12, 'Regular', 1.35), { color: P.muted }]}>
              {missingLine(a)}
            </Text>
          </View>
        </View>
      </Card>
    </Pressable>
  )
}

function Level({
  data,
  star,
  big
}: {
  data: Achievements
  star: Achievement | null
  /** No tablet em pé, ao lado do destaque: número e nome maiores. */
  big?: boolean
}) {
  const P = useMedalPalette()
  const { level } = data
  const share = level.nextAt ? level.unlocked / level.nextAt : 1
  return (
    <Card shadow={P.glow} offset={5} style={big ? { flex: 1 } : undefined}>
      <View style={[styles.level, big && { flex: 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[text(13), { color: P.muted }]}>Seu nível</Text>
          <View style={styles.levelName}>
            <Text
              style={[
                styles.levelNumber,
                big && styles.levelBig,
                { color: P.hot }
              ]}
            >
              {level.level}
            </Text>
            <Text style={[text(big ? 22 : 19, 'Bold', 1.2), { color: P.ink }]}>
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
  width,
  size,
  highlight,
  selected,
  single,
  onPress
}: {
  achievement: Achievement
  width: number
  size: number
  highlight: boolean
  /** Lado a lado: a medalha que está grande no detalhe. */
  selected?: boolean
  /**
   * Numa fileira só (a mesa): sem igualar a altura à da vizinha, que lá é a
   * metade de baixo inteira.
   */
  single?: boolean
  onPress: () => void
}) {
  const P = useMedalPalette()
  const press = usePressScale()
  const done = Boolean(a.unlockedAt)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${a.name}, ${done ? `conquistada em ${shortDate(a.unlockedAt as string)}` : `${progressLabel(a)}`}`}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={{ width }}
    >
      {/* Altura da linha: a medalha ganha fica do tamanho da que tem barra. */}
      <Animated.View style={[!single && { flex: 1 }, press.style]}>
        <Card
          shadow={selected ? ACID : highlight ? P.glow : P.drop}
          offset={selected ? 3 : highlight ? 5 : 4}
          fill={selected ? (P.dark ? '#262621' : '#fff') : undefined}
          style={single ? undefined : { flex: 1 }}
        >
          <View
            style={[
              styles.tile,
              selected && [
                styles.tileOn,
                single && { flex: 0 },
                { borderColor: P.dark ? 'rgba(241,238,230,.6)' : INK }
              ]
            ]}
          >
            <MedalImage id={a.id} locked={!done} size={size} />
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
  narrow: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  row: { flexDirection: 'row' },
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
  levelBig: { fontSize: 56, marginVertical: -10 },
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
  // A medalha do detalhe ao lado: contorno de tinta e a sombra acid (A06).
  tileOn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 6,
    paddingTop: 6.5,
    paddingBottom: 8.5,
    paddingHorizontal: 2.5
  },
  tileName: { textAlign: 'center' },
  count: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5
  },
  // Fora do celular (A06).
  pane: { overflow: 'hidden' },
  stackBody: { paddingHorizontal: 28, gap: 16 },
  heroRow: { flexDirection: 'row', gap: 16, alignItems: 'stretch' },
  hero: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 18,
    paddingHorizontal: 22
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 8 },
  kicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66
  },
  tiers: { flexDirection: 'row', gap: 6 },
  tier: {
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6
  },
  sectionTitle: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginVertical: -5
  },
  nearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  near: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  nearHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  timeline: { paddingHorizontal: 16, paddingVertical: 4 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10
  },
  timeDate: { width: 52, fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  tableTop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 24,
    paddingBottom: 16
  },
  tableCopy: { flex: 1, minWidth: 0, gap: 10 },
  tableBottom: { flex: 1, paddingTop: 14, gap: 12 },
  tableBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 20
  },
  tableShelf: { gap: 10, paddingHorizontal: 20, alignItems: 'flex-start' }
})
