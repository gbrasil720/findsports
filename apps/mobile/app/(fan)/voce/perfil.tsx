import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { dayLabel, initials, Photo } from '@/components/explore'
import { useLayout, useNavInsets } from '@/components/layout'
import { MedalImage } from '@/components/medal'
import { haptic, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import { usePalette } from '@/components/theme'
import {
  ACID,
  ErrorState,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  Text,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { SettingsList } from '@/components/you-panel'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { formatCode, shortDate } from '@/lib/my-games'
import {
  gameToday,
  levelLine,
  markedToday,
  memberSince,
  nextInSaved,
  topBars,
  yourBarCount
} from '@/lib/profile'
import { trpc } from '@/lib/trpc'

/*
 * Perfil (2l do design, seção 10): quem você é na Onside, seus números e os
 * atalhos para o resto da aba "Você". Fica na pilha da aba, com a barra.
 * "Suas comunidades" do design não entrou: comunidades ainda não existem
 * (seção 14). "Tenho um bar" saiu a pedido do dono (20/10/2026). A
 * engrenagem, o raio e os esportes abrem as Configurações (11f–11i).
 */

export default function Profile() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBar = useTabBarSpace()
  const palette = usePalette()
  const soon = useSoon()
  useStatusBar('auto')
  const session = authClient.useSession()
  const user = session.data?.user
  const achievements = useQuery(trpc.achievements.mine.queryOptions())
  const visits = useQuery(trpc.attendance.visits.queryOptions())
  const saved = useQuery(trpc.pubs.getFavorites.queryOptions())
  const mine = useQuery(trpc.attendance.mine.queryOptions())
  const sports = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const pending = useQuery(trpc.postGame.pending.queryOptions())
  const feedback = useMutation(trpc.feedback.send.mutationOptions())
  const queries = [achievements, visits, saved, mine, sports]
  const now = Date.now()
  const layout = useLayout()
  const nav = useNavInsets()
  // Tablet em pé e o Perfil aberto do "Você" deitado: o painel largo, com
  // cinco medalhas e os números numa linha (regra 04 da T5, WEB-491).
  const wide = layout.kind === 'stack' || layout.kind === 'split'
  // Mesa (Duo em laptop, Flex Mode): você em cima, jogos e conquistas embaixo.
  const table = layout.kind === 'table'
  const free = layout.width - nav.left - nav.right
  // A coluna do painel: 28 de margem, até 960 de largura.
  const side = wide ? Math.max(28, (free - 960) / 2) : 16
  const column = free - side * 2
  const avatar = wide ? 96 : table ? (layout.width > 800 ? 84 : 72) : 76
  const medalSize = wide
    ? column > 900
      ? 78
      : 64
    : table && layout.width <= 800
      ? 48
      : 58

  const level = achievements.data?.level
  const list = achievements.data?.achievements ?? []
  // As três conquistadas por último; sem nenhuma, as três primeiras a buscar.
  const unlocked = list
    .filter((a) => a.unlockedAt)
    .sort(
      (x, y) =>
        new Date(y.unlockedAt ?? 0).getTime() -
        new Date(x.unlockedAt ?? 0).getTime()
    )
  const medals = (unlocked.length ? unlocked : list).slice(0, wide ? 5 : 3)
  const games = mine.data ?? []
  const today = markedToday(
    games.filter((game) => !game.ended),
    now
  )
  const next = nextInSaved(saved.data ?? [], 3)
  const top = topBars(visits.data ?? [], now)
  const place = [city.data?.name, user ? memberSince(user.createdAt) : null]
    .filter(Boolean)
    .join(' · ')

  const share = () => {
    if (!level) return
    Share.share({
      message: `Estou no nível ${level.level} da Onside, ${level.name}. https://onside.sh`
    })
  }
  // ponytail: Configurações é a seção 11; até lá a engrenagem só oferece "Sair".
  const settings = () =>
    router.push({ pathname: '/configuracoes', params: { aba: 'conta' } })
  // ponytail: Alert.prompt só existe no iOS; no Android o item avisa.
  const help = () =>
    Alert.prompt('Ajuda e suporte', 'Conte o que aconteceu ou o que falta.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: (message?: string) => {
          if (!message?.trim()) return haptic.error()
          feedback.mutate(
            { message: message.trim(), pageUrl: 'onside://perfil' },
            {
              onSuccess: () => {
                haptic.success()
                soon.show('Recebemos, obrigado')
              },
              onError: (error) => {
                haptic.error()
                Alert.alert('Não deu para enviar', error.message)
              }
            }
          )
        }
      }
    ])
  const openBar = (barId: string) => router.push(`/bar/${barId}` as Href)

  const pull = usePullRefresh(() =>
    Promise.all([...queries.map((q) => q.refetch()), pending.refetch()])
  )

  const who = (
    <View style={styles.who}>
      {/* No escuro, o quadro do cartão: tinta sobre tinta sumiria. */}
      <View
        style={[
          styles.avatar,
          palette.dark && { backgroundColor: palette.card },
          { width: avatar, height: avatar }
        ]}
      >
        {user?.image ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: user.image }}
            style={[styles.photo, { width: avatar, height: avatar }]}
          />
        ) : (
          <Text
            style={[styles.avatarText, { fontSize: Math.round(avatar * 0.42) }]}
          >
            {initials(user?.name ?? '')}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.name,
            { color: palette.ink },
            (wide || table) && { fontSize: 28, lineHeight: 36 }
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {user?.name}
        </Text>
        {place ? (
          <Text style={[text(13), { color: palette.muted }]}>{place}</Text>
        ) : null}
        {level ? (
          <View style={styles.levelChip}>
            <Icon name="medal" size={11} color={INK} accent={INK} />
            <Text style={[text(10.5, 'Bold', 1.2), { color: INK }]}>
              Nível {level.level} · {level.name}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Compartilhar e configurações na linha do nome, não numa
          linha só deles por cima. Na mesa, só você (o menu tem a engrenagem). */}
      <View style={[styles.actions, table && { display: 'none' }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Compartilhar seu nível"
          hitSlop={8}
          onPress={share}
        >
          <GlassRound>
            <Icon name="share" size={18} color={palette.ink} />
          </GlassRound>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          hitSlop={8}
          onPress={settings}
        >
          <GlassRound>
            <Icon name="gear" size={18} color={palette.ink} />
          </GlassRound>
        </Pressable>
      </View>
    </View>
  )

  const trophies = (
    <Tap onPress={() => router.navigate('/voce/conquistas')}>
      <Card
        shadow={palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'}
        offset={5}
        soft
        style={[
          styles.trophies,
          { backgroundColor: palette.dark ? palette.card : INK }
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={[text(15, 'Bold'), { color: PAPER }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {unlocked.length ? 'Últimas conquistas' : 'Conquistas'}
          </Text>
          <Text style={[text(12.5), { color: '#aaa9a4' }]}>
            {unlocked.length} de {list.length} · ver todas
          </Text>
        </View>
        {medals.map((a) => (
          <MedalImage
            key={a.id}
            id={a.id}
            locked={!a.unlockedAt}
            size={medalSize}
          />
        ))}
      </Card>
    </Tap>
  )

  const tiles = (
    <View style={styles.grid}>
      <Tile
        quarter={wide || table}
        icon="fan"
        value={String(yourBarCount(visits.data ?? [], saved.data ?? []))}
        label="Seus bares"
        onPress={() => router.navigate('/favoritos')}
      />
      <Tile
        quarter={wide || table}
        icon="ticket"
        value={String(today)}
        label={today === 1 ? 'Jogo marcado hoje' : 'Jogos marcados hoje'}
        hot={today > 0}
        onPress={() => router.navigate('/voce/meus-jogos')}
      />
      <Tile
        quarter={wide || table}
        icon="map"
        value={`${user?.searchRadiusKm ?? 3} km`}
        label="Raio de busca"
        onPress={() => router.push('/configuracoes')}
      />
      <Tile
        quarter={wide || table}
        icon="tv"
        value={String(sports.data?.length ?? 0)}
        label={sports.data?.length === 1 ? 'Esporte' : 'Esportes'}
        onPress={() => router.push('/configuracoes')}
      />
    </View>
  )

  const nextGames = next.length ? (
    <Card soft>
      {/* O respiro por dentro: `style` no Card o faz crescer na coluna do tablet. */}
      <View style={styles.next}>
        <Text
          style={[text(16, 'Bold'), styles.nextTitle, { color: palette.ink }]}
        >
          Próximos jogos nos seus bares
        </Text>
        {next.map(({ barId, barName, photoUrl, game }) => (
          <Pressable
            key={game.id}
            accessibilityRole="button"
            onPress={() => openBar(barId)}
            style={[styles.nextRow, { borderTopColor: palette.line }]}
          >
            <Photo uri={photoUrl} name={barName} style={styles.nextPhoto} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[text(14.5, 'Bold'), { color: palette.ink }]}
                numberOfLines={1}
              >
                {gameTitle(game)}
              </Text>
              <Text
                style={[text(12.5), { color: palette.muted }]}
                numberOfLines={1}
              >
                {barName}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.time, { color: palette.ink }]}>
                {formatTime(game.startsAt)}
              </Text>
              <Text style={[text(11.5), { color: palette.muted }]}>
                {dayLabel(game.startsAt, now)} · {game.sport.name}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  ) : null

  const extras = (
    <>
      {top.bars.length ? (
        <>
          <Heading title="Bares que você mais foi" meta={top.label} />
          <View style={styles.topBars}>
            {top.bars.map((bar) => (
              <Pressable
                key={bar.barId}
                accessibilityRole="button"
                accessibilityLabel={`${bar.barName}, ${bar.games} ${bar.games === 1 ? 'jogo' : 'jogos'}`}
                onPress={() => openBar(bar.barId)}
                style={styles.topBar}
              >
                <Photo
                  uri={bar.photoUrl}
                  name={bar.barName}
                  style={styles.topPhoto}
                  big
                />
                <Text
                  style={[text(13, 'Bold'), { color: palette.ink }]}
                  numberOfLines={1}
                >
                  {bar.barName}
                </Text>
                <Text
                  style={[text(11.5), { color: palette.muted, marginTop: -4 }]}
                >
                  {bar.games} {bar.games === 1 ? 'jogo' : 'jogos'}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {pending.data?.length ? (
        <>
          <Heading
            title="Avaliações"
            meta={`${pending.data.length} ${pending.data.length === 1 ? 'pendente' : 'pendentes'}`}
          />
          <Card soft>
            <View style={styles.rows}>
              {pending.data.slice(0, 3).map((item, i) => (
                <Row
                  key={item.eventId}
                  first={i === 0}
                  icon="star"
                  title={item.barName}
                  sub={`${gameTitle(item)} · ${shortDate(item.startsAt)}`}
                  onPress={() => router.push(`/pos-jogo/${item.eventId}`)}
                  action="Avaliar"
                />
              ))}
            </View>
          </Card>
        </>
      ) : null}

      <Card soft>
        <View style={styles.rows}>
          <Row first icon="chat" title="Ajuda e suporte" onPress={help} />
          <Row
            icon="doc"
            title="Termos e privacidade"
            onPress={() =>
              router.push({
                pathname: '/legal',
                params: { doc: 'termos' }
              })
            }
          />
        </View>
      </Card>
    </>
  )

  const status = queries.some((q) => q.isPending) ? (
    <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
  ) : queries.some((q) => q.isError) ? (
    <ErrorState
      style={styles.empty}
      title="Não deu para abrir seu perfil."
      error={queries.find((q) => q.isError)?.error}
      onRetry={() => {
        for (const q of queries) if (q.isError) q.refetch()
      }}
      retrying={queries.some((q) => q.isFetching)}
    />
  ) : null

  if (layout.kind === 'cover')
    return (
      <ProfileCover
        name={user?.name ?? ''}
        image={user?.image}
        level={level}
        game={gameToday(games, now)}
      />
    )

  // Tablet em pé: os próximos jogos ao lado do atalho das Configurações.
  const settingsShortcut = (
    <View style={[styles.half, { gap: 12 }]}>
      <Text
        style={[
          styles.sectionTitle,
          { color: palette.dark ? ACID : palette.accent }
        ]}
      >
        Configurações
      </Text>
      <SettingsList
        onPick={(aba) =>
          router.push({ pathname: '/configuracoes', params: { aba } })
        }
      />
    </View>
  )

  if (table)
    return (
      <View style={[styles.screen, { backgroundColor: palette.bg }]}>
        <View
          style={[
            styles.tableTop,
            {
              height: layout.split,
              paddingTop: insets.top + 4,
              justifyContent: layout.split > 400 ? 'center' : 'space-between',
              gap: layout.split > 400 ? 28 : 14
            }
          ]}
        >
          {who}
          {status ?? tiles}
        </View>
        {status ? null : (
          <ScrollView
            style={{ marginTop: layout.gap }}
            contentContainerStyle={[
              styles.pair,
              styles.tableBottom,
              { paddingBottom: tabBar + 24 }
            ]}
          >
            {nextGames ? <View style={{ flex: 1.2 }}>{nextGames}</View> : null}
            <View style={styles.half}>{trophies}</View>
          </ScrollView>
        )}
        {soon.toast}
      </View>
    )

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          {
            paddingTop: insets.top + (wide ? 16 : 4),
            paddingBottom: tabBar + 24,
            paddingLeft: nav.left + side,
            paddingRight: nav.right + side
          },
          wide && { gap: 18 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        {who}
        {status ?? (
          <>
            {trophies}
            {tiles}
            {wide ? (
              <View style={styles.pair}>
                {nextGames ? (
                  <View style={{ flex: 55, minWidth: 0 }}>{nextGames}</View>
                ) : null}
                <View style={{ flex: 45, minWidth: 0 }}>
                  {settingsShortcut}
                </View>
              </View>
            ) : (
              nextGames
            )}
            {extras}
          </>
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

/** Encolhe de leve no toque, como os cartões do app. */
function Tap({
  onPress,
  children
}: {
  onPress: () => void
  children: React.ReactNode
}) {
  const press = usePressScale(0.985)
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
    >
      <Animated.View style={press.style}>{children}</Animated.View>
    </Pressable>
  )
}

function Tile({
  icon,
  value,
  label,
  hot,
  quarter,
  onPress
}: {
  icon: 'fan' | 'ticket' | 'map' | 'tv'
  /** Os quatro numa linha (tablet e mesa). */
  quarter?: boolean
  value: string
  label: string
  /** Jogo marcado hoje: a sombra vermelha do design. */
  hot?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <View style={[styles.tile, quarter && styles.tileQuarter]}>
      <Tap onPress={onPress}>
        <Card
          soft
          shadow={hot ? palette.liveShadow : undefined}
          offset={hot ? 5 : 4}
          style={styles.tileBody}
        >
          <Icon name={icon} size={24} color={palette.ink} />
          <Text style={[styles.tileValue, { color: palette.ink }]}>
            {value}
          </Text>
          <View style={styles.tileLabel}>
            <Text style={[text(12.5), { color: palette.muted, flex: 1 }]}>
              {label}
            </Text>
            <Icon name="next" size={12} color={palette.muted} />
          </View>
        </Card>
      </Tap>
    </View>
  )
}

function Heading({ title, meta }: { title: string; meta: string }) {
  const palette = usePalette()
  return (
    <View style={styles.heading}>
      <Text style={[text(16, 'Bold'), { color: palette.ink }]}>{title}</Text>
      <Text style={[text(12.5), { color: palette.muted }]}>{meta}</Text>
    </View>
  )
}

function Row({
  first,
  icon,
  title,
  sub,
  action,
  onPress
}: {
  first?: boolean
  icon: 'star' | 'chat' | 'doc'
  title: string
  sub?: string
  /** Botão acid no fim ("Avaliar"); sem ele, a seta. */
  action?: string
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={action ? `${action} ${title}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: palette.line },
        pressed && { opacity: 0.6 }
      ]}
    >
      <Icon name={icon} size={22} color={palette.ink} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[text(14.5, 'SemiBold'), { color: palette.ink }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {sub ? (
          <Text
            style={[text(12.5, 'Regular', 1.35), { color: palette.muted }]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {action ? (
        <View style={styles.action}>
          <Text style={[text(12.5, 'Bold', 1.2), { color: INK }]}>
            {action}
          </Text>
        </View>
      ) : (
        <Icon name="next" size={12} color={palette.muted} />
      )}
    </Pressable>
  )
}

/**
 * A tela de fora do Z Flip 8 (regra 06 da T5): o nível e, se houver, o jogo
 * marcado de hoje com o código pronto para mostrar no balcão.
 */
function ProfileCover({
  name,
  image,
  level,
  game
}: {
  name: string
  image?: string | null
  level?: { level: number; unlocked: number; nextAt: number | null }
  game:
    | (Parameters<typeof gameTitle>[0] & {
        startsAt: string | Date
        barName: string
        code: string | null
      })
    | null
}) {
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  return (
    <View
      style={[
        styles.screen,
        styles.cover,
        { backgroundColor: palette.bg, paddingTop: insets.top + 16 }
      ]}
    >
      <View style={styles.who}>
        <View style={[styles.avatar, styles.coverAvatar]}>
          {image ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: image }}
              style={[styles.photo, { width: 52, height: 52 }]}
            />
          ) : (
            <Text style={[styles.avatarText, { fontSize: 22 }]}>
              {initials(name)}
            </Text>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[text(15, 'Bold'), { color: palette.ink }]}
          >
            {name.split(' ')[0]}
          </Text>
          {level ? (
            <Text
              style={[
                styles.coverLevel,
                { color: palette.dark ? ACID : palette.accent }
              ]}
            >
              {levelLine(level)}
            </Text>
          ) : null}
        </View>
      </View>
      {game ? (
        <Card shadow={palette.liveShadow}>
          <View style={styles.coverGame}>
            <View style={styles.coverWhen}>
              <View style={styles.liveDot} />
              <Text style={[text(12, 'Bold', 1.2), { color: palette.ink }]}>
                Hoje · {formatTime(game.startsAt)}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={[text(15, 'Bold'), { color: palette.ink, marginTop: 4 }]}
            >
              {gameTitle(game)}
            </Text>
            <Text
              numberOfLines={1}
              style={[text(12.5), { color: palette.muted }]}
            >
              {game.barName} · você vai
            </Text>
          </View>
        </Card>
      ) : null}
      {game?.code ? (
        <View
          style={[styles.coverCode, { bottom: insets.bottom + 26 }]}
          accessibilityLabel={`Código ${game.code.split('').join(' ')}`}
        >
          <Text style={[styles.coverCodeLabel, { color: palette.muted }]}>
            CÓDIGO
          </Text>
          <View style={styles.coverCodeBox}>
            <Text style={styles.coverCodeText}>{formatCode(game.code)}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { gap: 16 },
  tableTop: { paddingHorizontal: 24, paddingBottom: 16 },
  tableBottom: { paddingHorizontal: 20, paddingTop: 14 },
  actions: { flexDirection: 'row', gap: 8, alignSelf: 'flex-start' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 76, height: 76, borderRadius: 6 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 6,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 }
  },
  avatarText: { fontFamily: 'Anton', fontSize: 32, color: ACID },
  name: { ...text(23, 'Bold', 1.3), letterSpacing: -0.35 },
  levelChip: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: ACID
  },
  empty: { gap: 16, marginTop: 24 },
  trophies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.5%', flexGrow: 1 },
  tileQuarter: { width: '23%' },
  pair: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  sectionTitle: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginTop: -2
  },
  half: { flex: 1, minWidth: 0 },
  cover: { paddingHorizontal: 22, gap: 12 },
  coverAvatar: {
    width: 52,
    height: 52,
    shadowOffset: { width: 3, height: 3 }
  },
  coverLevel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    marginTop: 4
  },
  coverGame: { paddingVertical: 12, paddingHorizontal: 14 },
  coverWhen: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE },
  coverCode: {
    position: 'absolute',
    right: 22,
    alignItems: 'flex-end',
    gap: 6
  },
  coverCodeLabel: { fontFamily: 'GeistMono-SemiBold', fontSize: 10.5 },
  coverCodeBox: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 5,
    backgroundColor: PAPER,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  coverCodeText: {
    fontFamily: 'Anton',
    fontSize: 26,
    letterSpacing: 1.5,
    color: INK
  },
  tileBody: { paddingVertical: 13, paddingHorizontal: 14 },
  tileValue: { ...text(26, 'Bold', 1.1), marginTop: 8 },
  tileLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2
  },
  next: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4 },
  nextTitle: { marginBottom: 8 },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderTopWidth: 1
  },
  nextPhoto: { width: 40, height: 40, borderRadius: 3 },
  time: { fontFamily: 'Anton', fontSize: 20 },
  heading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6
  },
  topBars: { flexDirection: 'row', gap: 8 },
  topBar: { flex: 1, minWidth: 0, gap: 6 },
  topPhoto: { height: 78, borderRadius: 5, width: '100%' },
  rows: { paddingHorizontal: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 9
  },
  action: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: ACID
  }
})
