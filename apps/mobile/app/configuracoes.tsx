import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import {
  type Href,
  Redirect,
  useLocalSearchParams,
  useRouter
} from 'expo-router'
import { type ReactNode, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Switch as NativeSwitch,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import MapView from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { initials, MeDot, RadiusCircle } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { LineList } from '@/components/game-line'
import { NAV, useLayout } from '@/components/layout'
import { haptic, ScalePress } from '@/components/motion'
import { MyFanCard } from '@/components/my-fan-card'
import { Segmented } from '@/components/segmented'
import { useSoon } from '@/components/soon'
import { usePalette } from '@/components/theme'
import {
  ACCENT,
  ACID,
  Icon,
  INK,
  LIVE,
  PAPER,
  Toggle as Switch,
  Text,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient, refreshSession } from '@/lib/auth-client'
import {
  AvatarError,
  pickSquarePhoto,
  removeAvatar,
  uploadAvatar
} from '@/lib/avatar'
import { HELP_URL } from '@/lib/env'
import { searchCenter, teamMark } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { deviceLabel, lastSeen, preferenceSummary } from '@/lib/settings'
import { trpc } from '@/lib/trpc'

/*
 * Configurações (11f–11i do design, escolhidas pelo dono em 20/10/2026):
 * Preferências, Avisos, Conta e Privacidade, abertas pela engrenagem do menu
 * "Você" e do Perfil. Preferências e Conta são de verdade (o mesmo servidor
 * do perfil e da conta no web), com a foto e a verificação em duas etapas
 * (WEB-419). Avisos segue o desenho com os controles desligados e o aviso de
 * "em breve" (o app não manda notificação); em Privacidade, "Aparecer no
 * ranking global" funciona (WEB-465), comunidades ainda não existem, e
 * "Baixar meus dados" manda o arquivo para o e-mail da conta (WEB-418).
 */

export type SettingsTab = 'preferencias' | 'avisos' | 'conta' | 'privacidade'
type Tab = SettingsTab
export const TABS: [Tab, string][] = [
  ['preferencias', 'Preferências'],
  ['avisos', 'Avisos'],
  ['conta', 'Conta'],
  ['privacidade', 'Privacidade']
]
const RADII = [1, 3, 5, 10]
/** Acima disso, Preferências e Privacidade em duas colunas (regra 05 da T5). */
const TWO_COLUMNS = 620
/** A coluna das Configurações fora do celular, centrada. */
const COLUMN = 760

/**
 * O corpo de uma seção, sem cabeçalho: na tela das Configurações e, no tablet
 * deitado e no dobrável aberto, à direita do menu "Você" (WEB-491).
 */
export function SettingsSection({
  tab,
  width,
  mapHeight,
  panel
}: {
  tab: Tab
  /** A largura da coluna: com mais de 620, duas colunas. */
  width: number
  mapHeight?: number
  /**
   * À direita do menu "Você" (o "Sair da conta" fica na lista); `tablet`
   * acrescenta o que o design põe a mais no tablet deitado: os avisos sob as
   * Preferências e as sessões sob a Privacidade (tabLand7).
   */
  panel?: 'tablet' | 'fold'
}) {
  const wide = width > TWO_COLUMNS
  const extras = panel === 'tablet'
  return tab === 'preferencias' ? (
    <>
      <Preferences
        wide={wide}
        mapHeight={mapHeight ?? (wide ? 150 : undefined)}
      />
      {extras ? <NoticesPreview /> : null}
    </>
  ) : tab === 'avisos' ? (
    <Notices wide={wide} />
  ) : tab === 'conta' ? (
    <Account leave={!panel} />
  ) : (
    <Privacy wide={wide} sessions={extras} intro={!!panel} />
  )
}

export default function Settings() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  useStatusBar('auto')
  const { aba } = useLocalSearchParams<{ aba?: Tab }>()
  const pick = (value?: string) =>
    TABS.some(([key]) => key === value) ? (value as Tab) : 'preferencias'
  const [tab, setTab] = useState<Tab>(pick(aba))
  // Aberta de novo com outra aba (a engrenagem com a tela já na pilha).
  const [seen, setSeen] = useState(aba)
  if (aba !== seen) {
    setSeen(aba)
    setTab(pick(aba))
  }
  // Fora do celular, uma coluna centrada; no tablet deitado e no dobrável
  // aberto, as seções ficam à direita do menu "Você" (regra 02 da T5).
  const { kind, width } = useLayout()
  const column = Math.min(
    width - (kind === 'duoClosed' ? NAV.duoRail.width : 0),
    COLUMN
  )
  if (kind === 'split')
    return <Redirect href={{ pathname: '/voce', params: { aba: tab } }} />

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
          // A faixa da direita do Duo fechado (status e Dynamic Island).
          kind === 'duoClosed' && { paddingRight: 16 + NAV.duoRail.width },
          width > COLUMN && { width: COLUMN, alignSelf: 'center' }
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          hitSlop={8}
          onPress={() => router.back()}
          style={[
            styles.close,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <Icon name="close" size={20} color={palette.ink} />
        </Pressable>
        <Text style={[styles.title, { color: palette.ink }]}>
          Configurações
        </Text>
        <Segmented
          small
          items={TABS.map(([key, label]) => ({ key, label }))}
          value={tab}
          onChange={setTab}
        />
        <SettingsSection tab={tab} width={column - 32} />
      </ScrollView>
    </View>
  )
}

// --- Preferências (11f) -----------------------------------------------------

function Preferences({
  wide,
  mapHeight = 92
}: {
  /** Esportes e raio lado a lado. */
  wide?: boolean
  mapHeight?: number
}) {
  const palette = usePalette()
  const router = useRouter()
  const state = useExploreState()
  const session = authClient.useSession()
  const sports = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const teams = useQuery(trpc.pubs.getMyTeams.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const saved = session.data?.user.searchRadiusKm ?? 3
  // O raio novo vale na hora; o servidor confirma por trás.
  const [picked, setPicked] = useState<number | null>(null)
  const radiusKm = picked ?? saved
  const center = searchCenter(state.device, city.data)
  const inRadius = useQuery({
    ...trpc.pubs.search.queryOptions({ ...center, radiusKm, limit: 50 }),
    placeholderData: keepPreviousData
  })
  const count = inRadius.data?.bars.length ?? 0
  const more = Boolean(inRadius.data?.nextCursor)

  const pickRadius = async (km: number) => {
    if (km === radiusKm) return
    haptic.select()
    setPicked(km)
    const result = await authClient.updateUser({ searchRadiusKm: km })
    if (result.error) {
      setPicked(null)
      Alert.alert('Não foi possível salvar o raio', 'Tente de novo.')
      return
    }
    await refreshSession()
    setPicked(null)
  }

  const summary = preferenceSummary({
    sports: (sports.data ?? []).map((p) => p.sport.name),
    teams: (teams.data ?? []).map((t) => t.name),
    radiusKm,
    place: state.district ?? city.data?.name ?? null
  })
  const radii = RADII.includes(saved) ? RADII : [...RADII, saved].sort()
  const editSports = () =>
    router.push({ pathname: '/onboarding/sports', params: { edit: '1' } })
  const editTeams = () =>
    router.push({ pathname: '/onboarding/teams', params: { edit: '1' } })

  // Celular (rodada 6): a carteirinha e o que ela mostra, campo a campo.
  if (!wide) {
    const teamNames = (teams.data ?? []).map((team) => team.name)
    const sportNames = (sports.data ?? []).map((p) => p.sport.name)
    return (
      <>
        <MyFanCard />
        <MenuBox>
          <MenuRow
            first
            icon="fan"
            title="Times"
            value={teamNames.length ? teamNames.join(' · ') : 'Escolher'}
            onPress={editTeams}
          />
          <MenuRow
            icon="futebol"
            title="Esportes"
            value={sportNames.length ? sportNames.join(', ') : 'Escolher'}
            onPress={editSports}
          />
          <MenuRow
            icon="map"
            title="Raio de busca"
            value={`${radiusKm} km`}
            onPress={() =>
              Alert.alert(
                'Raio de busca',
                `${count}${more ? '+' : ''} ${count === 1 ? 'bar' : 'bares'} em ${radiusKm} km`,
                [
                  ...radii.map((km) => ({
                    text: `${km} km`,
                    onPress: () => pickRadius(km)
                  })),
                  { text: 'Cancelar', style: 'cancel' as const }
                ]
              )
            }
          />
          <MenuRow
            icon="pin"
            title="Base"
            value={
              (state.device && state.district) || city.data?.name || 'Escolher'
            }
            onPress={() => router.push('/cidade' as Href)}
          />
        </MenuBox>
        <MenuBox>
          <ResetSuggestions menu />
          <MenuRow
            icon="you"
            title="Rever o passeio"
            value="30 s"
            onPress={() =>
              router.navigate({
                pathname: '/explore',
                params: { passeio: '1' }
              })
            }
          />
        </MenuBox>
      </>
    )
  }

  return (
    <>
      <SummaryCard>
        <Text style={[text(18, 'Regular', 1.45), { color: PAPER }]}>
          {summary.map((part, index) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: a frase não muda de ordem
              key={index}
              style={
                part.strong
                  ? [
                      text(18, 'Bold', 1.45),
                      {
                        color: ACID,
                        textDecorationLine: 'underline',
                        textDecorationColor: 'rgba(201,241,53,.45)'
                      }
                    ]
                  : undefined
              }
            >
              {part.text}
            </Text>
          ))}
        </Text>
        <ResetSuggestions inline />
      </SummaryCard>

      <View style={wide ? styles.columns : styles.stacked}>
        <View style={wide && styles.column}>
          <Card>
            <View style={styles.pad}>
              <View style={styles.cardHead}>
                <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                  Esportes e times
                </Text>
                <Text
                  accessibilityRole="button"
                  onPress={editSports}
                  suppressHighlighting
                  style={[
                    text(13, 'Bold'),
                    { color: palette.dark ? ACID : ACCENT }
                  ]}
                >
                  Editar
                </Text>
              </View>
              <View style={styles.chips}>
                {(sports.data ?? []).map((p) => (
                  <View key={p.sport.id} style={styles.sportChip}>
                    <Text style={[text(13, 'SemiBold', 1.2), { color: INK }]}>
                      {p.sport.name}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={[styles.teams, { borderTopColor: palette.line }]}>
                {(teams.data ?? []).map((team) => (
                  <View
                    key={team.id}
                    accessibilityLabel={team.name}
                    style={[styles.teamMark, { backgroundColor: palette.mark }]}
                  >
                    <Text style={[styles.teamText, { color: palette.ink }]}>
                      {teamMark(team.name)}
                    </Text>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Escolher times"
                  onPress={editTeams}
                  style={[styles.teamAdd, { borderColor: palette.dash }]}
                >
                  <Text
                    style={[text(20, 'Regular', 1), { color: palette.ink }]}
                  >
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          </Card>
        </View>

        <View style={wide && styles.column}>
          <Card>
            <View style={styles.pad}>
              <View style={styles.cardHead}>
                <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
                  Raio de busca
                </Text>
                <Text style={[text(12.5), { color: palette.muted }]}>
                  {count}
                  {more ? '+' : ''} {count === 1 ? 'bar' : 'bares'} no raio
                </Text>
              </View>
              <View style={[styles.radiusMap, { height: mapHeight }]}>
                <MapView
                  style={StyleSheet.absoluteFill}
                  region={{
                    latitude: center.lat,
                    longitude: center.lng,
                    // O círculo passa um pouco da altura do recorte, como no design.
                    latitudeDelta:
                      ((radiusKm * 2) / 111) * (mapHeight / (mapHeight + 28)),
                    longitudeDelta:
                      ((radiusKm * 2) / 111) * (mapHeight / (mapHeight + 28))
                  }}
                  mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
                  customMapStyle={
                    palette.dark ? MAP_STYLE.dark : MAP_STYLE.light
                  }
                  userInterfaceStyle={palette.dark ? 'dark' : 'light'}
                  showsPointsOfInterests={false}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  rotateEnabled={false}
                  pitchEnabled={false}
                  pointerEvents="none"
                >
                  <RadiusCircle
                    center={{ latitude: center.lat, longitude: center.lng }}
                    km={radiusKm}
                    dark={palette.dark}
                    strong
                  />
                </MapView>
                <View style={styles.radiusMe} pointerEvents="none">
                  <MeDot />
                </View>
              </View>
              <View style={[styles.segment, { backgroundColor: palette.mark }]}>
                {radii.map((km) => {
                  const on = km === radiusKm
                  return (
                    <Pressable
                      key={km}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${km} quilômetros`}
                      onPress={() => pickRadius(km)}
                      style={[
                        styles.segmentItem,
                        on && { backgroundColor: palette.dark ? ACID : INK }
                      ]}
                    >
                      <Text
                        style={[
                          styles.mono,
                          {
                            color: on
                              ? palette.dark
                                ? INK
                                : ACID
                              : palette.muted
                          }
                        ]}
                      >
                        {km} km
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </Card>
        </View>
      </View>
      {/* O passeio guiado mora aqui (dono, 10/11/2026), fora do menu Você. */}
      <Section icon="you" title="Como usar">
        <Row
          title="Rever o passeio"
          sub="Cinco passos pelo Explorar · 30 s"
          onPress={() =>
            router.navigate({ pathname: '/explore', params: { passeio: '1' } })
          }
          chevron
        />
      </Section>
    </>
  )
}

/** O cartão escuro da frase, com a sombra acid. */
function SummaryCard({ children }: { children: ReactNode }) {
  const palette = usePalette()
  return (
    <Card
      fill={palette.dark ? palette.card : INK}
      shadow="rgba(201,241,53,.85)"
      offset={5}
    >
      <View style={styles.summary}>{children}</View>
    </Card>
  )
}

/** "Recomeçar sugestões": esquece o que a pessoa dispensou e o que viu. */
function ResetSuggestions({
  inline,
  menu
}: {
  inline?: boolean
  /** Linha de menu da rodada 6. */
  menu?: boolean
}) {
  const queryClient = useQueryClient()
  const reset = useMutation(
    trpc.recommendations.reset.mutationOptions({
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries({
          queryKey: trpc.recommendations.get.queryKey()
        })
        Alert.alert(
          'Sugestões recomeçadas',
          'Seus esportes, raio e favoritos continuam.'
        )
      }
    })
  )
  const confirm = () =>
    Alert.alert(
      'Recomeçar sugestões?',
      'Os bares que você dispensou podem voltar a aparecer. Esportes, raio e favoritos continuam.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Recomeçar', onPress: () => reset.mutate() }
      ]
    )
  if (menu)
    return (
      <MenuRow
        first
        icon="heart"
        title="Recomeçar sugestões"
        onPress={confirm}
      />
    )
  if (inline)
    return (
      <View style={styles.summaryFoot}>
        <View style={styles.summaryNote}>
          <Icon name="sparkle" size={14} color="#aaa9a4" accent={ACID} />
          <Text style={[text(12.5), { color: '#aaa9a4' }]}>
            Usado nas sugestões
          </Text>
        </View>
        <Text
          accessibilityRole="button"
          onPress={confirm}
          suppressHighlighting
          style={[text(12.5, 'Bold'), { color: PAPER }]}
        >
          Recomeçar sugestões
        </Text>
      </View>
    )
  return (
    <Row
      title="Recomeçar sugestões"
      sub="Mantém esportes, raio e favoritos"
      onPress={confirm}
      chevron
    />
  )
}

// --- Avisos (11g) -----------------------------------------------------------

/** Os grupos de Avisos (11g), desenhados e desligados: o app não manda aviso. */
function useNoticeGroups() {
  const palette = usePalette()
  const games = (
    <Section icon="tv" title="Jogos">
      <Row
        title="Meus times vão jogar"
        sub="Aviso antes do jogo, com bares perto passando"
        extra={
          <View style={styles.leads}>
            {['30 min', '1 h', '3 h'].map((lead) => (
              <View
                key={lead}
                style={[
                  styles.lead,
                  lead === '1 h'
                    ? { backgroundColor: palette.dark ? ACID : INK }
                    : { borderColor: palette.line, borderWidth: 1 }
                ]}
              >
                <Text
                  style={[
                    styles.monoSmall,
                    {
                      color:
                        lead === '1 h'
                          ? palette.dark
                            ? INK
                            : ACID
                          : palette.muted
                    }
                  ]}
                >
                  {lead}
                </Text>
              </View>
            ))}
          </View>
        }
        right={<Toggle on />}
      />
      <Row title="Clássicos perto de você" right={<Toggle on />} divided />
    </Section>
  )
  const going = (
    <Section icon="ticket" title="Vou assistir">
      <Row
        title="Lembrete do jogo marcado"
        sub="Sempre ligado enquanto houver jogo marcado"
        right={
          <Text style={[text(12.5, 'Bold'), { color: palette.muted }]}>
            Sempre
          </Text>
        }
      />
    </Section>
  )
  const friends = (
    <Section icon="people" title="Amigos e comunidades">
      <Row title="Pedidos de amizade" right={<Toggle on />} />
      <Row title="Amigo vai ao mesmo jogo" right={<Toggle on />} divided />
      <Row
        title="Ranking do mês fechou"
        right={<Toggle on={false} />}
        divided
      />
    </Section>
  )
  const mute = (
    <View>
      <View style={[styles.hardShadow, { backgroundColor: INK }]} />
      <View style={styles.mute}>
        <Icon name="sound" size={22} color={INK} accent={INK} />
        <View style={{ flex: 1 }}>
          <Text style={[text(15, 'Bold'), { color: INK }]}>
            Silenciar durante o jogo
          </Text>
          <Text style={[text(12.5, 'Regular', 1.35), { color: INK }]}>
            Nada de aviso entre o apito inicial e o final.
          </Text>
        </View>
        {/* Sobre o acid a tinta fica tinta nos dois temas. */}
        <Switch on off={INK} />
      </View>
    </View>
  )
  return { games, going, friends, mute }
}

function Notices({ wide }: { wide?: boolean }) {
  const palette = usePalette()
  const { games, going, friends, mute } = useNoticeGroups()
  // Celular (rodada 6, tela 6a): os avisos do desenho, desligados até o push
  // (WEB-416) e as preferências no servidor existirem.
  if (!wide) {
    const row = (title: string, sub?: string, on = true) => ({ title, sub, on })
    const group = (label: string, rows: ReturnType<typeof row>[]) => (
      <>
        <Text style={[styles.groupLabel, { color: palette.muted }]}>
          {label}
        </Text>
        <MenuBox>
          {rows.map((item, index) => (
            <View
              key={item.title}
              style={[
                styles.noticeRow,
                index > 0 && { borderTopWidth: 1, borderTopColor: palette.line }
              ]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[text(15.5, 'SemiBold', 1.3), { color: palette.ink }]}
                >
                  {item.title}
                </Text>
                {item.sub ? (
                  <Text
                    style={[
                      text(13, 'Regular', 1.35),
                      { color: palette.muted }
                    ]}
                  >
                    {item.sub}
                  </Text>
                ) : null}
              </View>
              <Switch6 on={item.on} />
            </View>
          ))}
        </MenuBox>
      </>
    )
    return (
      <>
        <View style={styles.pushSoon}>
          <Icon name="bell" size={24} color={INK} accent={INK} />
          <View style={{ flex: 1 }}>
            <Text style={[text(15.5, 'Bold', 1.3), { color: INK }]}>
              Avisos no celular chegam em breve
            </Text>
            <Text style={[text(13.5, 'Regular', 1.35), { color: INK }]}>
              Até lá, o que é seu aparece no sino do Explorar.
            </Text>
          </View>
        </View>
        <Off>
          {group('Jogos', [
            row(
              'Jogo dos seus times num bar perto',
              'quando um bar marcar no seu raio'
            ),
            row('Lembrete do jogo', '3 h antes, se você marcou “Vou assistir”'),
            row('Oferta liberada', 'quando o balcão validar o seu código')
          ])}
          {group('Amigos', [
            row(
              'Chamado para um jogo',
              'quando um amigo te chamar para um jogo'
            ),
            row('Pedidos de amizade'),
            row('Conquistas dos amigos', undefined, false)
          ])}
        </Off>
      </>
    )
  }
  return (
    <>
      <SoonNote sentence="Os avisos no celular chegam em breve. Até lá, o que é seu aparece no sino do Explorar." />
      <Off>
        {games}
        {going}
        {friends}
        {mute}
      </Off>
    </>
  )
}

/**
 * Os avisos por baixo das Preferências no tablet deitado (extraPref7 do
 * design): jogos e amigos lado a lado, e o silenciar embaixo. Desligados
 * como na seção Avisos.
 */
function NoticesPreview() {
  const palette = usePalette()
  const { games, friends, mute } = useNoticeGroups()
  return (
    <>
      <View style={styles.previewHead}>
        <Text
          style={[styles.previewTitle, { color: palette.dark ? ACID : ACCENT }]}
        >
          Avisos
        </Text>
        <Text style={[text(12.5), { color: palette.muted }]}>
          também em Configurações › Avisos
        </Text>
      </View>
      <Off>
        <View style={styles.columns}>
          <View style={styles.column}>{games}</View>
          <View style={styles.column}>{friends}</View>
        </View>
        {mute}
      </Off>
    </>
  )
}

// --- Conta (11h) ------------------------------------------------------------

function Account({ leave = true }: { leave?: boolean }) {
  const palette = usePalette()
  const router = useRouter()
  const session = authClient.useSession()
  const user = session.data?.user
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const queryClient = useQueryClient()
  const me = useQuery(trpc.friends.me.queryOptions())
  const username = useMutation(
    trpc.friends.updateUsername.mutationOptions({
      onSuccess: () => {
        haptic.success()
        queryClient.invalidateQueries({ queryKey: trpc.friends.pathKey() })
      },
      onError: (error) => {
        haptic.error()
        Alert.alert('Não foi possível trocar o @', error.message)
      }
    })
  )
  const editUsername = () =>
    Alert.prompt(
      'Seu @',
      'É como seus amigos te acham. Letras, números, ponto ou sublinhado.',
      (typed) => {
        const next = typed?.trim().replace(/^@/, '')
        if (!next || next === me.data?.username) return
        username.mutate({ username: next })
      },
      'plain-text',
      me.data?.username ?? ''
    )

  const rename = () =>
    Alert.prompt(
      'Seu nome',
      'É como você aparece na Onside.',
      async (name) => {
        const trimmed = name?.trim()
        if (!trimmed || trimmed === user?.name) return
        const result = await authClient.updateUser({ name: trimmed })
        if (result.error)
          return Alert.alert('Não foi possível salvar o nome', 'Tente de novo.')
        haptic.success()
        await refreshSession()
      },
      'plain-text',
      user?.name ?? ''
    )

  const [photoBusy, setPhotoBusy] = useState(false)
  // Com foto nova o véu fica até a imagem baixar (`onLoad` do `Image`): a URL
  // é remota e o upload termina antes de ela aparecer.
  const photoTask = async (
    task: () => Promise<unknown>,
    waitsForImage = false
  ) => {
    setPhotoBusy(true)
    try {
      await task()
      haptic.success()
      if (waitsForImage) return
    } catch (error) {
      haptic.error()
      Alert.alert(
        'Foto do perfil',
        error instanceof AvatarError
          ? error.message
          : 'Não foi possível trocar a foto. Tente de novo.'
      )
    }
    setPhotoBusy(false)
  }
  // O spinner só depois da escolha: com o seletor aberto ele ficaria por
  // trás, rodando à toa.
  const choose = async (source: 'library' | 'camera') => {
    const uri = await pickSquarePhoto(source).catch(() => null)
    if (uri) await photoTask(() => uploadAvatar(uri), true)
  }
  const changePhoto = () =>
    Alert.alert('Foto do perfil', undefined, [
      { text: 'Escolher uma foto', onPress: () => choose('library') },
      { text: 'Tirar uma foto', onPress: () => choose('camera') },
      ...(user?.image
        ? [
            {
              text: 'Remover a foto',
              style: 'destructive' as const,
              onPress: () => photoTask(removeAvatar)
            }
          ]
        : []),
      { text: 'Cancelar', style: 'cancel' as const }
    ])

  const sessions = useSessions()
  const leaveActions = useLeaveActions()
  const devices = sessions.data?.length

  return (
    <>
      <View style={styles.me}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Trocar a foto"
          disabled={photoBusy}
          onPress={changePhoto}
          style={styles.avatar}
        >
          {user?.image ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: user.image }}
              style={styles.avatarPhoto}
              onLoad={() => setPhotoBusy(false)}
              onError={() => setPhotoBusy(false)}
            />
          ) : (
            <Text style={styles.avatarText}>{initials(user?.name ?? '')}</Text>
          )}
          {photoBusy ? (
            <View style={styles.avatarBusy}>
              <ActivityIndicator color={PAPER} />
            </View>
          ) : null}
        </Pressable>
        <ScalePress
          accessibilityRole="button"
          disabled={photoBusy}
          onPress={changePhoto}
        >
          <View style={[styles.ghost, { borderColor: palette.line }]}>
            <Text style={[text(15, 'Bold', 1.2), { color: palette.ink }]}>
              Trocar foto
            </Text>
          </View>
        </ScalePress>
      </View>

      <MenuBox>
        <MenuRow
          first
          icon="person"
          title="Nome"
          value={user?.name}
          onPress={rename}
        />
        <MenuRow
          icon="link"
          title="@usuário"
          value={me.data?.username}
          onPress={editUsername}
        />
        <MenuRow
          icon="pin"
          title="Cidade"
          value={city.data?.name ?? 'Escolher'}
          onPress={() => router.push('/cidade' as Href)}
        />
      </MenuBox>

      <MenuBox>
        <MenuRow
          first
          icon="lock"
          title="Senha"
          onPress={() => router.push('/senha' as Href)}
        />
        <MenuRow
          icon="shield"
          title="Duas etapas"
          value={user?.twoFactorEnabled ? 'ligada' : 'desligada'}
          on={!!user?.twoFactorEnabled}
          onPress={() => router.push('/duas-etapas' as Href)}
        />
        <MenuRow
          icon="eye"
          title="Aparelhos"
          value={
            devices
              ? `${devices} ${devices === 1 ? 'conectado' : 'conectados'}`
              : undefined
          }
          onPress={() => router.push('/aparelhos' as Href)}
        />
      </MenuBox>

      {/* A Ajuda do desenho mora aqui (dono, 10/11/2026), como "Suporte". */}
      <MenuBox>
        <MenuRow
          first
          icon="chat"
          title="Suporte"
          value="por e-mail"
          onPress={() => Linking.openURL(HELP_URL).catch(() => {})}
        />
      </MenuBox>

      {leave ? (
        <>
          <MenuBox>
            <MenuRow
              first
              icon="back"
              title="Sair da conta"
              onPress={leaveActions.signOut}
            />
          </MenuBox>
          <Text
            accessibilityRole="button"
            onPress={leaveActions.deleteAccount}
            suppressHighlighting
            style={[styles.danger, { color: palette.muted }]}
          >
            Excluir a conta
          </Text>
        </>
      ) : null}
    </>
  )
}

/** Os aparelhos com a conta aberta (a lista pede login de menos de um dia). */
function useSessions() {
  return useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return result.data ?? []
    }
  })
}

/** "Sessões ativas": os aparelhos com a conta aberta; os outros saem daqui. */
export function Sessions() {
  const palette = usePalette()
  const router = useRouter()
  const session = authClient.useSession()
  const user = session.data?.user
  const sessions = useSessions()
  const now = Date.now()
  const current = session.data?.session.id
  const revoke = (id: string, name: string) =>
    Alert.alert(
      `Sair do ${name}?`,
      'Esse aparelho vai precisar entrar de novo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            await authClient
              .$fetch('/revoke-session-by-id', { method: 'POST', body: { id } })
              .catch(() => {})
            sessions.refetch()
          }
        }
      ]
    )

  return (
    <Section icon="lock" title="Sessões ativas">
      {sessions.isPending ? (
        <ActivityIndicator style={{ padding: 18 }} color={palette.muted} />
      ) : sessions.isError ? (
        // A lista pede login recente (`freshAge` do better-auth, um dia).
        <Row
          title="Entre de novo para ver"
          sub="Por segurança, a lista dos aparelhos pede um login recente."
          right={
            <Text
              accessibilityRole="button"
              onPress={async () => {
                const email = user?.email
                await authClient.signOut()
                router.replace({ pathname: '/sign-in', params: { email } })
              }}
              suppressHighlighting
              style={[
                text(13.5, 'Bold'),
                { color: palette.dark ? ACID : ACCENT }
              ]}
            >
              Entrar
            </Text>
          }
        />
      ) : (
        [...(sessions.data ?? [])]
          .sort(
            (a, b) =>
              Number(b.id === current) - Number(a.id === current) ||
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )
          .map((item, index) => {
            const device = deviceLabel(item.userAgent)
            const mine = item.id === current
            return (
              <Row
                key={item.id}
                icon={device.computer ? 'tv' : 'you'}
                title={device.name}
                sub={mine ? 'agora' : lastSeen(item.updatedAt, now)}
                divided={index > 0}
                right={
                  mine ? (
                    <Badge>Este aparelho</Badge>
                  ) : (
                    <Text
                      accessibilityRole="button"
                      onPress={() => revoke(item.id, device.name)}
                      suppressHighlighting
                      style={[text(13.5, 'Bold'), { color: LIVE }]}
                    >
                      Sair
                    </Text>
                  )
                }
              />
            )
          })
      )}
    </Section>
  )
}

/** "Sair da conta" e "Excluir conta", no fim da Conta e à esquerda do "Você" deitado. */
function useLeaveActions() {
  const router = useRouter()
  const signOut = () =>
    Alert.alert('Sair da conta?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await authClient.signOut()
          router.replace('/explore')
        }
      }
    ])
  const deleteAccount = () =>
    Alert.alert(
      'Excluir a conta?',
      'Seus jogos, conquistas, favoritos e avaliações somem e não voltam.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () =>
            Alert.prompt(
              'Confirme com a senha',
              undefined,
              async (password) => {
                if (!password) return
                const result = await authClient.deleteUser({ password })
                if (result.error)
                  return Alert.alert(
                    'Não foi possível excluir',
                    result.error.message ?? 'Confira a senha e tente de novo.'
                  )
                router.replace('/explore')
              },
              'secure-text'
            )
        }
      ]
    )
  return { signOut, deleteAccount }
}

/** "Sair da conta" e "Excluir conta", à esquerda do "Você" deitado. */
export function LeaveAccount() {
  const palette = usePalette()
  const { signOut, deleteAccount } = useLeaveActions()
  return (
    <View style={styles.leave}>
      <Text
        accessibilityRole="button"
        onPress={signOut}
        suppressHighlighting
        style={[text(16, 'Bold'), { color: palette.ink }]}
      >
        Sair da conta
      </Text>
      <Text
        accessibilityRole="button"
        onPress={deleteAccount}
        suppressHighlighting
        style={[text(16, 'Bold'), { color: LIVE }]}
      >
        Excluir conta
      </Text>
    </View>
  )
}

// --- Privacidade (11i) ------------------------------------------------------

const SEES = { everyone: 'Todos', friends: 'Amigos', nobody: 'Ninguém' }
const ADDS = {
  everyone: 'Todos',
  friends_of_friends: 'Amigos de amigos',
  nobody: 'Ninguém'
}
/** A chave da opção pelo rótulo que a pessoa tocou. */
const keyOf = <T extends Record<string, string>>(map: T, label: string) =>
  (Object.keys(map) as (keyof T)[]).find((key) => map[key] === label) as keyof T

function Privacy({
  wide,
  sessions,
  intro
}: {
  wide?: boolean
  /** Ao lado do menu "Você": a frase de quem vê no topo (privBody7). */
  intro?: boolean
  /** As sessões ativas embaixo, na coluna da esquerda (tablet deitado). */
  sessions?: boolean
}) {
  const palette = usePalette()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const me = useQuery(trpc.friends.me.queryOptions())
  const board = useQuery(trpc.ranking.friends.queryOptions({ metric: 'bars' }))
  const monthBars = board.data?.rows.find(
    (row) => row.id === session.data?.user.id
  )?.value
  const soonToast = useSoon()
  // Otimista: a escolha aparece na hora e volta se o servidor recusar.
  const save = useMutation(
    trpc.friends.updatePrivacy.mutationOptions({
      onMutate: (input) => {
        const key = trpc.friends.me.queryKey()
        const before = queryClient.getQueryData(key)
        if (before) queryClient.setQueryData(key, { ...before, ...input })
        return { before }
      },
      onError: (_, __, context) => {
        haptic.error()
        if (context?.before)
          queryClient.setQueryData(trpc.friends.me.queryKey(), context.before)
        Alert.alert('Não foi possível salvar', 'Tente de novo.')
      },
      // O ranking global e "Onde você foi" decidem quem entra na lista da cidade.
      onSettled: () =>
        queryClient.invalidateQueries({
          queryKey: trpc.ranking.city.pathKey()
        })
    })
  )
  const exportData = useMutation(
    trpc.account.requestExport.mutationOptions({
      onSuccess: ({ email }) => {
        haptic.success()
        Alert.alert(
          'Arquivo enviado',
          `Mandamos seus dados para ${email}. Pode levar alguns minutos para chegar.`
        )
      },
      // A recusa do limite diário já chega escrita para quem usa.
      onError: (error) => {
        haptic.error()
        if (error.data?.code === 'TOO_MANY_REQUESTS') {
          Alert.alert('Arquivo já pedido', error.message)
        } else {
          Alert.alert('Não foi possível enviar', 'Tente de novo em instantes.')
        }
      }
    })
  )
  const where = (
    <Section icon="pin" title="Onde você foi">
      <Row
        title="Quem vê os bares que você validou"
        sub="Também vale para jogos marcados"
        extra={
          <Choice
            options={Object.values(SEES)}
            on={SEES[me.data?.activityVisibility ?? 'friends']}
            onPick={(label) =>
              save.mutate({ activityVisibility: keyOf(SEES, label) })
            }
          />
        }
      />
      <Row
        title="Quem pode te adicionar"
        divided
        extra={
          <Choice
            options={Object.values(ADDS)}
            on={ADDS[me.data?.friendRequestsFrom ?? 'everyone']}
            onPick={(label) =>
              save.mutate({ friendRequestsFrom: keyOf(ADDS, label) })
            }
          />
        }
      />
    </Section>
  )
  const rest = (
    <>
      <Section icon="ranking" title="Ranking">
        <Row
          title="Aparecer no ranking global"
          sub="Só nome, @usuário e número"
          right={<Toggle on={!!me.data?.rankingGlobal} />}
          checked={!!me.data?.rankingGlobal}
          onPress={
            me.data
              ? () => {
                  haptic.select()
                  save.mutate({ rankingGlobal: !me.data.rankingGlobal })
                }
              : undefined
          }
        />
        <Off>
          <Row
            title="Mostrar comunidades no perfil"
            right={<Toggle on={false} />}
            divided
          />
        </Off>
      </Section>
      <Section icon="doc" title="Seus dados">
        <Row
          title="Baixar meus dados"
          sub={
            exportData.isPending
              ? 'Enviando o arquivo…'
              : 'Arquivo enviado por e-mail'
          }
          chevron
          onPress={() => {
            if (!exportData.isPending) exportData.mutate()
          }}
        />
        <View style={[styles.divider, { backgroundColor: palette.line }]} />
        <ResetSuggestions />
      </Section>
    </>
  )
  // Largo: o aviso por cima e os grupos em duas colunas (regra 05 da T5).
  // Largo: a frase de quem vê no lugar do aviso, os grupos em duas colunas
  // (regra 05 da T5) e, no tablet deitado, as sessões. Bloqueados do design
  // não existem no produto.
  if (wide)
    return (
      <>
        <WhoSees
          visibility={me.data?.activityVisibility}
          ranking={!!me.data?.rankingGlobal}
        />
        <View style={styles.columns}>
          <View style={styles.column}>{where}</View>
          <View style={styles.column}>{rest}</View>
        </View>
        {sessions ? (
          <View style={styles.columns}>
            <View style={styles.column}>
              <Sessions />
            </View>
            <View style={styles.column} />
          </View>
        ) : null}
      </>
    )
  const whoSees = (
    <WhoSees
      visibility={me.data?.activityVisibility}
      ranking={!!me.data?.rankingGlobal}
    />
  )
  if (intro && !wide)
    return (
      <>
        {whoSees}
        {where}
        {rest}
      </>
    )
  const pick = <T extends Record<string, string>>(
    title: string,
    map: T,
    apply: (key: keyof T) => void
  ) =>
    Alert.alert(title, undefined, [
      ...Object.entries(map).map(([key, label]) => ({
        text: label,
        onPress: () => {
          haptic.select()
          apply(key as keyof T)
        }
      })),
      { text: 'Cancelar', style: 'cancel' as const }
    ])
  const listed = !!me.data?.rankingGlobal
  return (
    <>
      <MenuBox>
        <MenuRow
          first
          icon="eye"
          title="Onde você foi"
          value={SEES[me.data?.activityVisibility ?? 'friends']}
          onPress={() =>
            pick('Quem vê os bares e jogos onde você foi', SEES, (key) =>
              save.mutate({ activityVisibility: key })
            )
          }
        />
        <MenuRow
          icon="userplus"
          title="Quem pode te adicionar"
          value={ADDS[me.data?.friendRequestsFrom ?? 'everyone']}
          onPress={() =>
            pick('Quem pode te adicionar', ADDS, (key) =>
              save.mutate({ friendRequestsFrom: key })
            )
          }
        />
      </MenuBox>
      <ScalePress
        accessibilityRole="switch"
        accessibilityState={{ checked: listed }}
        to={0.985}
        disabled={!me.data}
        onPress={() => {
          haptic.select()
          save.mutate({ rankingGlobal: !listed })
        }}
      >
        <View
          style={[
            styles.toggleCard,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(14.5, 'SemiBold', 1.3), { color: palette.ink }]}>
              Aparecer no ranking da cidade
            </Text>
            <Text
              style={[text(12.5, 'Regular', 1.35), { color: palette.muted }]}
            >
              {me.data
                ? `Aparece assim: ${session.data?.user.name ?? ''} · @${me.data.username}${monthBars === undefined ? '' : ` · ${monthBars}`}`
                : ' '}
            </Text>
          </View>
          <Switch6
            on={listed}
            onChange={(next) => {
              haptic.select()
              save.mutate({ rankingGlobal: next })
            }}
          />
        </View>
      </ScalePress>
      <MenuBox>
        <MenuRow
          first
          icon="doc"
          title="Baixar meus dados"
          value={exportData.isPending ? 'enviando…' : 'por e-mail'}
          onPress={() => {
            if (!exportData.isPending) exportData.mutate()
          }}
        />
        <MenuRow
          icon="crew"
          title="Comunidades"
          value="em breve"
          onPress={() => soonToast.show('Comunidades chegam em breve.')}
        />
      </MenuBox>
      {soonToast.toast}
    </>
  )
}

/**
 * "Hoje seus amigos veem onde você foi. O ranking global mostra só nome e
 * número." (11i largo): a frase do design pelo que a pessoa escolheu, sem as
 * comunidades, que não existem.
 */
function WhoSees({
  visibility,
  ranking
}: {
  visibility?: keyof typeof SEES
  ranking: boolean
}) {
  const palette = usePalette()
  const strong = [text(13.5, 'Bold', 1.4), { color: palette.ink }]
  return (
    <Card shadow={palette.liveShadow}>
      <View style={styles.whoSees}>
        <Icon name="eye" size={26} color={palette.ink} accent={LIVE} />
        <Text
          style={[text(13.5, 'Regular', 1.4), { color: palette.ink, flex: 1 }]}
        >
          {visibility === 'everyone' ? (
            <>
              Hoje <Text style={strong}>todos</Text> veem onde você foi.
            </>
          ) : visibility === 'nobody' ? (
            <>
              Hoje <Text style={strong}>ninguém</Text> vê onde você foi.
            </>
          ) : (
            <>
              Hoje seus <Text style={strong}>amigos</Text> veem onde você foi.
            </>
          )}{' '}
          {ranking
            ? 'O ranking global mostra só nome e número.'
            : 'Você não aparece no ranking global.'}
        </Text>
      </View>
    </Card>
  )
}

// --- Peças ------------------------------------------------------------------

/** O que ainda não existe: visível como no design, mas sem toque. */
function Off({ children }: { children: ReactNode }) {
  return (
    <View
      style={{ opacity: 0.5, gap: 12 }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </View>
  )
}

/** O aviso de "em breve" no lugar do texto do design. */
function SoonNote({
  sentence,
  icon = 'bell'
}: {
  sentence: string
  icon?: 'bell' | 'eye'
}) {
  const palette = usePalette()
  return (
    <Card shadow="rgba(232,50,12,.28)">
      <View style={styles.soon}>
        <Icon name={icon} size={24} color={palette.ink} />
        <Text
          style={[text(14.5, 'Regular', 1.45), { color: palette.ink, flex: 1 }]}
        >
          {sentence}
        </Text>
      </View>
    </Card>
  )
}

/** O cartão das linhas de menu (`.box6`). */
function MenuBox({ children }: { children: ReactNode }) {
  return <LineList>{children}</LineList>
}

/**
 * Linha de menu da rodada 6 (`.mi6`): ícone, nome, o valor em mono (ou a
 * pílula acid de "ligada") e a seta.
 */
function MenuRow({
  icon,
  title,
  value,
  on,
  first,
  onPress
}: {
  icon: Parameters<typeof Icon>[0]['name']
  title: string
  value?: string
  /** O valor na pílula acid (`.v.a`). */
  on?: boolean
  first?: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <ScalePress accessibilityRole="button" to={0.985} onPress={onPress}>
      <View
        style={[
          styles.menuRow,
          !first && { borderTopWidth: 1, borderTopColor: palette.line }
        ]}
      >
        <Icon
          name={icon}
          size={22}
          color={palette.ink}
          accent={palette.dark ? ACID : ACCENT}
        />
        <Text
          numberOfLines={1}
          style={[text(15, 'SemiBold', 1.2), { color: palette.ink }]}
        >
          {title}
        </Text>
        <View style={styles.menuValue}>
          {value ? (
            <Text
              numberOfLines={1}
              style={[
                styles.menuMono,
                on ? styles.menuOn : { color: palette.muted, flexShrink: 1 }
              ]}
            >
              {value}
            </Text>
          ) : null}
        </View>
        <Icon name="next" size={16} color={palette.muted} />
      </View>
    </ScalePress>
  )
}

/**
 * Interruptor do design (`.sw`): o `Switch` nativo do iOS, trilho acid e
 * bolinha tinta nos dois temas (a spec da rodada 6 pede o do sistema).
 */
function Switch6({
  on,
  onChange
}: {
  on: boolean
  /** Sem ele, só desenha (o que ainda não existe). */
  onChange?: (next: boolean) => void
}) {
  const palette = usePalette()
  return (
    <NativeSwitch
      value={on}
      disabled={!onChange}
      onValueChange={onChange}
      trackColor={{ false: palette.mark, true: ACID }}
      thumbColor={on ? INK : '#ffffff'}
      ios_backgroundColor={palette.mark}
    />
  )
}

function Section({
  icon,
  title,
  children
}: {
  icon: Parameters<typeof Icon>[0]['name']
  title: string
  children: ReactNode
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={palette.ink} />
        <Text style={[text(13, 'Bold'), { color: palette.ink }]}>{title}</Text>
      </View>
      <Card>
        <View style={{ paddingHorizontal: 14 }}>{children}</View>
      </Card>
    </View>
  )
}

function Row({
  icon,
  title,
  sub,
  value,
  right,
  extra,
  chevron,
  divided,
  checked,
  onPress
}: {
  icon?: 'tv' | 'you'
  title: string
  sub?: string
  value?: string
  right?: ReactNode
  extra?: ReactNode
  chevron?: boolean
  divided?: boolean
  /** Linha de interruptor: o leitor de tela ouve "ligado" ou "desligado". */
  checked?: boolean
  onPress?: () => void
}) {
  const palette = usePalette()
  const body = (
    <View
      style={[
        styles.row,
        divided && { borderTopWidth: 1, borderTopColor: palette.line }
      ]}
    >
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={22} color={palette.ink} accent={ACID} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[text(15, 'Regular', 1.3), { color: palette.ink }]}>
          {title}
        </Text>
        {sub ? (
          <Text style={[text(12.5, 'Regular', 1.35), { color: palette.muted }]}>
            {sub}
          </Text>
        ) : null}
        {extra}
      </View>
      {value ? (
        <Text
          numberOfLines={1}
          style={[text(14), { color: palette.muted, flexShrink: 1 }]}
        >
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <Icon name="next" size={14} color={palette.muted} /> : null}
    </View>
  )
  if (!onPress) return body
  return (
    <ScalePress
      accessibilityRole={checked === undefined ? 'button' : 'switch'}
      accessibilityState={checked === undefined ? undefined : { checked }}
      to={0.985}
      onPress={onPress}
    >
      {body}
    </ScalePress>
  )
}

/**
 * Ligado: trilho de tinta e bolinha acid no claro. No escuro a tinta some no
 * card, então o trilho vira acid e a bolinha tinta, como nos interruptores
 * de Filtros, Bares pra você e duas etapas.
 */
function Toggle({ on }: { on: boolean }) {
  const palette = usePalette()
  return (
    <Switch
      on={on}
      off={palette.mark}
      track={palette.dark ? ACID : INK}
      knob={palette.dark ? INK : ACID}
    />
  )
}

function Choice({
  options,
  on,
  onPick
}: {
  options: string[]
  on: string
  /** Sem ele, só desenha (o que ainda não existe). */
  onPick?: (option: string) => void
}) {
  const palette = usePalette()
  return (
    <View style={[styles.choice, { backgroundColor: palette.mark }]}>
      {options.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="button"
          accessibilityState={{ selected: option === on }}
          disabled={!onPick || option === on}
          onPress={() => {
            haptic.select()
            onPick?.(option)
          }}
          style={[
            styles.choiceItem,
            option === on && { backgroundColor: palette.dark ? ACID : INK }
          ]}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[
              text(14, option === on ? 'Bold' : 'Regular', 1.2),
              {
                color:
                  option === on ? (palette.dark ? INK : PAPER) : palette.muted
              }
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function Badge({ children }: { children: string }) {
  return (
    <View style={styles.badge}>
      <Text style={[text(12.5, 'Bold', 1.2), { color: INK }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 16, gap: 12 },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  // Anton 40: margem negativa no lugar do entrelinha curto.
  title: {
    fontFamily: 'Anton',
    fontSize: 40,
    textTransform: 'uppercase',
    marginVertical: -9.7
  },
  summary: { paddingTop: 15, paddingBottom: 13, paddingHorizontal: 16 },
  summaryFoot: {
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.14)',
    flexDirection: 'row',
    // Na fonte grande o botão desce para a linha de baixo.
    flexWrap: 'wrap',
    rowGap: 6,
    columnGap: 12,
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pad: { padding: 14 },
  whoSees: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14
  },
  previewHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 4
  },
  previewTitle: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase'
  },
  // Duas colunas que não esticam: cada cartão na própria altura.
  columns: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0, gap: 12 },
  stacked: { gap: 12 },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  sportChip: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 5,
    justifyContent: 'center',
    backgroundColor: ACID,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
    marginRight: 3,
    marginBottom: 3
  },
  teams: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1
  },
  teamMark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  teamText: {
    fontFamily: 'Anton',
    fontSize: 15,
    letterSpacing: 0.3,
    marginVertical: -4
  },
  teamAdd: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center'
  },
  radiusMap: {
    height: 92,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 12
  },
  radiusMe: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  segment: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
    padding: 4,
    borderRadius: 6
  },
  segmentItem: {
    flex: 1,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 14 },
  monoSmall: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  groupLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    letterSpacing: 1.04,
    textTransform: 'uppercase',
    marginTop: 6
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14
  },
  pushSoon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: ACID,
    shadowColor: '#8fae1e',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  menuRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  menuValue: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
  menuMono: { fontFamily: 'GeistMono-SemiBold', fontSize: 12.5 },
  menuOn: {
    color: INK,
    backgroundColor: ACID,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden'
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 2,
    marginTop: 4
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 8
  },
  rowIcon: { width: 28, alignItems: 'center' },
  divider: { height: 1 },
  leads: { flexDirection: 'row', gap: 6, marginTop: 8 },
  lead: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 4 },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    padding: 3,
    flexDirection: 'row'
  },
  knob: { width: 24, height: 24, borderRadius: 12 },
  hardShadow: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6
  },
  mute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: ACID
  },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { fontFamily: 'Archivo-Bold', fontSize: 22, color: INK },
  avatarPhoto: { width: 60, height: 60 },
  avatarBusy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,18,15,.45)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  ghost: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  danger: {
    ...text(14, 'SemiBold'),
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingVertical: 8
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 3,
    backgroundColor: ACID
  },
  leave: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 6
  },
  soon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16
  },
  choice: { flexDirection: 'row', marginTop: 10, padding: 4, borderRadius: 6 },
  choiceItem: {
    flex: 1,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4
  }
})
