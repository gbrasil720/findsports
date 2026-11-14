import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View
} from 'react-native'
import { HardShadow } from '@/components/explore'
import { DotField } from '@/components/fan-card'
import { haptic } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  errorMessage,
  Icon,
  INK,
  LIVE,
  PAPER,
  Text,
  text
} from '@/components/ui'
import { formatTime } from '@/lib/explore'
import { queryClient, trpc } from '@/lib/trpc'

/*
 * Jogos da semana pra você no app do bar (WEB-433; pranchas AH, AJ, AN, AP e
 * C-estados do canvas "Jogos da semana pra você"): o card Placar em tinta
 * (quando, o confronto, torcedores dos dois times na cidade, bares do bairro
 * que passam, onde passa) e os outros da semana em linha. Em Hoje e em Jogos
 * os cards correm para o lado, o próximo aparecendo pela borda; no Novo jogo
 * eles são a escolha do jogo.
 *
 * Só com o catálogo (`featured` numa sugestão). Sem ele, quem chama mostra o
 * que mostrava antes (as sugestões dos bares perto).
 */

export type WeekGame = NonNullable<
  ReturnType<typeof useWeekGames>['data']
>[number]

/** O teto do servidor (`GAME_SUGGESTION_MAX`). */
const LIMIT = 10

export function useWeekGames(enabled = true) {
  return useQuery({
    ...trpc.pub.gameSuggestions.queryOptions({ limit: LIMIT }),
    enabled
  })
}

export const hasCatalog = (list: readonly WeekGame[] | undefined) =>
  Boolean(list?.some((game) => game.featured))

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** "Sáb 14 · 18:00". */
export function weekWhen(startsAt: string) {
  const day = brasiliaDay(startsAt)
  const date = new Date(`${day}T12:00:00Z`)
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} · ${formatTime(startsAt)}`
}

/** "AMANHÃ", "HOJE" ou "SEX", para a caixa da linha. */
export function rowDay(startsAt: string) {
  const day = brasiliaDay(startsAt)
  if (day === brasiliaDay(Date.now())) return 'HOJE'
  if (day === brasiliaDay(Date.now(), 1)) return 'AMANHÃ'
  return (
    DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? ''
  ).toLocaleUpperCase('pt-BR')
}

const n = (v: number) => v.toLocaleString('pt-BR')

/** "2.150 na cidade · 3 no bairro · ESPN". */
export function weekLine(game: WeekGame) {
  if (!game.catalogId) return `${game.championship} · bares perto já marcaram`
  return [
    game.fansInCity == null ? null : `${n(game.fansInCity)} na cidade`,
    `${n(game.barsInNeighborhood ?? 0)} no bairro`,
    game.channels?.length
      ? game.channels.slice(0, 2).join(' · ')
      : 'canal a confirmar'
  ]
    .filter(Boolean)
    .join(' · ')
}

function Title({ title, size }: { title: string; size: number }) {
  const sides = title.split(' × ')
  return (
    <Text
      numberOfLines={2}
      maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
      // Anton abaixo de 1,505 em corta o acento no iOS (AGENTS.md, "Fontes").
      style={[
        styles.title,
        {
          fontSize: size,
          lineHeight: size * 1.505,
          marginVertical: -size * 0.2
        }
      ]}
    >
      {sides.length === 2 ? (
        <>
          {sides[0]} <Text style={{ color: ACID }}>×</Text> {sides[1]}
        </>
      ) : (
        title
      )}
    </Text>
  )
}

function Cell({
  value,
  label,
  hot,
  tv,
  dashed
}: {
  value: string
  label: string
  hot?: boolean
  tv?: boolean
  dashed?: boolean
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${value} ${label}`}
      style={[styles.cell, dashed && styles.cellDashed]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
        style={[
          styles.cellValue,
          tv && styles.cellTv,
          { color: hot ? ACID : PAPER }
        ]}
      >
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.cellLabel}>
        {label}
      </Text>
    </View>
  )
}

/** O card Placar. `children` são as ações (Publicar, Não passo esse). */
export function PlacarCard({
  game,
  width,
  selected,
  showReason = true,
  children
}: {
  game: WeekGame
  width?: number
  /** No Novo jogo: o escolhido ganha o contorno acid e o visto. */
  selected?: boolean
  showReason?: boolean
  children?: React.ReactNode
}) {
  const bars = game.barsInNeighborhood ?? 0
  return (
    <View style={{ width }}>
      <HardShadow
        color={selected ? '#7f9a12' : '#000'}
        offset={5}
        radius={22}
      />
      <View style={[styles.card, selected && styles.cardOn]}>
        <DotField id={`semana-${game.key}`} radius={22} />
        <View style={styles.top}>
          <Text maxFontSizeMultiplier={1.2} style={styles.when}>
            {weekWhen(game.startsAt).toLocaleUpperCase('pt-BR')}
          </Text>
          <View style={styles.tags}>
            {game.houseTeam ? (
              <View style={styles.tag}>
                <Text maxFontSizeMultiplier={1.2} style={styles.tagText}>
                  SEU TIME
                </Text>
              </View>
            ) : null}
            {game.classic ? (
              <View style={[styles.tag, styles.tagClassic]}>
                <Text
                  maxFontSizeMultiplier={1.2}
                  style={[styles.tagText, styles.tagClassicText]}
                >
                  CLÁSSICO
                </Text>
              </View>
            ) : null}
            {selected ? (
              <View style={styles.check}>
                <Icon name="check" size={13} color={INK} />
              </View>
            ) : null}
          </View>
        </View>
        <Title title={game.title} size={width && width < 330 ? 26 : 29} />
        <View style={styles.cells}>
          <Cell
            hot
            value={game.fansInCity == null ? '—' : n(game.fansInCity)}
            label="torcedores na cidade"
          />
          <Cell
            value={n(bars)}
            label={bars === 1 ? 'bar no bairro' : 'bares no bairro'}
          />
          {game.channels?.length ? (
            <Cell tv value={game.channels[0] ?? ''} label="onde passa" />
          ) : (
            <Cell tv dashed value="A confirmar" label="até quinta" />
          )}
        </View>
        {showReason && game.reason ? (
          <Text style={styles.reason}>{game.reason}.</Text>
        ) : null}
        {children}
      </View>
    </View>
  )
}

/** "Publicar com telão e som" e "Não passo esse", direto do card. */
function CardActions({ game }: { game: WeekGame }) {
  const [problem, setProblem] = useState<string | null>(null)
  const done = () => {
    haptic.success()
    queryClient.invalidateQueries()
  }
  const create = useMutation(
    trpc.pub.createEvent.mutationOptions({
      onSuccess: done,
      onError: (error) => {
        haptic.error()
        setProblem(errorMessage(error, 'Não deu para publicar. Tente de novo.'))
      }
    })
  )
  const dismiss = useMutation(
    trpc.pub.dismissGameSuggestion.mutationOptions({
      onSuccess: done,
      onError: (error) =>
        setProblem(errorMessage(error, 'Não deu para tirar. Tente de novo.'))
    })
  )
  const busy = create.isPending || dismiss.isPending
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => {
          setProblem(null)
          create.mutate({
            sportId: game.sportId,
            championship: game.championship,
            startsAt: game.startsAt,
            participantIds: game.participantIds.length
              ? game.participantIds
              : undefined,
            participantFreeText: game.participantFreeText ?? undefined
          })
        }}
      >
        <View style={styles.pillDrop} />
        <View style={styles.pill}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
            style={styles.pillText}
          >
            {create.isPending ? 'Publicando…' : 'Publicar com telão e som'}
          </Text>
        </View>
      </Pressable>
      {game.catalogId ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          hitSlop={6}
          onPress={() => {
            setProblem(null)
            if (game.catalogId) dismiss.mutate({ catalogId: game.catalogId })
          }}
          style={styles.skip}
        >
          <Text maxFontSizeMultiplier={1.2} style={styles.skipText}>
            {dismiss.isPending ? 'Tirando…' : 'Não passo esse'}
          </Text>
        </Pressable>
      ) : null}
      {problem ? (
        <Text accessibilityRole="alert" style={styles.problem}>
          {problem}
        </Text>
      ) : null}
    </View>
  )
}

/** "Dados de jogos: football-data.org", perto da lista (obrigatório). */
export function FootballDataNote() {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL('https://www.football-data.org')}
      hitSlop={6}
    >
      <Text style={[text(12, 'Regular', 1.3), { color: palette.muted }]}>
        Dados de jogos: football-data.org
      </Text>
    </Pressable>
  )
}

/**
 * "Esta semana pra você": os cards correm para o lado, o próximo pela borda,
 * com os pontos embaixo e "Ver todos" no Novo jogo. Sem catálogo, nada.
 */
export function WeekCarousel({
  gutter = 16,
  canCreate = true
}: {
  /** A margem da tela: o carrossel vai até a borda. */
  gutter?: number
  canCreate?: boolean
}) {
  const router = useRouter()
  const palette = usePalette()
  const { width } = useWindowDimensions()
  const games = useWeekGames(canCreate)
  const [page, setPage] = useState(0)
  const list = games.data ?? []
  if (!canCreate || !hasCatalog(list)) return null
  const card = Math.min(358, width - gutter * 2)
  const step = card + 10
  const pages = Math.min(list.length, 5)
  return (
    <View style={{ marginHorizontal: -gutter, gap: 10 }}>
      <View style={[styles.head, { paddingHorizontal: gutter }]}>
        <Text style={[styles.headText, { color: palette.muted }]}>
          {`ESTA SEMANA PRA VOCÊ · ${list.length}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/novo-jogo')}
        >
          <Text style={[text(13.5, 'Bold', 1.2), { color: palette.ink }]}>
            Ver todos ›
          </Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: 10 }}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / step))
        }
      >
        {list.slice(0, pages).map((game, index) => (
          <PlacarCard
            key={game.key}
            game={game}
            width={card}
            showReason={index === 0}
          >
            {index === 0 ? <CardActions game={game} /> : null}
          </PlacarCard>
        ))}
      </ScrollView>
      <View style={styles.dots} accessibilityElementsHidden>
        {Array.from({ length: pages }, (_, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: os pontos são posições.
            key={i}
            style={[
              styles.dotMark,
              {
                width: i === page ? 18 : 6,
                backgroundColor: i === page ? palette.ink : palette.line
              }
            ]}
          />
        ))}
      </View>
      <View style={{ paddingHorizontal: gutter }}>
        <FootballDataNote />
      </View>
    </View>
  )
}

/** Uma linha de "Outros desta semana" no Novo jogo. */
export function WeekRow({
  game,
  selected,
  onPress
}: {
  game: WeekGame
  selected: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <HardShadow color={palette.drop} offset={3} radius={18} />
      <View
        style={[
          styles.row,
          {
            backgroundColor: palette.card,
            borderColor: selected ? palette.ink : 'transparent'
          }
        ]}
      >
        <View style={styles.rowDay}>
          <Text style={[styles.rowWeekday, { color: palette.muted }]}>
            {rowDay(game.startsAt)}
          </Text>
          <Text style={[styles.rowTime, { color: palette.ink }]}>
            {formatTime(game.startsAt)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[text(15, 'Bold', 1.25), { color: palette.ink }]}
          >
            {game.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
          >
            {weekLine(game)}
          </Text>
        </View>
        {selected ? (
          <View style={styles.check}>
            <Icon name="check" size={13} color={INK} />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2
  },
  card: {
    backgroundColor: INK,
    borderRadius: 22,
    padding: 18,
    gap: 12,
    overflow: 'hidden'
  },
  cardOn: { borderWidth: 2, borderColor: ACID },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 22
  },
  when: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 1.05,
    color: ACID
  },
  tags: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  tag: {
    backgroundColor: ACID,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  tagText: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 9.5,
    letterSpacing: 0.95,
    color: INK
  },
  // "Clássico" (WEB-529): vermelho do ao vivo; o card é escuro nos dois temas.
  tagClassic: { backgroundColor: LIVE },
  tagClassicText: { color: PAPER },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontFamily: 'Anton',
    textTransform: 'uppercase',
    color: PAPER
  },
  cells: { flexDirection: 'row', gap: 6 },
  cell: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(241,238,230,.06)',
    borderRadius: 14,
    padding: 10,
    gap: 6
  },
  cellDashed: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.35)'
  },
  cellValue: {
    fontFamily: 'Anton',
    fontSize: 22,
    lineHeight: 33,
    marginVertical: -5,
    fontVariant: ['tabular-nums']
  },
  cellTv: {
    fontSize: 15,
    lineHeight: 23,
    marginVertical: -1,
    textTransform: 'uppercase'
  },
  cellLabel: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 8.5,
    lineHeight: 11.5,
    letterSpacing: 0.85,
    textTransform: 'uppercase',
    color: '#aaa9a4'
  },
  reason: {
    ...text(13, 'Regular', 1.4),
    color: '#dedbd4'
  },
  pillDrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 4,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#7f9a12'
  },
  pill: {
    height: 44,
    borderRadius: 999,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  pillText: { ...text(14.5, 'Bold', 1.2), color: INK },
  skip: { height: 32, alignItems: 'center', justifyContent: 'center' },
  skipText: { ...text(13.5, 'Bold', 1.2), color: '#aaa9a4' },
  problem: { ...text(13, 'Regular', 1.35), color: '#f6b8a6' },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dotMark: { height: 6, borderRadius: 3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 2
  },
  rowDay: { width: 58 },
  rowWeekday: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 10.5,
    letterSpacing: 0.84
  },
  rowTime: { fontFamily: 'GeistMono-SemiBold', fontSize: 17 }
})
