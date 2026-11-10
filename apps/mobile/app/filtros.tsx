import { brasiliaDay } from '@findsports_oficial/db/event-window'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useExploreState } from '@/components/explore-state'
import { haptic, ScalePress } from '@/components/motion'
import { usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, PillButton, Text, text } from '@/components/ui'
import { useFan } from '@/lib/account'
import { authClient } from '@/lib/auth-client'
import { searchCenter } from '@/lib/explore'
import { barCount, gameRow } from '@/lib/explore-board'
import {
  defaultShortcuts,
  FILTER_GROUPS,
  type Filters,
  MAX_SHORTCUTS,
  NO_FILTERS,
  type Shortcut,
  searchRadius,
  shortcutLabel,
  sportLook,
  sportsMineFirst,
  toggleAmenity,
  toggleShortcut
} from '@/lib/filters'
import { trpc } from '@/lib/trpc'

/*
 * Filtros (Tela 2 da rodada 5, 19d): folha sobre o Explorar. Mexe num
 * rascunho dos filtros e da fileira de atalhos; "Ver N bares" aplica e o X
 * descarta. No topo, "Atalhos no mapa": o que está fixado, as vagas e
 * "Ordenar" (a 19e). Cada filtro tem o alfinete, que fixa ou tira do topo.
 * "Só bares com jogo publicado" fica no alto porque muda tudo embaixo, e
 * nasce desligado (mostrar os bares sem jogo foi decisão do dono, 21/10/2026).
 * A distância não está aqui: é o chip "Até N km" do Explorar.
 */

export default function FiltersSheet() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const state = useExploreState()
  const session = authClient.useSession()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  // Sem conta (o Explorar abre aberto): sem preferências nem cidade do
  // perfil; a cidade é a escolhida no aparelho.
  const fan = useFan()
  const prefs = useQuery({
    ...trpc.pubs.getMyPreferences.queryOptions(),
    enabled: fan
  })
  const city = useQuery({ ...trpc.pubs.getMyCity.queryOptions(), enabled: fan })
  const mine = (prefs.data ?? []).map((p) => p.sportId)
  const sportList = sportsMineFirst(sports.data ?? [], mine)
  const [draft, setDraft] = useState<Filters>(state.filters)
  const [pins, setPins] = useState<Shortcut[]>(
    state.shortcuts ?? defaultShortcuts(prefs.data?.[0]?.sport.slug ?? null)
  )
  // Voltando da edição (19e), a fileira salva lá vale também aqui. A
  // comparação é na renderização, não em efeito, como no resto do app.
  const [seen, setSeen] = useState(state.shortcuts)
  if (seen !== state.shortcuts) {
    setSeen(state.shortcuts)
    if (state.shortcuts) setPins(state.shortcuts)
  }
  const center = searchCenter(state.device, fan ? city.data : state.localCity)
  const radiusKm = searchRadius(draft, session.data?.user.searchRadiusKm ?? 3)

  const days = useQuery({
    ...trpc.pubs.gameDays.queryOptions({
      ...center,
      radiusKm,
      sportId: draft.sportId ?? undefined,
      amenities: draft.amenities.length ? draft.amenities : undefined
    }),
    placeholderData: keepPreviousData
  })
  // Quantos bares o rascunho traria: os que passam algum jogo do dia na
  // régua, a mesma conta do Explorar (`lib/explore-board.ts`).
  const preview = useQuery({
    ...trpc.pubs.gameBoard.queryOptions({
      ...center,
      radiusKm,
      day: draft.date ?? brasiliaDay(Date.now())
    }),
    placeholderData: keepPreviousData
  })
  const sportSlug =
    sports.data?.find((sport) => sport.id === draft.sportId)?.slug ?? null
  const count = barCount(
    gameRow(preview.data?.games ?? [], sportSlug, Date.now()),
    draft.amenities
  )
  const full = pins.length >= MAX_SHORTCUTS

  const pin = (key: Shortcut) => {
    haptic.select()
    setPins((list) => toggleShortcut(list, key))
  }
  const apply = () => {
    haptic.success()
    state.setFilters(draft)
    state.setShortcuts(pins)
    router.back()
  }

  return (
    <>
      {/* Filho direto da tela, com flex: 1: numa folha nativa o
          react-native-screens mede outro caminho e o conteúdo some. */}
      <ScrollView
        style={[styles.screen, { backgroundColor: palette.sheet }]}
        contentContainerStyle={[
          styles.body,
          { paddingBottom: insets.bottom + 110 }
        ]}
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: palette.ink }]}>Filtros</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar sem aplicar"
            hitSlop={6}
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: palette.mark }]}
          >
            <Icon name="close" size={20} color={palette.ink} />
          </Pressable>
        </View>

        <View
          style={[
            styles.pinsCard,
            palette.dark && { backgroundColor: '#26261f' }
          ]}
        >
          <View style={styles.pinsHead}>
            <Icon name="pin" size={15} color={ACID} accent={ACID} />
            <Text style={[text(14, 'Bold'), { color: PAPER, flex: 1 }]}>
              Atalhos no mapa · {pins.length} de {MAX_SHORTCUTS}
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => {
                // A ordem é editada na 19e, sobre o que já foi fixado aqui.
                state.setShortcuts(pins)
                router.push('/atalhos')
              }}
              style={styles.order}
            >
              <Text style={[text(13, 'Bold'), { color: ACID }]}>Ordenar</Text>
              <Icon name="next" size={14} color={ACID} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pinsRow}
          >
            {pins.map((key) => {
              const shown = shortcutLabel(key, sports.data ?? [])
              if (!shown) return null
              return (
                <View key={key} style={styles.pinChip}>
                  {shown.icon ? (
                    <Icon
                      name={shown.icon}
                      size={16}
                      color={PAPER}
                      accent={ACID}
                    />
                  ) : null}
                  <Text style={[text(12.5, 'SemiBold', 1.2), { color: PAPER }]}>
                    {shown.label}
                  </Text>
                </View>
              )
            })}
            {pins.length < MAX_SHORTCUTS ? (
              <View style={styles.pinFree}>
                <Text style={[text(12, 'SemiBold', 1.2), { color: '#aaa9a4' }]}>
                  + {MAX_SHORTCUTS - pins.length}{' '}
                  {MAX_SHORTCUTS - pins.length === 1 ? 'vaga' : 'vagas'}
                </Text>
              </View>
            ) : null}
          </ScrollView>
          <Text style={[text(12, 'Regular', 1.35), { color: '#aaa9a4' }]}>
            Toque no alfinete de qualquer filtro para fixar ou tirar do topo.
          </Text>
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: draft.gamesOnly }}
          onPress={() => {
            haptic.select()
            setDraft({ ...draft, gamesOnly: !draft.gamesOnly })
          }}
          style={[
            styles.toggle,
            { backgroundColor: palette.card, shadowColor: palette.drop }
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={[text(14.5, 'SemiBold', 1.25), { color: palette.ink }]}
            >
              Só bares com jogo publicado
            </Text>
            <Text
              style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
            >
              Esconde os bares sem jogo marcado.
            </Text>
          </View>
          <Switch on={draft.gamesOnly} />
        </Pressable>

        <Group title="Quando">
          <View style={styles.days}>
            {(days.data ?? []).slice(0, 3).map((d, i) => {
              const on = draft.date === d.day
              return (
                <ScalePress
                  key={d.day}
                  containerStyle={{ flex: 1 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic.select()
                    setDraft({ ...draft, date: on ? null : d.day })
                  }}
                  style={[
                    styles.day,
                    on
                      ? { backgroundColor: palette.ink, shadowColor: '#000' }
                      : {
                          backgroundColor: palette.card,
                          shadowColor: palette.drop
                        }
                  ]}
                >
                  <Text
                    style={[
                      text(14, 'Bold', 1.2),
                      { color: on ? palette.bg : palette.ink }
                    ]}
                  >
                    {dayName(d.day, i)}
                  </Text>
                  <Text
                    style={[
                      styles.mono,
                      on
                        ? { color: palette.bg, opacity: 0.7 }
                        : { color: palette.muted }
                    ]}
                  >
                    {d.games} {d.games === 1 ? 'jogo' : 'jogos'}
                  </Text>
                </ScalePress>
              )
            })}
          </View>
        </Group>

        <Group title="Esporte">
          {sportList.map((sport) => {
            const look = sportLook(sport)
            const key = `esporte:${sport.slug}`
            return (
              <FilterChip
                key={sport.id}
                label={look.label}
                icon={look.icon}
                on={draft.sportId === sport.id}
                pinned={pins.includes(key)}
                full={full}
                onPress={() =>
                  setDraft({
                    ...draft,
                    sportId: draft.sportId === sport.id ? null : sport.id
                  })
                }
                onPin={() => pin(key)}
              />
            )
          })}
        </Group>

        {FILTER_GROUPS.map((group) => (
          <Group key={group.title} title={group.title}>
            {group.items.map((item) => {
              const key = `item:${item.id}`
              return (
                <FilterChip
                  key={item.id}
                  label={item.label}
                  icon={item.icon}
                  on={draft.amenities.includes(item.id)}
                  pinned={pins.includes(key)}
                  full={full}
                  onPress={() => setDraft(toggleAmenity(draft, item.id))}
                  onPin={() => pin(key)}
                />
              )
            })}
          </Group>
        ))}
      </ScrollView>

      <View
        style={[
          styles.foot,
          {
            backgroundColor: palette.sheet,
            borderTopColor: palette.line,
            paddingBottom: Math.max(insets.bottom, 12) + 12
          }
        ]}
      >
        <Pressable
          accessibilityRole="button"
          // Limpar vale na hora, sem o "Ver N bares": sair da folha depois
          // de limpar não devolve os filtros antigos.
          onPress={() => {
            haptic.select()
            setDraft(NO_FILTERS)
            state.setFilters(NO_FILTERS)
          }}
          style={[styles.clear, { borderColor: palette.line }]}
        >
          <Text style={[text(16, 'Bold'), { color: palette.ink }]}>Limpar</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PillButton
            label={
              preview.isFetching
                ? 'Contando…'
                : count || !preview.isFetched
                  ? `Ver ${count} ${count === 1 ? 'bar' : 'bares'}`
                  : 'Nenhum bar'
            }
            height={52}
            onPress={apply}
          />
        </View>
      </View>
    </>
  )
}

/** "Hoje", "Amanhã", depois "Qua 11". */
function dayName(day: string, index: number) {
  if (index === 0) return 'Hoje'
  if (index === 1) return 'Amanhã'
  const weekday = new Date(`${day}T12:00:00Z`)
    .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .replace('.', '')
  return `${weekday.replace(/^./, (c) => c.toUpperCase())} ${Number(day.slice(8))}`
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const palette = usePalette()
  return (
    <View style={{ gap: 9 }}>
      <Text style={[text(15, 'Bold'), { color: palette.ink }]}>{title}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  )
}

/** O interruptor do desenho: acid com a bolinha de tinta, ou apagado. */
function Switch({ on }: { on: boolean }) {
  const palette = usePalette()
  return (
    <View
      style={[styles.switch, { backgroundColor: on ? ACID : palette.mark }]}
    >
      <View
        style={[
          styles.knob,
          on
            ? { right: 3, backgroundColor: INK }
            : { left: 3, backgroundColor: palette.card }
        ]}
      />
    </View>
  )
}

/** O chip do filtro com o alfinete que fixa no topo do mapa. */
function FilterChip({
  label,
  icon,
  on,
  pinned,
  full,
  onPress,
  onPin
}: {
  label: string
  icon?: Parameters<typeof Icon>[0]['name']
  on: boolean
  pinned: boolean
  /** Fileira cheia: fixar outro não cabe, só tirar. */
  full: boolean
  onPress: () => void
  onPin: () => void
}) {
  const palette = usePalette()
  const fg = on ? palette.bg : palette.ink
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={() => {
        haptic.select()
        onPress()
      }}
      style={[
        styles.chip,
        { backgroundColor: on ? palette.ink : palette.mark }
      ]}
    >
      {icon ? (
        <Icon name={icon} size={16} color={fg} accent={on ? ACID : undefined} />
      ) : null}
      <Text style={[text(13.5, 'SemiBold', 1.2), { color: fg }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          pinned ? `Tirar ${label} do mapa` : `Fixar ${label} no mapa`
        }
        accessibilityState={{ selected: pinned, disabled: !pinned && full }}
        hitSlop={8}
        onPress={pinned || !full ? onPin : () => haptic.error()}
        style={[
          styles.pin,
          pinned
            ? { backgroundColor: ACID }
            : { borderColor: fg, borderWidth: 1.5, opacity: 0.35 }
        ]}
      >
        <Icon
          name="pin"
          size={12}
          color={pinned ? INK : fg}
          accent={pinned ? INK : fg}
        />
      </Pressable>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 18, paddingTop: 22, gap: 16 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontFamily: 'Anton',
    fontSize: 34,
    textTransform: 'uppercase',
    letterSpacing: -0.7
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pinsCard: {
    borderRadius: 20,
    backgroundColor: INK,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  pinsHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  order: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pinsRow: { gap: 6 },
  pinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 32,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: 'rgba(241,238,230,.1)'
  },
  pinFree: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(241,238,230,.25)',
    justifyContent: 'center'
  },
  toggle: {
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
  switch: { width: 50, height: 30, borderRadius: 15 },
  knob: {
    position: 'absolute',
    top: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 1.5,
    shadowOffset: { width: 0, height: 1 }
  },
  days: { flexDirection: 'row', gap: 8, width: '100%' },
  day: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 36,
    paddingLeft: 13,
    paddingRight: 7,
    borderRadius: 18
  },
  pin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  clear: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center'
  }
})
