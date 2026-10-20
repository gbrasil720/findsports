import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import { type ReactNode, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import MapView from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import {
  initials,
  MeDot,
  type Palette,
  RadiusCircle,
  usePalette
} from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { haptic, ScalePress } from '@/components/motion'
import { useSoon } from '@/components/soon'
import {
  ACCENT,
  ACID,
  GlassRound,
  Icon,
  INK,
  LIVE,
  PAPER,
  text,
  useStatusBar
} from '@/components/ui'
import { authClient, refreshSession } from '@/lib/auth-client'
import { searchCenter, teamMark } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { memberSince } from '@/lib/profile'
import { deviceLabel, lastSeen, preferenceSummary } from '@/lib/settings'
import { trpc } from '@/lib/trpc'

/*
 * Configurações (11f–11i do design, escolhidas pelo dono em 20/10/2026):
 * Preferências, Avisos, Conta e Privacidade, abertas pela engrenagem do menu
 * "Você" e do Perfil. Preferências e Conta são de verdade (o mesmo servidor
 * do perfil e da conta no web). Avisos e Privacidade seguem o desenho com os
 * controles desligados e o aviso de "em breve": o app não manda notificação,
 * e amigos, comunidades, ranking e "baixar meus dados" ainda não existem.
 */

type Tab = 'preferencias' | 'avisos' | 'conta' | 'privacidade'
const TABS: [Tab, string][] = [
  ['preferencias', 'Preferências'],
  ['avisos', 'Avisos'],
  ['conta', 'Conta'],
  ['privacidade', 'Privacidade']
]
const RADII = [1, 3, 5, 10]

export default function Settings() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const soon = useSoon()
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

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 32 }
        ]}
      >
        <View style={styles.head}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            onPress={() => router.back()}
          >
            <GlassRound>
              <Icon name="back" size={16} color={palette.ink} />
            </GlassRound>
          </Pressable>
          <Text style={[styles.title, { color: palette.ink }]}>
            Configurações
          </Text>
        </View>
        <Glass tone={palette.dark ? 'dark' : 'light'} style={styles.tabs}>
          {TABS.map(([key, label]) => {
            const on = key === tab
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  if (on) return
                  haptic.select()
                  setTab(key)
                }}
                style={[
                  styles.tab,
                  on && [
                    styles.tabOn,
                    {
                      backgroundColor: palette.dark
                        ? 'rgba(255,255,255,.14)'
                        : '#fff'
                    }
                  ]
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    text(13, on ? 'Bold' : 'Regular', 1.2),
                    { color: on ? palette.ink : palette.muted }
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </Glass>
        {tab === 'preferencias' ? (
          <Preferences palette={palette} />
        ) : tab === 'avisos' ? (
          <Notices palette={palette} />
        ) : tab === 'conta' ? (
          <Account palette={palette} soon={soon.show} />
        ) : (
          <Privacy palette={palette} soon={soon.show} />
        )}
      </ScrollView>
      {soon.toast}
    </View>
  )
}

// --- Preferências (11f) -----------------------------------------------------

function Preferences({ palette }: { palette: Palette }) {
  const router = useRouter()
  const state = useExploreState()
  const session = authClient.useSession()
  const sports = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const teams = useQuery({
    ...trpc.pubs.getMyTeams.queryOptions(),
    meta: { errorToast: false }
  })
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const saved = session.data?.user.searchRadiusKm ?? 3
  // O raio novo vale na hora; o servidor confirma por trás.
  const [picked, setPicked] = useState<number | null>(null)
  const radiusKm = picked ?? saved
  const center = searchCenter(state.device, city.data)
  const inRadius = useQuery({
    ...trpc.pubs.search.queryOptions({ ...center, radiusKm, limit: 50 }),
    placeholderData: keepPreviousData,
    meta: { errorToast: false }
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

  return (
    <>
      <SummaryCard palette={palette}>
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
        <ResetSuggestions palette={palette} inline />
      </SummaryCard>

      <Card palette={palette}>
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
              <Text style={[text(20, 'Regular', 1), { color: palette.ink }]}>
                +
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Card palette={palette}>
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
          <View style={styles.radiusMap}>
            <MapView
              style={StyleSheet.absoluteFill}
              region={{
                latitude: center.lat,
                longitude: center.lng,
                // O círculo passa um pouco da altura do recorte, como no design.
                latitudeDelta: ((radiusKm * 2) / 111) * (92 / 120),
                longitudeDelta: ((radiusKm * 2) / 111) * (92 / 120)
              }}
              mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
              customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
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
                        color: on ? (palette.dark ? INK : ACID) : palette.muted
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
    </>
  )
}

/** O cartão escuro da frase, com a sombra acid. */
function SummaryCard({
  palette,
  children
}: {
  palette: Palette
  children: ReactNode
}) {
  return (
    <Card
      palette={{ ...palette, card: palette.dark ? '#1c1c18' : INK }}
      shadow="rgba(201,241,53,.85)"
      offset={5}
    >
      <View style={styles.summary}>{children}</View>
    </Card>
  )
}

/** "Recomeçar sugestões": esquece o que a pessoa dispensou e o que viu. */
function ResetSuggestions({
  palette,
  inline
}: {
  palette: Palette
  inline?: boolean
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
      palette={palette}
      title="Recomeçar sugestões"
      sub="Mantém esportes, raio e favoritos"
      onPress={confirm}
      chevron
    />
  )
}

// --- Avisos (11g) -----------------------------------------------------------

function Notices({ palette }: { palette: Palette }) {
  return (
    <>
      <SoonNote
        palette={palette}
        sentence="Os avisos no celular chegam em breve. Até lá, o que é seu aparece no sino do Explorar."
      />
      <Off>
        <Section palette={palette} icon="tv" title="Jogos">
          <Row
            palette={palette}
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
            right={<Toggle palette={palette} on />}
          />
          <Row
            palette={palette}
            title="Clássicos perto de você"
            right={<Toggle palette={palette} on />}
            divided
          />
        </Section>
        <Section palette={palette} icon="ticket" title="Vou assistir">
          <Row
            palette={palette}
            title="Lembrete do jogo marcado"
            sub="Sempre ligado enquanto houver jogo marcado"
            right={
              <Text style={[text(12.5, 'Bold'), { color: palette.muted }]}>
                Sempre
              </Text>
            }
          />
        </Section>
        <Section palette={palette} icon="people" title="Amigos e comunidades">
          <Row
            palette={palette}
            title="Pedidos de amizade"
            right={<Toggle palette={palette} on />}
          />
          <Row
            palette={palette}
            title="Amigo vai ao mesmo jogo"
            right={<Toggle palette={palette} on />}
            divided
          />
          <Row
            palette={palette}
            title="Ranking do mês fechou"
            right={<Toggle palette={palette} on={false} />}
            divided
          />
        </Section>
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
            <Toggle palette={{ ...palette, dark: false }} on />
          </View>
        </View>
      </Off>
    </>
  )
}

// --- Conta (11h) ------------------------------------------------------------

function Account({
  palette,
  soon
}: {
  palette: Palette
  soon: (sentence: string) => void
}) {
  const router = useRouter()
  const session = authClient.useSession()
  const user = session.data?.user
  const city = useQuery({
    ...trpc.pubs.getMyCity.queryOptions(),
    meta: { errorToast: false }
  })
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return result.data ?? []
    },
    meta: { errorToast: false }
  })
  const now = Date.now()
  const current = session.data?.session.id

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

  const signOut = () =>
    Alert.alert('Sair da conta?', undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await authClient.signOut()
          router.replace('/intro')
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
                router.replace('/intro')
              },
              'secure-text'
            )
        }
      ]
    )

  return (
    <>
      <Card palette={palette} shadow={palette.dark ? '#3a4a12' : undefined}>
        <View style={styles.me}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trocar a foto"
            onPress={() => soon('A foto do perfil chega em breve')}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {initials(user?.name ?? '')}
              </Text>
            </View>
            <View style={[styles.camera, { backgroundColor: PAPER }]}>
              <Icon name="camera" size={14} color={INK} accent={INK} />
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={[text(19, 'Bold', 1.2), { color: palette.ink }]}
            >
              {user?.name}
            </Text>
            <Text style={[text(14), { color: palette.muted }]}>
              {user?.createdAt ? memberSince(user.createdAt) : ''}
            </Text>
          </View>
          <Text
            accessibilityRole="button"
            onPress={rename}
            suppressHighlighting
            style={[text(14, 'Bold'), { color: palette.dark ? ACID : ACCENT }]}
          >
            Editar
          </Text>
        </View>
      </Card>

      <Section palette={palette} icon="person" title="Dados">
        <Row palette={palette} title="E-mail" value={user?.email} />
        <Row
          palette={palette}
          title="Cidade"
          value={city.data?.name ?? 'Escolher'}
          chevron
          divided
          onPress={() => router.push('/cidade' as Href)}
        />
      </Section>

      <Section palette={palette} icon="shield" title="Segurança">
        <Row
          palette={palette}
          title="Verificação em duas etapas"
          right={
            user?.twoFactorEnabled ? (
              <Badge>Ativa</Badge>
            ) : (
              <Text style={[text(13, 'SemiBold'), { color: palette.muted }]}>
                Desligada
              </Text>
            )
          }
          onPress={
            user?.twoFactorEnabled
              ? undefined
              : () => soon('Ligue pelo site: onside.sh, Conta')
          }
        />
        <Row
          palette={palette}
          title="Senha"
          value="Alterar"
          chevron
          divided
          onPress={() => router.push('/senha' as Href)}
        />
      </Section>

      <Section palette={palette} icon="lock" title="Sessões ativas">
        {sessions.isPending ? (
          <ActivityIndicator style={{ padding: 18 }} color={palette.muted} />
        ) : sessions.isError ? (
          // A lista pede login recente (`freshAge` do better-auth, um dia).
          <Row
            palette={palette}
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
                new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime()
            )
            .map((item, index) => {
              const device = deviceLabel(item.userAgent)
              const mine = item.id === current
              return (
                <Row
                  key={item.id}
                  palette={palette}
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
    </>
  )
}

// --- Privacidade (11i) ------------------------------------------------------

function Privacy({
  palette,
  soon
}: {
  palette: Palette
  soon: (sentence: string) => void
}) {
  return (
    <>
      <SoonNote
        palette={palette}
        icon="eye"
        sentence="Amigos, comunidades e ranking chegam em breve. Hoje ninguém vê os bares que você validou: a página do bar só conta quantas pessoas foram."
      />
      <Off>
        <Section palette={palette} icon="pin" title="Onde você foi">
          <Row
            palette={palette}
            title="Quem vê os bares que você validou"
            sub="Também vale para jogos marcados"
            extra={
              <Choice
                palette={palette}
                options={['Todos', 'Amigos', 'Ninguém']}
                on="Ninguém"
              />
            }
          />
          <Row
            palette={palette}
            title="Quem pode te adicionar"
            divided
            extra={
              <Choice
                palette={palette}
                options={['Todos', 'Amigos de amigos', 'Ninguém']}
                on="Todos"
              />
            }
          />
        </Section>
        <Section palette={palette} icon="ranking" title="Ranking">
          <Row
            palette={palette}
            title="Aparecer no ranking global"
            right={<Toggle palette={palette} on={false} />}
          />
          <Row
            palette={palette}
            title="Mostrar comunidades no perfil"
            right={<Toggle palette={palette} on={false} />}
            divided
          />
        </Section>
      </Off>
      <Section palette={palette} icon="doc" title="Seus dados">
        <Row
          palette={palette}
          title="Baixar meus dados"
          sub="Arquivo enviado por e-mail"
          chevron
          onPress={() => soon('Baixar seus dados chega em breve')}
        />
        <View style={[styles.divider, { backgroundColor: palette.line }]} />
        <ResetSuggestions palette={palette} />
      </Section>
    </>
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
  palette,
  sentence,
  icon = 'bell'
}: {
  palette: Palette
  sentence: string
  icon?: 'bell' | 'eye'
}) {
  return (
    <Card palette={palette} shadow="rgba(232,50,12,.28)">
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

function Section({
  palette,
  icon,
  title,
  children
}: {
  palette: Palette
  icon: Parameters<typeof Icon>[0]['name']
  title: string
  children: ReactNode
}) {
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={18} color={palette.ink} />
        <Text style={[text(13, 'Bold'), { color: palette.ink }]}>{title}</Text>
      </View>
      <Card palette={palette}>
        <View style={{ paddingHorizontal: 14 }}>{children}</View>
      </Card>
    </View>
  )
}

function Row({
  palette,
  icon,
  title,
  sub,
  value,
  right,
  extra,
  chevron,
  divided,
  onPress
}: {
  palette: Palette
  icon?: 'tv' | 'you'
  title: string
  sub?: string
  value?: string
  right?: ReactNode
  extra?: ReactNode
  chevron?: boolean
  divided?: boolean
  onPress?: () => void
}) {
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
    <ScalePress accessibilityRole="button" to={0.985} onPress={onPress}>
      {body}
    </ScalePress>
  )
}

function Toggle({ palette, on }: { palette: Palette; on: boolean }) {
  return (
    <View
      style={[
        styles.toggle,
        on
          ? { backgroundColor: INK, justifyContent: 'flex-end' }
          : { backgroundColor: palette.mark }
      ]}
    >
      <View style={[styles.knob, { backgroundColor: on ? ACID : '#fff' }]} />
    </View>
  )
}

function Choice({
  palette,
  options,
  on
}: {
  palette: Palette
  options: string[]
  on: string
}) {
  return (
    <View style={[styles.choice, { backgroundColor: palette.mark }]}>
      {options.map((option) => (
        <View
          key={option}
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
        </View>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: {
    flex: 1,
    fontFamily: 'Anton',
    fontSize: 34,
    textTransform: 'uppercase',
    letterSpacing: -0.68
  },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 24 },
  tab: {
    flexGrow: 1,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabOn: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }
  },
  summary: { paddingTop: 15, paddingBottom: 13, paddingHorizontal: 16 },
  summaryFoot: {
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.14)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  summaryNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pad: { padding: 14 },
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
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: { fontFamily: 'Archivo-Bold', fontSize: 20, color: INK },
  camera: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 }
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
