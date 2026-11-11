import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Switch as NativeSwitch,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HardShadow, Photo } from '@/components/explore'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  Icon,
  INK,
  Text,
  TextInput,
  text,
  useStatusBar
} from '@/components/ui'
import { dayKicker } from '@/lib/bar-owner'
import { formatTime } from '@/lib/explore'
import { useOwnerBar } from '@/lib/owner'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Novo jogo (rodada 10, tela 4, folha): a busca devolve os jogos como
 * cartões de placar (dia, hora, campeonato), o escolhido em contorno; telão,
 * som, oferta e lista de quem vai em linhas; e a prévia do cartão do bar
 * como aparece no Explorar. A fonte da busca é a mesma do "Seu primeiro
 * jogo" do painel (`pub.gameSuggestions`: o que os bares perto já marcaram);
 * jogo fora dela se monta no painel do site, que tem o formulário inteiro.
 *
 * Com `?id=` é a edição de um jogo da grade (as mesmas linhas, sem a busca),
 * e um rascunho ganha "Publicar".
 *
 * Publicar conta a fase ("Publicando…") e, pronto, a folha fecha com o
 * háptico de sucesso e o jogo entra na agenda.
 */

const fold = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function NovoJogo() {
  const router = useRouter()
  const palette = usePalette()
  const insets = useSafeAreaInsets()
  useStatusBar(palette.dark ? 'light' : 'dark')
  const { id } = useLocalSearchParams<{ id?: string }>()
  const owner = useOwnerBar()
  const bar = owner.bar
  const events = useQuery(trpc.pub.getMyEvents.queryOptions())
  const editing = id ? events.data?.find((game) => game.id === id) : undefined
  const suggestions = useQuery({
    ...trpc.pub.gameSuggestions.queryOptions(),
    enabled: !id
  })
  const policy = useQuery({
    ...trpc.pub.getMyEventCreationPolicy.queryOptions(),
    enabled: !id
  })
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const hasScreen = bar?.amenities?.includes(1) ?? true
  const [screen, setScreen] = useState<boolean | null>(null)
  const [sound, setSound] = useState<boolean | null>(null)
  const [offer, setOffer] = useState<boolean | null>(null)
  const [list, setList] = useState<boolean | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const done = () => {
    haptic.success()
    queryClient.invalidateQueries()
    router.back()
  }
  const fail = (error: unknown) => {
    haptic.error()
    setProblem(
      error instanceof Error && error.message
        ? error.message
        : 'Não deu para salvar. Tente de novo.'
    )
  }
  const create = useMutation(
    trpc.pub.createEvent.mutationOptions({ onSuccess: done, onError: fail })
  )
  const update = useMutation(
    trpc.pub.updateEvent.mutationOptions({ onSuccess: done, onError: fail })
  )

  const list_ = (suggestions.data ?? []).filter((game) =>
    query.trim()
      ? fold(`${game.title} ${game.championship}`).includes(fold(query.trim()))
      : true
  )
  const picked =
    (suggestions.data ?? []).find((game) => game.key === chosen) ?? null
  const title = editing ? gameTitle(editing) : (picked?.title ?? null)
  const startsAt = editing?.startsAt ?? picked?.startsAt ?? null
  // Os valores: o que a pessoa mexeu, senão o do jogo, senão o do bar.
  const onScreen = screen ?? editing?.onBigScreen ?? hasScreen
  const withSound = sound ?? editing?.withSound ?? true
  const withOffer =
    offer ?? (editing ? !editing.noHouseOffer : Boolean(bar?.houseOffer))
  const withList = list ?? editing?.attendanceEnabled ?? true
  const draft = editing && !editing.publishedAt
  const busy = create.isPending || update.isPending
  const blocked = !id && policy.data && !policy.data.canCreate

  const submit = () => {
    setProblem(null)
    const common = {
      onBigScreen: onScreen,
      withSound,
      ...(owner.elite
        ? { attendanceEnabled: withList, noHouseOffer: !withOffer }
        : {})
    }
    if (editing)
      return update.mutate({
        eventId: editing.id,
        ...common,
        ...(draft ? { publish: true as const } : {})
      })
    if (!picked) return
    create.mutate({
      sportId: picked.sportId,
      championship: picked.championship,
      startsAt: picked.startsAt,
      participantIds: picked.participantIds.length
        ? picked.participantIds
        : undefined,
      participantFreeText: picked.participantFreeText ?? undefined,
      ...common
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          padding: 18,
          paddingTop: 22,
          paddingBottom: insets.bottom + 110,
          gap: 12
        }}
      >
        <View style={styles.head}>
          <Text
            accessibilityRole="header"
            style={[styles.title, { color: palette.ink }]}
          >
            {editing ? 'Editar jogo' : 'Novo jogo'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            hitSlop={8}
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: palette.mark }]}
          >
            <Icon name="close" size={20} color={palette.ink} />
          </Pressable>
        </View>

        {blocked ? (
          <Note>
            {policy.data?.status === 'inactive'
              ? 'O bar está fora do ar: publique um jogo depois de voltar.'
              : 'O limite de jogos do mês acabou. No Pro e no Elite não há limite.'}
          </Note>
        ) : null}

        {editing ? null : (
          <>
            <View
              style={[
                styles.search,
                { borderColor: palette.ink, backgroundColor: palette.card }
              ]}
            >
              <Icon name="search" size={20} color={palette.ink} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Time ou campeonato"
                placeholderTextColor={palette.muted}
                style={[
                  text(18, 'SemiBold', 1.2),
                  styles.input,
                  { color: palette.ink }
                ]}
                returnKeyType="search"
              />
            </View>
            {list_.length ? (
              list_.map((game) => {
                const on = game.key === chosen
                return (
                  <Pressable
                    key={game.key}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      haptic.select()
                      setChosen(on ? null : game.key)
                    }}
                  >
                    <HardShadow color={palette.drop} offset={3} radius={20} />
                    <View
                      style={[
                        styles.game,
                        {
                          backgroundColor: palette.card,
                          borderColor: on ? palette.ink : 'transparent'
                        }
                      ]}
                    >
                      <View style={{ width: 64 }}>
                        <Text
                          style={[styles.gameDay, { color: palette.muted }]}
                        >
                          {brasiliaDay(game.startsAt) ===
                          brasiliaDay(Date.now())
                            ? 'HOJE'
                            : dayKicker(Date.parse(game.startsAt)).split(
                                ' '
                              )[0]}
                        </Text>
                        <Text style={[styles.gameTime, { color: palette.ink }]}>
                          {formatTime(game.startsAt)}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={[
                            text(16, 'Bold', 1.25),
                            { color: palette.ink }
                          ]}
                        >
                          {game.title}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            text(13.5, 'Regular', 1.3),
                            { color: palette.muted }
                          ]}
                        >
                          {`${game.championship} · bares perto já marcaram`}
                        </Text>
                      </View>
                      {on ? (
                        <View style={styles.check}>
                          <Icon name="check" size={16} color={INK} />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                )
              })
            ) : (
              <Note>
                {suggestions.isPending
                  ? 'Buscando os jogos…'
                  : 'Nenhum jogo da lista com esse nome. Jogo fora da lista se monta no painel do bar em onside.sh.'}
              </Note>
            )}
          </>
        )}

        {editing || picked ? (
          <>
            <Line
              icon="tv"
              label="Telão neste jogo"
              on={onScreen}
              onChange={setScreen}
            />
            <Line
              icon="sound"
              label="Som do jogo"
              on={withSound}
              onChange={setSound}
            />
            {owner.elite && bar?.houseOffer ? (
              <Line
                icon="ticket"
                label={`Oferta: ${bar.houseOffer}`}
                on={withOffer}
                onChange={setOffer}
              />
            ) : null}
            {owner.elite ? (
              <Line
                icon="people"
                label="Lista de quem vai"
                on={withList}
                onChange={setList}
              />
            ) : null}

            <View style={[styles.preview, { backgroundColor: palette.mark }]}>
              <Text style={[styles.previewKicker, { color: palette.muted }]}>
                ASSIM O TORCEDOR VÊ
              </Text>
              <View
                style={[styles.previewCard, { backgroundColor: palette.card }]}
              >
                <Photo
                  uri={bar?.photoUrl ?? null}
                  name={bar?.name ?? ''}
                  style={styles.previewPhoto}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={[text(17, 'Bold', 1.2), { color: palette.ink }]}
                  >
                    {bar?.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[text(14, 'Regular', 1.3), { color: palette.muted }]}
                  >
                    {[
                      title,
                      startsAt
                        ? `${dayKicker(new Date(startsAt).getTime()).split(' ')[0].toLowerCase()} ${formatTime(startsAt)}`
                        : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View style={styles.previewTags}>
                    {onScreen ? <Feature icon="tv" label="Telão" /> : null}
                    {withSound ? <Feature icon="sound" label="Som" /> : null}
                    {owner.elite && withOffer && bar?.houseOffer ? (
                      <Feature icon="ticket" label="Oferta" />
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          </>
        ) : null}
        {problem ? (
          <Text style={[text(14, 'SemiBold', 1.4), { color: palette.live }]}>
            {problem}
          </Text>
        ) : null}
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={busy || (!editing && (!picked || blocked === true))}
          onPress={submit}
        >
          <HardShadow color="#7f9a12" offset={4} radius={999} />
          <View
            style={[
              styles.publish,
              (busy || (!editing && (!picked || blocked === true))) && {
                opacity: 0.55
              }
            ]}
          >
            <Text style={[text(18, 'Bold', 1.2), { color: INK }]}>
              {busy
                ? editing && !draft
                  ? 'Salvando…'
                  : 'Publicando…'
                : editing && !draft
                  ? 'Salvar'
                  : 'Publicar'}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  )
}

function Line({
  icon,
  label,
  on,
  onChange
}: {
  icon: 'tv' | 'sound' | 'ticket' | 'people'
  label: string
  on: boolean
  onChange: (next: boolean) => void
}) {
  const palette = usePalette()
  return (
    <View>
      <HardShadow color={palette.drop} offset={3} radius={20} />
      <View style={[styles.line, { backgroundColor: palette.card }]}>
        <Icon name={icon} size={20} color={palette.ink} />
        <Text
          numberOfLines={1}
          style={[text(16, 'SemiBold', 1.25), { color: palette.ink, flex: 1 }]}
        >
          {label}
        </Text>
        {/* Caixa fixa: o interruptor do iOS 26 não informa a altura e
            subia para o topo da linha. */}
        <View style={styles.switchBox}>
          <NativeSwitch
            accessibilityLabel={label}
            value={on}
            onValueChange={(next) => {
              haptic.select()
              onChange(next)
            }}
            trackColor={{ false: palette.mark, true: ACID }}
            thumbColor={on ? INK : '#ffffff'}
            ios_backgroundColor={palette.mark}
          />
        </View>
      </View>
    </View>
  )
}

function Feature({
  icon,
  label
}: {
  icon: 'tv' | 'sound' | 'ticket'
  label: string
}) {
  const palette = usePalette()
  return (
    <View style={styles.feature}>
      <Icon name={icon} size={14} color={palette.muted} />
      <Text style={[styles.featureText, { color: palette.ink }]}>{label}</Text>
    </View>
  )
}

function Note({ children }: { children: string }) {
  const palette = usePalette()
  return (
    <View style={[styles.note, { backgroundColor: palette.mark }]}>
      <Text style={[text(14, 'Regular', 1.45), { color: palette.ink }]}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 44,
    textTransform: 'uppercase',
    marginVertical: -10.7
  },
  close: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 60,
    paddingHorizontal: 18,
    borderRadius: 30,
    borderWidth: 2.5
  },
  input: { flex: 1, height: '100%' },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 20,
    borderWidth: 2.5
  },
  gameDay: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.8
  },
  gameTime: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 20,
    fontVariant: ['tabular-nums']
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    borderRadius: 20
  },
  preview: { borderRadius: 24, padding: 14, gap: 12 },
  previewKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11.5,
    letterSpacing: 1.2
  },
  previewCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 18,
    alignItems: 'center'
  },
  previewPhoto: { width: 76, height: 76, borderRadius: 14 },
  previewTags: { flexDirection: 'row', gap: 12, marginTop: 4 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featureText: { fontFamily: 'GeistMono-SemiBold', fontSize: 11.5 },
  note: { borderRadius: 18, padding: 14 },
  switchBox: {
    width: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  foot: { position: 'absolute', left: 18, right: 18, bottom: 0 },
  publish: {
    height: 58,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
