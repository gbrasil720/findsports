import { actionPhase } from '@findsports_oficial/api/lib/transient-error'
import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { dayLabel } from '@/components/explore'
import { ErrorText, haptic, SWAP } from '@/components/motion'
import { AcidButton, ObTitle } from '@/components/ob-frame'
import { usePalette } from '@/components/theme'
import {
  ACID,
  BackButton,
  ErrorState,
  errorMessage,
  Icon,
  INK,
  LIVE,
  phaseBusy,
  phaseLabel,
  Text,
  TextLink,
  text
} from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { formatTime, goingSummary, isLive } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * "Vou assistir aqui" (rodada 3 do redesign, tela 1): folha sólida do
 * sistema por cima da página do bar. Os jogos viram linhas de placar (a hora
 * em mono, o jogo, telão ou som), o escolhido em tinta; quem vai; os amigos
 * para chamar (tela 5); a oferta deste jogo no Elite, antes do botão, que é o
 * motivo do código; sem código, o convite ao check-in. O botão diz o que
 * acontece. No Elite o código abre por cima (`/codigo`, fade); nos outros a
 * folha fecha. Não há pedido nem resposta do bar (dono, 16/10/2026).
 */

// ponytail: seis jogos; a página do bar lista o resto.
const MAX_GAMES = 6
// Os amigos da fileira (rola de lado depois do quinto).
const MAX_FRIENDS = 8

export default function GoingSheet() {
  const { barId, eventId, runId } = useLocalSearchParams<{
    barId: string
    eventId?: string
    /** Veio do card de "Bares pra você": a presença vai com a atribuição. */
    runId?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  const fan = authClient.useSession().data?.user.role === 'fan'
  // Sem bar (link quebrado, amigo sem jogo), a folha fecha em vez de pedir
  // ao servidor um id vazio (erro do zod).
  const bar = useQuery({
    ...trpc.pubs.getById.queryOptions({ id: barId ?? '' }),
    enabled: !!barId
  })
  const friends = useQuery({
    ...trpc.friends.overview.queryOptions(),
    enabled: fan
  })
  // Aberta direto (link, recarga), não há tela por baixo para voltar: o
  // Explorar entra no lugar ("GO_BACK was not handled").
  const close = () =>
    router.canGoBack() ? router.back() : router.replace('/explore')
  // biome-ignore lint/correctness/useExhaustiveDependencies: uma vez, ao abrir sem bar
  useEffect(() => {
    if (!barId) close()
  }, [barId])
  const data = bar.data
  // Só os jogos em que o botão cabe: o servidor manda `attendance` neles (a
  // lista desligada pelo bar, WEB-437, não vem).
  const games = (data?.events ?? [])
    .filter((game) => game.attendance)
    .slice(0, MAX_GAMES)
  const [picked, setPicked] = useState(eventId)
  const [calling, setCalling] = useState<string[]>([])
  const game = games.find((item) => item.id === picked) ?? games[0]
  const mine = game?.attendance
  const going = game?.going ? goingSummary(game.going) : null
  const now = Date.now()

  const set = useMutation(
    trpc.attendance.set.mutationOptions({
      onSuccess: async ({ attending }, { eventId: id }) => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: trpc.pubs.getById.queryKey({ id: barId })
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.attendance.mine.queryKey()
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.attendance.sentCalls.queryKey({ eventId: id })
          }),
          queryClient.invalidateQueries({
            queryKey: trpc.recommendations.today.queryKey()
          })
        ])
        if (attending) haptic.success()
        else haptic.select()
        if (attending && data?.issuesCode) router.replace(`/codigo/${id}`)
        else close()
      }
    })
  )

  // O bar não abriu: a folha diz o que houve em vez de ficar em branco.
  if (!data && bar.isError) {
    return (
      <View
        style={[
          styles.body,
          styles.head,
          { flex: 1, backgroundColor: palette.bg }
        ]}
      >
        <ErrorState
          style={{ flex: 1, gap: 16 }}
          title="Não deu para abrir os jogos deste bar."
          error={bar.error}
          onRetry={bar.refetch}
          retrying={bar.isFetching}
        />
        <BackButton icon="close" onPress={close} />
      </View>
    )
  }
  if (!data || !game || !mine) {
    return <View style={{ flex: 1, backgroundColor: palette.bg }} />
  }

  // Os amigos da fileira: quem já vai aparece marcado "vai" e não se chama;
  // o jogo começado não chama ninguém (a regra do chamado).
  const goingIds = new Set(game.going?.friends.map((f) => f.id) ?? [])
  const started = new Date(game.startsAt).getTime() <= now
  const all = friends.data?.friends ?? []
  const callable =
    !mine.attending && !started
      ? [
          ...all.filter((f) => goingIds.has(f.id)),
          ...all.filter((f) => !goingIds.has(f.id))
        ].slice(0, MAX_FRIENDS)
      : []
  const chosen = calling.filter((id) => !goingIds.has(id))

  const confirm = () =>
    mine.attending && mine.code
      ? router.replace(`/codigo/${game.id}`)
      : set.mutate({
          eventId: game.id,
          attending: true,
          recommendationRunId: runId,
          callFriendIds: chosen.length ? chosen : undefined
        })
  // O botão conta a ação (WEB-460): "Gerando código…", "Esperando a
  // rede…", "Tentando de novo…" (a presença é segura de repetir) e, se as
  // tentativas acabarem, "Tentar de novo" com o motivo acima.
  const phase = actionPhase([set])
  const label = phaseLabel(phase, {
    idle: mine.attending
      ? mine.code
        ? 'Ver código'
        : 'Você vai'
      : chosen.length
        ? `Confirmar e chamar ${chosen.length}`
        : data.issuesCode
          ? 'Confirmar e gerar código'
          : 'Confirmar presença',
    sending: data.issuesCode ? 'Gerando código…' : 'Confirmando…'
  })

  // O ScrollView é filho direto da tela: é o único jeito de o
  // react-native-screens o medir pelo tamanho da folha. Dentro de uma View
  // ele cai no caminho antigo (RNSScreen.mm), que copia também a origem da
  // folha, e o conteúdo sai do lugar ou some. Por isso o título rola junto.
  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: palette.bg }}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 96 }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <ObTitle plain="Vou assistir" hot="aqui" size={36} breakLine />
            <Text style={[text(14), { color: palette.muted, marginTop: 8 }]}>
              {[data.name, data.neighborhood].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            hitSlop={8}
            onPress={close}
            style={[styles.close, { backgroundColor: palette.mark }]}
          >
            <Icon name="close" size={20} color={palette.ink} />
          </Pressable>
        </View>

        <View
          accessibilityRole="radiogroup"
          style={[
            styles.list,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          {games.map((item) => {
            const live = isLive(item, now)
            return (
              <GameRow
                key={item.id}
                selected={item.id === game.id}
                live={live}
                time={formatTime(item.startsAt)}
                day={live ? 'ao vivo' : shortDay(item.startsAt, now)}
                title={gameTitle(item)}
                detail={
                  item.attendance?.attending
                    ? `${item.championship} · você vai`
                    : item.championship
                }
                tag={item.onBigScreen ? 'Telão' : item.withSound ? 'Som' : null}
                onPress={() => {
                  if (item.id === game.id) return
                  haptic.select()
                  set.reset()
                  setPicked(item.id)
                }}
              />
            )
          })}
        </View>

        {going ? (
          <View style={styles.who}>
            <Faces faces={going.faces} more={going.more} />
            <Text
              style={[
                text(14, 'Regular', 1.35),
                { color: palette.muted, flex: 1 }
              ]}
            >
              <Text style={{ fontFamily: 'Archivo-Bold', color: palette.ink }}>
                {going.lead}
              </Text>
              {going.tail}
            </Text>
          </View>
        ) : null}

        {callable.length ? (
          <View style={{ gap: 8 }}>
            <Text style={[styles.label, { color: palette.muted }]}>
              CHAMAR PARA O JOGO
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
            >
              {callable.map((friend) => (
                <FriendPick
                  key={friend.id}
                  name={friend.name}
                  going={goingIds.has(friend.id)}
                  on={calling.includes(friend.id)}
                  onPress={() => {
                    haptic.select()
                    setCalling((list) =>
                      list.includes(friend.id)
                        ? list.filter((id) => id !== friend.id)
                        : [...list, friend.id]
                    )
                  }}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* No Elite, a oferta deste jogo (WEB-422) antes do botão: é o
            motivo do código. Sem código, o convite ao check-in. */}
        {data.issuesCode ? (
          game.houseOffer ? (
            <Animated.View key={game.houseOffer} entering={SWAP}>
              <Note
                icon="ticket"
                label="COM O CÓDIGO, NESTE JOGO"
                body={game.houseOffer}
              />
            </Animated.View>
          ) : null
        ) : (
          <Note
            icon="pin"
            label="CHEGANDO LÁ"
            body="Faça o check-in em “Estou aqui” e sua avaliação conta na nota do bar."
          />
        )}

        <ErrorText style={[text(13.5, 'SemiBold'), { color: LIVE }]}>
          {set.error
            ? errorMessage(set.error, 'Não deu para confirmar. Tente de novo.')
            : null}
        </ErrorText>

        {/* Código validado não volta atrás: o servidor recusa. */}
        {mine.attending && !mine.validated ? (
          <View style={{ alignItems: 'center' }}>
            <TextLink
              label="Desmarcar este jogo"
              underline
              color={palette.ink}
              onPress={() => set.mutate({ eventId: game.id, attending: false })}
            />
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.dock,
          {
            backgroundColor: palette.bg,
            paddingBottom: Math.max(insets.bottom - 6, 16)
          }
        ]}
      >
        <AcidButton
          label={label}
          // "Tentar de novo" repete o que falhou (marcar ou desmarcar).
          onPress={() =>
            phase === 'failed' && set.variables
              ? set.mutate(set.variables)
              : confirm()
          }
          busy={phaseBusy(phase)}
          disabled={phase === 'idle' && mine.attending && !mine.code}
        />
      </View>
    </>
  )
}

/** "hoje", "qua 11": o dia embaixo da hora, no fuso de Brasília. */
function shortDay(startsAt: string, now: number) {
  if (dayLabel(startsAt, now) === 'Hoje') return 'hoje'
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Date(startsAt).toLocaleDateString('pt-BR', {
      ...options,
      timeZone: 'America/Sao_Paulo'
    })
  return `${part({ weekday: 'short' }).replace('.', '')} ${part({ day: 'numeric' })}`
}

/** Uma linha de placar (`.gr`): hora e dia, o jogo, telão ou som. */
function GameRow({
  selected,
  live,
  time,
  day,
  title,
  detail,
  tag,
  onPress
}: {
  selected: boolean
  live: boolean
  time: string
  day: string
  title: string
  detail: string
  tag: string | null
  onPress: () => void
}) {
  const palette = usePalette()
  const fg = selected ? palette.bg : palette.ink
  const soft = selected
    ? { color: palette.bg, opacity: 0.7 }
    : { color: palette.muted }
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${day} ${time}, ${detail}`}
      onPress={onPress}
      // Dezenas de toques: só o estado, sem deslizar.
      style={[styles.row, selected && { backgroundColor: palette.ink }]}
    >
      <View style={{ width: 62 }}>
        <Text
          style={[
            styles.time,
            { color: live ? (selected ? '#f3421d' : palette.live) : fg }
          ]}
        >
          {time}
        </Text>
        <Text style={[styles.day, soft]}>{day.toLocaleUpperCase('pt-BR')}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(15.5, 'Bold', 1.2), { color: fg }]}
        >
          {title}
        </Text>
        <Text numberOfLines={1} style={[text(12.5, 'Regular', 1.3), soft]}>
          {detail}
        </Text>
      </View>
      {tag ? (
        <View
          style={[
            styles.tag,
            {
              backgroundColor: selected ? 'rgba(127,127,120,.3)' : palette.mark
            }
          ]}
        >
          <Text style={[styles.tagText, { color: fg }]}>
            {tag.toLocaleUpperCase('pt-BR')}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

/** "M R +32" (`.av`): as letras (amigos primeiro) e o resto num círculo. */
function Faces({ faces, more }: { faces: string[]; more: number }) {
  const palette = usePalette()
  const shown = [
    ...faces.map((label, index) => ({
      key: `face${index}`,
      label,
      bg: index ? palette.ink : ACID,
      fg: index ? palette.bg : INK
    })),
    ...(more > 0
      ? [
          {
            key: 'more',
            label: `+${more.toLocaleString('pt-BR')}`,
            bg: palette.ink,
            fg: palette.bg
          }
        ]
      : [])
  ]
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map(({ key, label, bg, fg }, index) => (
        <View
          key={key}
          style={[
            styles.face,
            {
              marginLeft: index ? -6 : 0,
              backgroundColor: bg,
              borderColor: palette.bg
            }
          ]}
        >
          <Text
            style={[
              text(label.length > 2 ? 10 : 12, 'Bold', 1.2),
              { color: fg }
            ]}
            maxFontSizeMultiplier={1}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Um amigo na fileira "Chamar para o jogo" (`.fr`): anel acid e marca. */
function FriendPick({
  name,
  going,
  on,
  onPress
}: {
  name: string
  going: boolean
  on: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const first = name.trim().split(/\s+/)[0] ?? name
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: going }}
      accessibilityLabel={going ? `${first}, já vai` : `Chamar ${first}`}
      disabled={going}
      onPress={onPress}
      style={styles.friend}
    >
      <View
        style={[
          styles.ring,
          { borderColor: on ? ACID : 'transparent' },
          going && { opacity: 0.55 }
        ]}
      >
        <View
          style={[styles.avatar, { backgroundColor: on ? ACID : palette.mark }]}
        >
          <Text
            style={[text(18, 'Bold', 1.2), { color: on ? INK : palette.ink }]}
          >
            {(Array.from(first)[0] ?? '').toLocaleUpperCase('pt-BR')}
          </Text>
        </View>
        {on ? (
          <View style={[styles.check, { borderColor: palette.bg }]}>
            <Icon name="check" size={12} color={INK} />
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[text(12, 'SemiBold', 1.2), { color: palette.ink }]}
      >
        {first}
      </Text>
      {going ? (
        <Text style={[styles.goes, { color: palette.muted }]}>VAI</Text>
      ) : null}
    </Pressable>
  )
}

/** A faixa de baixo (`.offr`): a oferta do código ou o convite ao check-in. */
function Note({
  icon,
  label,
  body
}: {
  icon: 'ticket' | 'pin'
  label: string
  body: string
}) {
  const palette = usePalette()
  return (
    <View style={[styles.note, { backgroundColor: palette.mark }]}>
      <Icon name={icon} size={22} color={palette.ink} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: palette.muted, marginBottom: 4 }]}>
          {label}
        </Text>
        <Text style={[text(14, 'Regular', 1.35), { color: palette.ink }]}>
          {body}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  // `.fs`: 18 dos lados, 12 entre as peças.
  body: { paddingHorizontal: 18, gap: 12 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 26
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // `.gl`: raio 22, 4 de respiro e a sombra dura de 3.
  list: {
    borderRadius: 22,
    padding: 4,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 18
  },
  // A Geist Mono tem 1,3em de altura natural: margem negativa no lugar do 1em.
  time: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    marginVertical: -3
  },
  day: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
    marginTop: 4
  },
  tag: { paddingVertical: 5, paddingHorizontal: 7, borderRadius: 6 },
  tagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.5
  },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  face: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 2,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  label: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.84
  },
  friend: { width: 56, alignItems: 'center', gap: 5 },
  ring: { padding: 3, borderRadius: 31, borderWidth: 2.5 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  goes: { fontFamily: 'GeistMono-SemiBold', fontSize: 10, letterSpacing: 0.4 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 18
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 10
  }
})
