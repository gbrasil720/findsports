import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, OfferCard } from '@/components/card'
import {
  dayLabel,
  matchLine,
  type Palette,
  usePalette
} from '@/components/explore'
import { Glass } from '@/components/glass'
import { ErrorText, haptic, SWAP } from '@/components/motion'
import {
  ACID,
  BackButton,
  INK,
  LIVE,
  PAPER,
  PillButton,
  TextLink,
  text
} from '@/components/ui'
import { formatTime } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * "Vou assistir aqui" (3d do design): a folha que confirma o jogo. No bar
 * Elite o servidor já devolve o código do balcão e a folha dá lugar a ele
 * (3f); nos outros, a presença fica marcada e a folha fecha. Não há pedido
 * nem resposta do bar (decisão do dono, 16/10/2026).
 */

// ponytail: três jogos cabem na folha sem rolar; a página do bar lista o resto.
const MAX_GAMES = 3

export default function GoingSheet() {
  const { barId, eventId } = useLocalSearchParams<{
    barId: string
    eventId?: string
  }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const queryClient = useQueryClient()
  const bar = useQuery(trpc.pubs.getById.queryOptions({ id: barId }))
  const data = bar.data
  // Só os jogos em que o botão cabe: o servidor manda `attendance` neles.
  const games = (data?.events ?? [])
    .filter((game) => game.attendance)
    .slice(0, MAX_GAMES)
  const [picked, setPicked] = useState(eventId)
  const game = games.find((item) => item.id === picked) ?? games[0]
  const mine = game?.attendance
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
          })
        ])
        if (attending) haptic.success()
        else haptic.select()
        if (attending && data?.issuesCode) router.replace(`/codigo/${id}`)
        else router.back()
      }
    })
  )

  if (!data || !game || !mine) {
    return <View style={[styles.sheet, { backgroundColor: palette.bg }]} />
  }

  const confirm = () =>
    mine.attending && mine.code
      ? router.replace(`/codigo/${game.id}`)
      : set.mutate({ eventId: game.id, attending: true })
  const label = set.isPending
    ? data.issuesCode
      ? 'Gerando código…'
      : 'Confirmando…'
    : mine.attending
      ? mine.code
        ? 'Ver código'
        : 'Você vai'
      : data.issuesCode
        ? 'Confirmar e gerar código'
        : 'Confirmar'

  return (
    <View style={[styles.sheet, { backgroundColor: palette.bg }]}>
      {/* Sem ScrollView: dentro do formSheet ele não desenha nada, e os
          jogos (até três) cabem na folha. */}
      <View style={styles.body}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.ink }]}
            >
              Vou assistir aqui
            </Text>
            <Text style={[text(14), { color: palette.muted }]}>
              {[data.name, data.neighborhood].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <BackButton icon="close" />
        </View>

        <Text
          style={[text(13, 'SemiBold'), { color: palette.muted, marginTop: 6 }]}
        >
          Jogo
        </Text>
        <View accessibilityRole="radiogroup" style={styles.games}>
          {games.map((item) => (
            <GameOption
              key={item.id}
              palette={palette}
              selected={item.id === game.id}
              title={matchLine(item)}
              detail={`${dayLabel(item.startsAt, now)} · ${item.championship}${item.attendance?.attending ? ' · você vai' : ''}`}
              time={formatTime(item.startsAt)}
              onPress={() => {
                if (item.id === game.id) return
                haptic.select()
                set.reset()
                setPicked(item.id)
              }}
            />
          ))}
        </View>

        {game.going ? (
          <Card palette={palette} soft>
            <View style={styles.going}>
              <Faces
                palette={palette}
                initials={game.going.initials}
                count={game.going.count}
              />
              <Text
                style={[
                  text(14.5, 'Bold', 1.4),
                  { color: palette.ink, flex: 1 }
                ]}
              >
                {game.going.count.toLocaleString('pt-BR')} pessoas vão
              </Text>
            </View>
          </Card>
        ) : null}

        {data.houseOffer ? (
          <OfferCard
            palette={palette}
            offer={data.houseOffer}
            note="Vale com o seu código."
          />
        ) : null}

        <Text style={[text(13.5, 'Regular', 1.45), { color: palette.muted }]}>
          {data.issuesCode
            ? 'Não precisa de confirmação do bar. O código sai na hora e fica em Meus jogos.'
            : 'Não precisa de confirmação do bar. O jogo fica em Meus jogos.'}
        </Text>

        <ErrorText style={[text(13.5, 'SemiBold'), { color: LIVE }]}>
          {set.error?.message ?? null}
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
      </View>

      <Glass
        tone={palette.dark ? 'dark' : 'light'}
        style={[styles.dock, { bottom: Math.max(insets.bottom - 6, 14) }]}
      >
        <View style={{ flex: 1 }}>
          <PillButton
            label={label}
            onPress={confirm}
            disabled={set.isPending || (mine.attending && !mine.code)}
          />
        </View>
      </Glass>
    </View>
  )
}

/** Uma linha do "Jogo": rádio, o jogo e a hora, como no design. */
function GameOption({
  palette,
  selected,
  title,
  detail,
  time,
  onPress
}: {
  palette: Palette
  selected: boolean
  title: string
  detail: string
  time: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${detail}, ${time}`}
      onPress={onPress}
    >
      <View
        style={[
          styles.optionShadow,
          { backgroundColor: selected ? ACID : palette.mark }
        ]}
      />
      <View
        style={[
          styles.option,
          {
            backgroundColor: selected
              ? palette.dark
                ? '#22221d'
                : '#fffdf8'
              : palette.card,
            borderColor: selected ? palette.ink : palette.ring,
            borderWidth: selected ? 2 : 1
          }
        ]}
      >
        <View
          style={[
            styles.radio,
            selected
              ? { backgroundColor: palette.ink, borderColor: palette.ink }
              : { borderColor: palette.muted }
          ]}
        >
          {selected ? (
            <Animated.View entering={SWAP} style={styles.radioDot} />
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[text(15, 'Bold', 1.3), { color: palette.ink }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text
            style={[text(12.5, 'Regular', 1.4), { color: palette.muted }]}
            numberOfLines={1}
          >
            {detail}
          </Text>
        </View>
        <Text style={[styles.time, { color: palette.ink }]}>{time}</Text>
      </View>
    </Pressable>
  )
}

/** "M R +32": duas iniciais e o resto num círculo de tinta. */
function Faces({
  palette,
  initials,
  count
}: {
  palette: Palette
  initials: string[]
  count: number
}) {
  const shown = initials.slice(0, 2)
  const rest = count - shown.length
  const faces: [string, string, string][] = [
    ...shown.map((letter, index): [string, string, string] =>
      index ? [letter, LIVE, INK] : [letter, ACID, INK]
    ),
    ...(rest > 0 ? [[`+${rest}`, INK, PAPER] as [string, string, string]] : [])
  ]
  return (
    <View style={{ flexDirection: 'row' }}>
      {faces.map(([label, bg, fg], index) => (
        <View
          key={label}
          style={[
            styles.face,
            {
              marginLeft: index ? -9 : 0,
              backgroundColor: bg,
              borderColor: palette.card
            }
          ]}
        >
          <Text
            style={[text(11, 'Bold', 1.2), { color: fg }]}
            maxFontSizeMultiplier={1}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  body: { paddingHorizontal: 18, paddingTop: 30, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // Anton 34 do design, sem `lineHeight` (corta no iOS): margem negativa.
  title: {
    fontFamily: 'Anton',
    fontSize: 34,
    letterSpacing: -0.68,
    textTransform: 'uppercase',
    marginTop: -8,
    marginBottom: -6
  },
  games: { gap: 12 },
  optionShadow: {
    ...StyleSheet.absoluteFill,
    top: 5,
    left: 5,
    right: -5,
    bottom: -5,
    borderRadius: 6
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: 6
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACID },
  time: {
    fontFamily: 'Anton',
    fontSize: 22,
    marginVertical: -5.5,
    fontVariant: ['tabular-nums']
  },
  going: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12
  },
  face: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dock: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 40,
    padding: 9,
    flexDirection: 'row',
    overflow: 'hidden'
  }
})
