import { gameTitle } from '@findsports_oficial/db/game-title'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card, OfferCard } from '@/components/card'
import { dayLabel } from '@/components/explore'
import { Glass } from '@/components/glass'
import { ErrorText, haptic, SWAP } from '@/components/motion'
import { usePalette } from '@/components/theme'
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
import { formatTime, goingSummary } from '@/lib/explore'
import { trpc } from '@/lib/trpc'

/*
 * "Vou assistir aqui" (3d do design): a folha que confirma o jogo. No bar
 * Elite o servidor já devolve o código do balcão e a folha dá lugar a ele
 * (3f); nos outros, a presença fica marcada e a folha fecha. Não há pedido
 * nem resposta do bar (decisão do dono, 16/10/2026).
 */

// ponytail: seis jogos; a página do bar lista o resto.
const MAX_GAMES = 6

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
  const bar = useQuery(trpc.pubs.getById.queryOptions({ id: barId }))
  const data = bar.data
  // Só os jogos em que o botão cabe: o servidor manda `attendance` neles.
  const games = (data?.events ?? [])
    .filter((game) => game.attendance)
    .slice(0, MAX_GAMES)
  const [picked, setPicked] = useState(eventId)
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
            queryKey: trpc.recommendations.today.queryKey()
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
    return <View style={[styles.sheet]} />
  }

  const confirm = () =>
    mine.attending && mine.code
      ? router.replace(`/codigo/${game.id}`)
      : set.mutate({
          eventId: game.id,
          attending: true,
          recommendationRunId: runId
        })
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

  // O ScrollView é filho direto da tela: é o único jeito de o
  // react-native-screens o medir pelo tamanho da folha. Dentro de uma View
  // ele cai no caminho antigo (RNSScreen.mm), que copia também a origem da
  // folha, e o conteúdo sai do lugar ou some. Por isso o título rola junto.
  return (
    <>
      <ScrollView
        style={{
          flex: 1,
          // O papel do design, um pouco translúcido: o vidro do iOS 26 fica
          // na borda da folha e o que está atrás não atrapalha a leitura.
          backgroundColor: palette.dark
            ? 'rgba(18,18,15,.86)'
            : 'rgba(241,238,230,.86)'
        }}
        contentContainerStyle={[styles.body, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
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
          style={[
            text(13, 'SemiBold'),
            { color: palette.muted, marginBottom: -6 }
          ]}
        >
          Jogo
        </Text>
        <View accessibilityRole="radiogroup" style={styles.games}>
          {games.map((item) => (
            <GameOption
              key={item.id}
              selected={item.id === game.id}
              title={gameTitle(item)}
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

        {going ? (
          <Card soft>
            <View style={styles.going}>
              <Faces faces={going.faces} more={going.more} />
              <Text
                style={[
                  text(13.5, 'Regular', 1.35),
                  { color: palette.ink, flex: 1 }
                ]}
              >
                <Text style={{ fontFamily: 'Archivo-Bold' }}>{going.lead}</Text>
                {going.tail}
              </Text>
            </View>
          </Card>
        ) : null}

        {data.houseOffer ? (
          <OfferCard
            offer={data.houseOffer}
            note="Vale com o seu código."
            compact
          />
        ) : null}

        <Text style={[text(12.5, 'Regular', 1.45), { color: palette.muted }]}>
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
      </ScrollView>

      {/* A cápsula de vidro do design: mais branca que o papel e com
          sombra, senão some sobre ele. */}
      <View
        style={[styles.dockShadow, { bottom: Math.max(insets.bottom - 6, 14) }]}
      >
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          tint={palette.dark ? undefined : 'rgba(255,255,255,.62)'}
          style={styles.dock}
        >
          <View style={{ flex: 1 }}>
            <PillButton
              label={label}
              height={52}
              onPress={confirm}
              disabled={set.isPending || (mine.attending && !mine.code)}
            />
          </View>
        </Glass>
      </View>
    </>
  )
}

/** Uma linha do "Jogo": rádio, o jogo e a hora, como no design. */
function GameOption({
  selected,
  title,
  detail,
  time,
  onPress
}: {
  selected: boolean
  title: string
  detail: string
  time: string
  onPress: () => void
}) {
  const palette = usePalette()
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
                : '#ffffff'
              : palette.card,
            borderColor: selected ? palette.ink : palette.ring,
            borderWidth: selected ? 1.5 : 1
          }
        ]}
      >
        <View
          style={[
            styles.radio,
            selected
              ? { backgroundColor: palette.ink, borderColor: palette.ink }
              : {
                  borderColor: palette.dark
                    ? 'rgba(241,238,230,.3)'
                    : 'rgba(18,18,15,.3)'
                }
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

/** "M R +32": as letras (amigos primeiro) e o resto num círculo de tinta. */
function Faces({ faces, more }: { faces: string[]; more: number }) {
  const palette = usePalette()
  const shown = [
    ...faces.map((label, index) => ({
      key: `face${index}`,
      label,
      bg: index ? LIVE : ACID,
      fg: INK
    })),
    // No escuro, tinta e papel trocam: o "+32" de tinta sumiria no cartão.
    ...(more > 0
      ? [
          {
            key: 'more',
            label: `+${more.toLocaleString('pt-BR')}`,
            bg: palette.dark ? PAPER : INK,
            fg: palette.dark ? INK : PAPER
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
              marginLeft: index ? -9 : 0,
              backgroundColor: bg,
              borderColor: palette.card
            }
          ]}
        >
          <Text
            style={[text(12, 'Bold', 1.2), { color: fg }]}
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
  body: { paddingHorizontal: 18, gap: 14 },
  // O topo do título fica a 31 pt da borda da folha, como no design.
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 31
  },
  // Anton 34 do design, sem `lineHeight` (corta no iOS): margem negativa.
  title: {
    fontFamily: 'Anton',
    fontSize: 34,
    letterSpacing: -0.68,
    textTransform: 'uppercase',
    marginTop: -8,
    marginBottom: -6
  },
  games: { gap: 14 },
  optionShadow: {
    ...StyleSheet.absoluteFill,
    top: 4,
    left: 4,
    right: -4,
    bottom: -4,
    borderRadius: 6
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    paddingVertical: 11,
    paddingHorizontal: 12
  },
  // "+1.282" cresce para o lado em vez de cortar.
  face: {
    minWidth: 32,
    paddingHorizontal: 3,
    height: 32,
    borderRadius: 16,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dockShadow: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,.01)',
    shadowColor: INK,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 12 }
  },
  dock: {
    borderRadius: 35,
    padding: 9,
    flexDirection: 'row',
    overflow: 'hidden'
  }
})
