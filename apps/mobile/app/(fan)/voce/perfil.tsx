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
  Text,
  View
} from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import {
  dayLabel,
  initials,
  type Palette,
  Photo,
  usePalette
} from '@/components/explore'
import { MedalImage } from '@/components/medal'
import { haptic, usePressScale } from '@/components/motion'
import { useSoon } from '@/components/soon'
import { useTabBarSpace } from '@/components/tab-bar'
import {
  ACID,
  GlassRound,
  Icon,
  INK,
  PAPER,
  PillButton,
  text,
  usePullRefresh,
  useStatusBar
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime } from '@/lib/explore'
import { shortDate } from '@/lib/my-games'
import {
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
  const medals = (unlocked.length ? unlocked : list).slice(0, 3)
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

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 4, paddingBottom: tabBar + 24 }
        ]}
        refreshControl={<RefreshControl {...pull} tintColor={palette.muted} />}
      >
        <View style={styles.who}>
          {/* No escuro, o quadro do cartão: tinta sobre tinta sumiria. */}
          <View
            style={[
              styles.avatar,
              palette.dark && { backgroundColor: palette.card }
            ]}
          >
            {user?.image ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: user.image }}
                style={styles.photo}
              />
            ) : (
              <Text style={styles.avatarText}>
                {initials(user?.name ?? '')}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.name, { color: palette.ink }]}
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
              linha só deles por cima. */}
          <View style={styles.actions}>
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

        {queries.some((q) => q.isPending) ? (
          <ActivityIndicator color={palette.ink} style={{ marginTop: 40 }} />
        ) : queries.some((q) => q.isError) ? (
          <View style={styles.empty}>
            <Text style={[text(15, 'SemiBold'), { color: palette.ink }]}>
              Não deu para abrir seu perfil.
            </Text>
            <PillButton
              label="Tentar de novo"
              onPress={() => {
                for (const q of queries) if (q.isError) q.refetch()
              }}
            />
          </View>
        ) : (
          <>
            <Tap onPress={() => router.navigate('/voce/conquistas')}>
              <Card
                palette={palette}
                shadow={
                  palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'
                }
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
                    size={58}
                  />
                ))}
              </Card>
            </Tap>

            <View style={styles.grid}>
              <Tile
                palette={palette}
                icon="fan"
                value={String(
                  yourBarCount(visits.data ?? [], saved.data ?? [])
                )}
                label="Seus bares"
                onPress={() => router.navigate('/favoritos')}
              />
              <Tile
                palette={palette}
                icon="ticket"
                value={String(today)}
                label={
                  today === 1 ? 'Jogo marcado hoje' : 'Jogos marcados hoje'
                }
                hot={today > 0}
                onPress={() => router.navigate('/voce/meus-jogos')}
              />
              <Tile
                palette={palette}
                icon="map"
                value={`${user?.searchRadiusKm ?? 3} km`}
                label="Raio de busca"
                onPress={() => router.push('/configuracoes')}
              />
              <Tile
                palette={palette}
                icon="tv"
                value={String(sports.data?.length ?? 0)}
                label={sports.data?.length === 1 ? 'Esporte' : 'Esportes'}
                onPress={() => router.push('/configuracoes')}
              />
            </View>

            {next.length ? (
              <Card palette={palette} soft style={styles.next}>
                <Text
                  style={[
                    text(16, 'Bold'),
                    styles.nextTitle,
                    { color: palette.ink }
                  ]}
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
                    <Photo
                      uri={photoUrl}
                      name={barName}
                      palette={palette}
                      style={styles.nextPhoto}
                    />
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
              </Card>
            ) : null}

            {top.bars.length ? (
              <>
                <Heading
                  palette={palette}
                  title="Bares que você mais foi"
                  meta={top.label}
                />
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
                        palette={palette}
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
                        style={[
                          text(11.5),
                          { color: palette.muted, marginTop: -4 }
                        ]}
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
                  palette={palette}
                  title="Avaliações"
                  meta={`${pending.data.length} ${pending.data.length === 1 ? 'pendente' : 'pendentes'}`}
                />
                <Card palette={palette} soft>
                  <View style={styles.rows}>
                    {pending.data.slice(0, 3).map((item, i) => (
                      <Row
                        key={item.eventId}
                        palette={palette}
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

            <Card palette={palette} soft>
              <View style={styles.rows}>
                <Row
                  palette={palette}
                  first
                  icon="chat"
                  title="Ajuda e suporte"
                  onPress={help}
                />
                <Row
                  palette={palette}
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
  palette,
  icon,
  value,
  label,
  hot,
  onPress
}: {
  palette: Palette
  icon: 'fan' | 'ticket' | 'map' | 'tv'
  value: string
  label: string
  /** Jogo marcado hoje: a sombra vermelha do design. */
  hot?: boolean
  onPress: () => void
}) {
  return (
    <View style={styles.tile}>
      <Tap onPress={onPress}>
        <Card
          palette={palette}
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

function Heading({
  palette,
  title,
  meta
}: {
  palette: Palette
  title: string
  meta: string
}) {
  return (
    <View style={styles.heading}>
      <Text style={[text(16, 'Bold'), { color: palette.ink }]}>{title}</Text>
      <Text style={[text(12.5), { color: palette.muted }]}>{meta}</Text>
    </View>
  )
}

function Row({
  palette,
  first,
  icon,
  title,
  sub,
  action,
  onPress
}: {
  palette: Palette
  first?: boolean
  icon: 'star' | 'chat' | 'doc'
  title: string
  sub?: string
  /** Botão acid no fim ("Avaliar"); sem ele, a seta. */
  action?: string
  onPress: () => void
}) {
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 16 },
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
