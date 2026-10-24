import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { File, Paths } from 'expo-file-system'
import { type Href, useLocalSearchParams, useRouter } from 'expo-router'
import * as Sharing from 'expo-sharing'
import { type ReactNode, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { initials, MeDot, RadiusCircle } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { haptic, ScalePress } from '@/components/motion'
import { usePalette } from '@/components/theme'
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
import {
  AvatarError,
  pickSquarePhoto,
  removeAvatar,
  uploadAvatar
} from '@/lib/avatar'
import { searchCenter, teamMark } from '@/lib/explore'
import { MAP_STYLE } from '@/lib/map-style'
import { deviceLabel, lastSeen, preferenceSummary } from '@/lib/settings'
import { queryClient as appQueryClient, trpc } from '@/lib/trpc'

/*
 * Configurações (11f–11i do design, escolhidas pelo dono em 20/10/2026):
 * Preferências, Avisos, Conta e Privacidade, abertas pela engrenagem do menu
 * "Você" e do Perfil. Preferências e Conta são de verdade (o mesmo servidor
 * do perfil e da conta no web), com a foto e a verificação em duas etapas
 * (WEB-419). Avisos segue o desenho com os controles desligados e o aviso de
 * "em breve" (o app não manda notificação); em Privacidade, ranking e
 * comunidades ainda não existem, e "Baixar meus dados" entrega o arquivo
 * pelo share sheet.
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
          <Preferences />
        ) : tab === 'avisos' ? (
          <Notices />
        ) : tab === 'conta' ? (
          <Account />
        ) : (
          <Privacy />
        )}
      </ScrollView>
    </View>
  )
}

// --- Preferências (11f) -----------------------------------------------------

function Preferences() {
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
              <Text style={[text(20, 'Regular', 1), { color: palette.ink }]}>
                +
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>

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
function ResetSuggestions({ inline }: { inline?: boolean }) {
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
      title="Recomeçar sugestões"
      sub="Mantém esportes, raio e favoritos"
      onPress={confirm}
      chevron
    />
  )
}

// --- Avisos (11g) -----------------------------------------------------------

function Notices() {
  const palette = usePalette()
  return (
    <>
      <SoonNote sentence="Os avisos no celular chegam em breve. Até lá, o que é seu aparece no sino do Explorar." />
      <Off>
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
        <Section icon="people" title="Amigos e comunidades">
          <Row title="Pedidos de amizade" right={<Toggle on />} />
          <Row title="Amigo vai ao mesmo jogo" right={<Toggle on />} divided />
          <Row
            title="Ranking do mês fechou"
            right={<Toggle on={false} />}
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
            <Toggle on />
          </View>
        </View>
      </Off>
    </>
  )
}

// --- Conta (11h) ------------------------------------------------------------

function Account() {
  const palette = usePalette()
  const router = useRouter()
  const session = authClient.useSession()
  const user = session.data?.user
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
  const sessions = useQuery({
    queryKey: ['account-sessions'],
    queryFn: async () => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return result.data ?? []
    }
  })
  const now = Date.now()
  const current = session.data?.session.id
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
      <Card shadow={palette.dark ? '#3a4a12' : undefined}>
        <View style={styles.me}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Trocar a foto"
            disabled={photoBusy}
            onPress={changePhoto}
          >
            <View style={styles.avatar}>
              {user?.image ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: user.image }}
                  style={styles.avatarPhoto}
                  onLoad={() => setPhotoBusy(false)}
                  onError={() => setPhotoBusy(false)}
                />
              ) : (
                <Text style={styles.avatarText}>
                  {initials(user?.name ?? '')}
                </Text>
              )}
              {photoBusy ? (
                <View style={styles.avatarBusy}>
                  <ActivityIndicator color={PAPER} />
                </View>
              ) : null}
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
            <Text
              numberOfLines={1}
              style={[text(14), { color: palette.muted }]}
            >
              {me.data ? `@${me.data.username}` : ' '}
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

      <Section icon="person" title="Dados">
        <Row title="E-mail" value={user?.email} />
        <Row
          title="Usuário"
          value={me.data ? `@${me.data.username}` : ' '}
          chevron
          divided
          onPress={editUsername}
        />
        <Row
          title="Cidade"
          value={city.data?.name ?? 'Escolher'}
          chevron
          divided
          onPress={() => router.push('/cidade' as Href)}
        />
      </Section>

      <Section icon="shield" title="Segurança">
        <Row
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
          chevron={!user?.twoFactorEnabled}
          onPress={() => router.push('/duas-etapas' as Href)}
        />
        <Row
          title="Senha"
          value="Alterar"
          chevron
          divided
          onPress={() => router.push('/senha' as Href)}
        />
      </Section>

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
                new Date(b.updatedAt).getTime() -
                  new Date(a.updatedAt).getTime()
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

const SEES = { everyone: 'Todos', friends: 'Amigos', nobody: 'Ninguém' }
const ADDS = {
  everyone: 'Todos',
  friends_of_friends: 'Amigos de amigos',
  nobody: 'Ninguém'
}
/** A chave da opção pelo rótulo que a pessoa tocou. */
const keyOf = <T extends Record<string, string>>(map: T, label: string) =>
  (Object.keys(map) as (keyof T)[]).find((key) => map[key] === label) as keyof T

function Privacy() {
  const palette = usePalette()
  const queryClient = useQueryClient()
  const me = useQuery(trpc.friends.me.queryOptions())
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
      }
    })
  )
  const [exporting, setExporting] = useState(false)
  const exportData = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const data = await appQueryClient.fetchQuery({
        ...trpc.account.exportData.queryOptions(),
        staleTime: 0
      })
      const day = data.exportedAt.slice(0, 10)
      const file = new File(Paths.cache, `onside-meus-dados-${day}.json`)
      if (file.exists) file.delete()
      file.create()
      file.write(JSON.stringify(data, null, 2))
      haptic.select()
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: 'Seus dados da Onside'
      })
    } catch {
      haptic.error()
      Alert.alert('Não foi possível gerar o arquivo', 'Tente de novo.')
    } finally {
      setExporting(false)
    }
  }
  return (
    <>
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
      <SoonNote icon="eye" sentence="Ranking e comunidades chegam em breve." />
      <Off>
        <Section icon="ranking" title="Ranking">
          <Row
            title="Aparecer no ranking global"
            right={<Toggle on={false} />}
          />
          <Row
            title="Mostrar comunidades no perfil"
            right={<Toggle on={false} />}
            divided
          />
        </Section>
      </Off>
      <Section icon="doc" title="Seus dados">
        <Row
          title="Baixar meus dados"
          sub={
            exporting
              ? 'Preparando o arquivo…'
              : 'Arquivo para salvar ou enviar'
          }
          chevron
          onPress={exportData}
        />
        <View style={[styles.divider, { backgroundColor: palette.line }]} />
        <ResetSuggestions />
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
    <ScalePress accessibilityRole="button" to={0.985} onPress={onPress}>
      {body}
    </ScalePress>
  )
}

function Toggle({ on }: { on: boolean }) {
  const palette = usePalette()
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
  avatarPhoto: { width: 60, height: 60, borderRadius: 6 },
  avatarBusy: {
    ...StyleSheet.absoluteFill,
    borderRadius: 6,
    backgroundColor: 'rgba(18,18,15,.45)',
    alignItems: 'center',
    justifyContent: 'center'
  },
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
