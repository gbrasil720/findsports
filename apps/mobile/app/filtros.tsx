import { SEARCH_RADIUS_MAX_KM } from '@findsports_oficial/db/search-radius'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View
} from 'react-native'
import MapView from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/card'
import { RadiusCircle } from '@/components/explore'
import { useExploreState } from '@/components/explore-state'
import { Glass } from '@/components/glass'
import { haptic, ScalePress } from '@/components/motion'
import { type Palette, usePalette } from '@/components/theme'
import { ACID, Icon, INK, PAPER, PillButton, text } from '@/components/ui'
import { authClient } from '@/lib/auth-client'
import { searchCenter } from '@/lib/explore'
import {
  activeCount,
  BAR_ITEMS,
  defaultShortcuts,
  type Filters,
  MAX_SHORTCUTS,
  NO_FILTERS,
  PIX_E_CARTAO,
  RADII,
  type Shortcut,
  shortcutLabel,
  sportCode,
  sportsMineFirst,
  toggleAmenity,
  toggleShortcut
} from '@/lib/filters'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * Todos os filtros (19d do design): folha sobre o Explorar. Mexe num rascunho
 * dos filtros e da fileira de atalhos; "Ver N bares" aplica, "Cancelar"
 * descarta. O alfinete de cada filtro fixa ou tira o filtro do topo do mapa.
 * "Só bares com jogo publicado" esconde os bares sem jogo que completam o
 * Explorar; desligado por padrão, ao contrário do design, que o desenha
 * ligado, porque mostrar esses bares foi decisão do dono (21/10/2026).
 * "Pagamento" é um chip só porque o cadastro do bar tem "Pix e cartão"
 * juntos.
 */

export default function FiltersSheet() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const palette = usePalette()
  const state = useExploreState()
  // Colunas de largura fixa: com `flexGrow` o tile que sobra na última
  // linha esticava até a borda.
  const { width } = useWindowDimensions()
  const col3 = (width - 36 - 16) / 3
  const col2 = (width - 36 - 8) / 2
  const session = authClient.useSession()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const prefs = useQuery(trpc.pubs.getMyPreferences.queryOptions())
  const city = useQuery(trpc.pubs.getMyCity.queryOptions())
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
  const center = searchCenter(state.device, city.data)
  const profileRadius = session.data?.user.searchRadiusKm ?? 3
  const radiusKm = Math.min(draft.radius ?? profileRadius, SEARCH_RADIUS_MAX_KM)

  const days = useQuery({
    ...trpc.pubs.gameDays.queryOptions({
      ...center,
      radiusKm,
      sportId: draft.sportId ?? undefined,
      amenities: draft.amenities.length ? draft.amenities : undefined
    }),
    placeholderData: keepPreviousData
  })
  // Quantos bares o rascunho traria: o número do botão.
  const preview = useQuery({
    ...trpc.pubs.search.queryOptions({
      ...center,
      radiusKm,
      date: draft.date ?? undefined,
      sportId: draft.sportId ?? undefined,
      amenities: draft.amenities.length ? draft.amenities : undefined,
      limit: 50
    }),
    placeholderData: keepPreviousData
  })
  const count = preview.data?.bars.length ?? 0
  const more = Boolean(preview.data?.nextCursor)

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
  const active = activeCount(draft)
  const radiusOptions = RADII.includes(profileRadius as never)
    ? RADII
    : [...RADII, profileRadius].sort((a, b) => a - b)

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
          {active ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              // Limpar vale na hora, sem o "Ver N bares": sair da folha
              // depois de limpar não devolve os filtros antigos.
              onPress={() => {
                haptic.select()
                setDraft(NO_FILTERS)
                state.setFilters(NO_FILTERS)
              }}
            >
              <Text style={[text(14, 'Bold'), { color: palette.live }]}>
                Limpar · {active}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Card
          palette={palette}
          shadow={
            palette.dark ? 'rgba(201,241,53,.22)' : 'rgba(201,241,53,.85)'
          }
          offset={5}
          style={[
            styles.pinsCard,
            { backgroundColor: palette.dark ? palette.card : INK }
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
            >
              <Text style={[text(13, 'Bold'), { color: ACID }]}>Editar</Text>
            </Pressable>
          </View>
          <View style={styles.pinsRow}>
            {pins.map((key) => {
              const shown = shortcutLabel(key, sports.data ?? [])
              if (!shown) return null
              return (
                <View key={key} style={styles.pinChip}>
                  {shown.icon ? (
                    <Icon name={shown.icon} size={14} color={PAPER} />
                  ) : null}
                  <Text style={[text(12.5, 'SemiBold', 1.2), { color: PAPER }]}>
                    {shown.label}
                  </Text>
                </View>
              )
            })}
            {pins.length < MAX_SHORTCUTS ? (
              <View style={styles.pinFree}>
                <Text
                  style={[text(12.5, 'Regular', 1.2), { color: '#aaa9a4' }]}
                >
                  + {MAX_SHORTCUTS - pins.length}{' '}
                  {MAX_SHORTCUTS - pins.length === 1 ? 'vaga' : 'vagas'}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[text(12, 'Regular', 1.35), { color: '#aaa9a4' }]}>
            Toque no alfinete de qualquer filtro para fixar ou tirar do topo.
          </Text>
        </Card>

        <Section palette={palette} title="Quando" meta="jogos perto de você">
          <View style={styles.days}>
            {(days.data ?? []).map((d, i) => {
              const on = draft.date === d.day
              return (
                <ScalePress
                  key={d.day}
                  containerStyle={{ flex: 1 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${weekday(d.day, i)}, ${d.games} ${d.games === 1 ? 'jogo' : 'jogos'}`}
                  onPress={() => {
                    haptic.select()
                    setDraft({ ...draft, date: on ? null : d.day })
                  }}
                  style={[
                    styles.day,
                    on
                      ? palette.dark
                        ? { backgroundColor: ACID }
                        : styles.dayOnLight
                      : {
                          backgroundColor: palette.card,
                          borderColor: palette.ring,
                          borderWidth: 1
                        }
                  ]}
                >
                  <Text
                    style={[
                      text(11, 'SemiBold', 1.1),
                      {
                        color: on ? (palette.dark ? INK : PAPER) : palette.muted
                      }
                    ]}
                  >
                    {weekday(d.day, i)}
                  </Text>
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: on ? (palette.dark ? INK : PAPER) : palette.ink }
                    ]}
                  >
                    {Number(d.day.slice(8))}
                  </Text>
                  <Text
                    style={[
                      styles.mono,
                      {
                        color: on ? (palette.dark ? INK : ACID) : palette.muted
                      }
                    ]}
                  >
                    {d.games} jg
                  </Text>
                </ScalePress>
              )
            })}
          </View>
        </Section>

        <Section palette={palette} title="Esporte" meta="seus primeiro">
          <View style={styles.grid3}>
            {sportList.map((sport) => {
              const on = draft.sportId === sport.id
              const key = `esporte:${sport.slug}`
              return (
                <ScalePress
                  key={sport.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic.select()
                    setDraft({ ...draft, sportId: on ? null : sport.id })
                  }}
                  style={[
                    styles.sport,
                    { width: col3 },
                    on
                      ? styles.sportOn
                      : {
                          backgroundColor: palette.card,
                          borderColor: palette.ring,
                          borderWidth: 1
                        }
                  ]}
                >
                  <Text
                    style={[styles.code, { color: on ? INK : palette.ink }]}
                  >
                    {sportCode(sport.name)}
                  </Text>
                  <Text
                    style={[
                      text(14, 'Bold', 1.2),
                      { color: on ? INK : palette.ink }
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {sport.name}
                  </Text>
                  <View style={styles.sportPin}>
                    <PinButton
                      palette={palette}
                      on={pins.includes(key)}
                      onTint={on}
                      full={pins.length >= MAX_SHORTCUTS}
                      label={sport.name}
                      onPress={() => pin(key)}
                    />
                  </View>
                </ScalePress>
              )
            })}
          </View>
        </Section>

        <Section
          palette={palette}
          title="Distância"
          meta={state.district ? `de ${state.district}` : 'de onde você está'}
        >
          <View style={[styles.map, { borderColor: palette.ring }]}>
            <MapView
              style={StyleSheet.absoluteFill}
              region={{
                latitude: center.lat,
                longitude: center.lng,
                // O círculo do raio cabe na altura do recorte.
                latitudeDelta: (radiusKm * 2.6) / 111,
                longitudeDelta: (radiusKm * 2.6) / 111
              }}
              mapType="mutedStandard"
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
            <View style={styles.mapCount}>
              <Glass
                tone={palette.dark ? 'dark' : 'light'}
                style={styles.mapCountGlass}
              >
                <Text
                  style={[text(13.5, 'SemiBold', 1.2), { color: palette.ink }]}
                >
                  <Text style={styles.monoBold}>
                    {count}
                    {more ? '+' : ''}
                  </Text>{' '}
                  {count === 1 ? 'bar' : 'bares'}
                </Text>
              </Glass>
            </View>
          </View>
          <View style={[styles.segment, { backgroundColor: palette.mark }]}>
            {radiusOptions.map((km) => {
              const on = radiusKm === km
              return (
                <Pressable
                  key={km}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic.select()
                    setDraft({
                      ...draft,
                      radius: km === profileRadius ? null : km
                    })
                  }}
                  style={[
                    styles.segmentItem,
                    on && {
                      backgroundColor: palette.dark ? ACID : INK
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.mono13,
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
        </Section>

        <Section palette={palette} title="No bar">
          <View style={styles.grid2}>
            {BAR_ITEMS.map((item) => {
              const on = draft.amenities.includes(item.id)
              const key = `item:${item.id}`
              return (
                <ScalePress
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    haptic.select()
                    setDraft(toggleAmenity(draft, item.id))
                  }}
                  style={[
                    styles.item,
                    { width: col2 },
                    on
                      ? [
                          styles.itemOn,
                          {
                            backgroundColor: palette.dark
                              ? palette.card
                              : '#fff',
                            borderColor: palette.dark ? ACID : INK
                          }
                        ]
                      : {
                          backgroundColor: palette.card,
                          borderColor: palette.ring,
                          borderWidth: 1
                        }
                  ]}
                >
                  <Icon name={item.icon} size={20} color={palette.ink} />
                  <Text
                    style={[
                      text(13.5, 'Bold', 1.15),
                      { color: palette.ink, flex: 1 }
                    ]}
                  >
                    {item.label}
                  </Text>
                  <PinButton
                    palette={palette}
                    on={pins.includes(key)}
                    full={pins.length >= MAX_SHORTCUTS}
                    label={item.label}
                    onPress={() => pin(key)}
                  />
                </ScalePress>
              )
            })}
          </View>
        </Section>

        <Section palette={palette} title="Pagamento">
          <View style={{ flexDirection: 'row' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                selected: draft.amenities.includes(PIX_E_CARTAO)
              }}
              onPress={() => {
                haptic.select()
                setDraft(toggleAmenity(draft, PIX_E_CARTAO))
              }}
              style={[
                styles.pay,
                draft.amenities.includes(PIX_E_CARTAO)
                  ? { backgroundColor: ACID, borderColor: ACID }
                  : { borderColor: palette.line }
              ]}
            >
              <Text
                style={[
                  text(13, 'SemiBold', 1.2),
                  {
                    color: draft.amenities.includes(PIX_E_CARTAO)
                      ? INK
                      : palette.ink
                  }
                ]}
              >
                Pix e cartão
              </Text>
            </Pressable>
          </View>
        </Section>

        <View
          style={[
            styles.gamesOnly,
            { backgroundColor: palette.card, borderColor: palette.ring }
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}>
              Só bares com jogo publicado
            </Text>
            <Text
              style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
            >
              Esconde quem ainda não montou a agenda
            </Text>
          </View>
          <Switch
            accessibilityLabel="Só bares com jogo publicado"
            value={draft.gamesOnly}
            onValueChange={(gamesOnly) => {
              haptic.select()
              setDraft({ ...draft, gamesOnly })
            }}
            trackColor={{
              false: palette.line,
              true: palette.dark ? ACID : INK
            }}
            ios_backgroundColor={palette.line}
          />
        </View>
      </ScrollView>

      {/* A cápsula de vidro do rodapé, como a da folha "Vou assistir aqui". */}
      <View
        style={[styles.dockShadow, { bottom: Math.max(insets.bottom - 6, 14) }]}
      >
        <Glass
          tone={palette.dark ? 'dark' : 'light'}
          tint={palette.dark ? undefined : 'rgba(255,255,255,.62)'}
          style={styles.dock}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={[
              styles.cancel,
              {
                backgroundColor: palette.dark
                  ? 'rgba(241,238,230,.08)'
                  : 'rgba(255,255,255,.5)',
                borderColor: palette.ring
              }
            ]}
          >
            <Text style={[text(15, 'Bold'), { color: palette.ink }]}>
              Cancelar
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PillButton
              label={
                count || !preview.isFetched
                  ? `Ver ${count}${more ? '+' : ''} ${count === 1 ? 'bar' : 'bares'}`
                  : 'Nenhum bar'
              }
              height={52}
              onPress={apply}
            />
          </View>
        </Glass>
      </View>
    </>
  )
}

/** "Hoje" para o primeiro dia; depois "Ter", "Qua"... */
function weekday(day: string, index: number) {
  if (index === 0) return 'Hoje'
  return new Date(`${day}T12:00:00Z`)
    .toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
    .replace('.', '')
    .replace(/^./, (c) => c.toUpperCase())
}

function Section({
  palette,
  title,
  meta,
  children
}: {
  palette: Palette
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sectionHead}>
        <Text style={[text(15, 'Bold'), { color: palette.ink }]}>{title}</Text>
        {meta ? (
          <Text style={[text(12.5), { color: palette.muted }]}>{meta}</Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

/** O alfinete que fixa o filtro no topo do mapa. */
function PinButton({
  palette,
  on,
  onTint,
  full,
  label,
  onPress
}: {
  palette: Palette
  on: boolean
  /** Sobre o tile ligado (acid): o alfinete vai em tinta. */
  onTint?: boolean
  /** Fileira cheia: fixar outro não cabe, só tirar. */
  full: boolean
  label: string
  onPress: () => void
}) {
  const lit = on ? (palette.dark && !onTint ? ACID : INK) : 'transparent'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        on ? `Tirar ${label} do mapa` : `Fixar ${label} no mapa`
      }
      accessibilityState={{ selected: on, disabled: !on && full }}
      hitSlop={8}
      onPress={on || !full ? onPress : () => haptic.error()}
      style={[
        styles.pin,
        { backgroundColor: lit },
        !on && { borderWidth: 1, borderColor: palette.line },
        !on && full && { opacity: 0.4 }
      ]}
    >
      <Icon
        name="pin"
        size={13}
        color={on ? (lit === ACID ? INK : ACID) : palette.muted}
        accent={on ? (lit === ACID ? INK : ACID) : palette.muted}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: 18, paddingTop: 22, gap: 22 },
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
  pinsCard: { paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  pinsHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: 'rgba(241,238,230,.12)',
    borderWidth: 1,
    borderColor: 'rgba(241,238,230,.2)'
  },
  pinFree: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(241,238,230,.3)',
    justifyContent: 'center'
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline'
  },
  days: { flexDirection: 'row', gap: 6 },
  day: {
    flex: 1,
    height: 70,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  dayOnLight: {
    backgroundColor: INK,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  dayNumber: {
    fontFamily: 'Anton',
    fontSize: 20,
    lineHeight: 30,
    marginVertical: -5
  },
  mono: { fontFamily: 'GeistMono-SemiBold', fontSize: 10 },
  mono13: { fontFamily: 'GeistMono-SemiBold', fontSize: 13 },
  monoBold: { fontFamily: 'GeistMono-SemiBold' },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sport: {
    height: 72,
    borderRadius: 5,
    padding: 10,
    justifyContent: 'space-between'
  },
  sportOn: {
    backgroundColor: ACID,
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  code: { fontFamily: 'GeistMono-SemiBold', fontSize: 11, letterSpacing: 0.66 },
  sportPin: { position: 'absolute', right: 7, top: 7 },
  map: {
    height: 104,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1
  },
  mapCount: { position: 'absolute', right: 10, top: 10 },
  mapCountGlass: {
    height: 38,
    paddingHorizontal: 15,
    borderRadius: 19,
    justifyContent: 'center',
    overflow: 'hidden'
  },
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 6 },
  segmentItem: {
    flex: 1,
    height: 34,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: {
    height: 54,
    borderRadius: 5,
    paddingLeft: 12,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  itemOn: {
    borderWidth: 1.5,
    shadowColor: ACID,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 }
  },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  gamesOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 7,
    borderWidth: 1
  },
  pay: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 5,
    borderWidth: 1,
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
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden'
  },
  cancel: {
    height: 52,
    paddingHorizontal: 20,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center'
  }
})
