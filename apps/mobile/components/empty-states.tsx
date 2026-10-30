import { useQuery } from '@tanstack/react-query'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg'
import { Card } from '@/components/card'
import { dropBox, HardShadow, MapDrop, MeDot } from '@/components/explore'
import { Medal3D, MedalImage } from '@/components/medal'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  LIVE,
  PAPER,
  PillButton,
  Text,
  Toggle,
  text
} from '@/components/ui'
import { type Achievement, firstToUnlock } from '@/lib/achievements'
import { isLive } from '@/lib/explore'
import { NO_FILTERS, searchInput } from '@/lib/filters'
import { MAP_STYLE } from '@/lib/map-style'
import { trpc } from '@/lib/trpc'

/*
 * Os vazios da Rodada 14 do design (`gen/build14.js`), que o Adaptativo 10
 * leva para tablet e dobrável (WEB-492): a ilustração, o título com o
 * destaque e a ação de cada tela. Cada tela põe o seu no lugar da frase de
 * antes; o arranjo em volta (coluna, ajuda ao lado) é da tela.
 */

const LIVE_INK = '#f3421d'

/** As cores tracejadas do design (`dash`): tinta ou papel em transparência. */
const dashColor = (dark: boolean, alpha = 0.22) =>
  dark ? `rgba(241,238,230,${alpha})` : `rgba(18,18,15,${alpha})`

/** Título em Anton com o trecho em destaque no fim ("Nenhum bar salvo ainda."). */
export function EmptyTitle({
  plain,
  accent,
  size = 34
}: {
  plain: string
  accent: string
  size?: number
}) {
  const palette = usePalette()
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
      style={{
        fontFamily: 'Anton',
        fontSize: size,
        letterSpacing: -0.02 * size,
        textTransform: 'uppercase',
        color: palette.ink,
        marginVertical: -0.2425 * size
      }}
    >
      {plain}
      <Text style={{ color: palette.dark ? ACID : '#c92b0c' }}>{accent}</Text>
    </Text>
  )
}

/** Título e texto do vazio (`eCopy`). */
function Copy({
  plain,
  accent,
  body,
  size
}: {
  plain: string
  accent: string
  body: string
  size?: number
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 8 }}>
      <EmptyTitle plain={plain} accent={accent} size={size} />
      <Text style={[text(15.5, 'Regular', 1.45), { color: palette.muted }]}>
        {body}
      </Text>
    </View>
  )
}

/** O ingresso tracejado, sem nada dentro (`ghostT`). */
export function GhostTicket({
  width,
  rotate = 0,
  opacity = 1
}: {
  width: number
  rotate?: number
  opacity?: number
}) {
  const { dark } = usePalette()
  const fill = (alpha: number) => ({ backgroundColor: dashColor(dark, alpha) })
  return (
    <View
      style={[
        styles.ghost,
        {
          width,
          opacity,
          borderColor: dashColor(dark),
          transform: [{ rotate: `${rotate}deg` }]
        }
      ]}
    >
      <View style={[{ height: Math.round(width * 0.3) }, fill(0.06)]} />
      <View style={{ padding: 12, gap: 8 }}>
        <View style={styles.ghostRow}>
          <View style={[styles.ghostDot, fill(0.1)]} />
          <View style={[styles.ghostBar, fill(0.1)]} />
          <View style={[styles.ghostDot, fill(0.1)]} />
        </View>
        {/* Borda tracejada de um lado só não sai no iOS: é SVG. */}
        <Svg height={2} width="100%" style={{ marginVertical: 2 }}>
          <Line
            x1="0"
            y1="1"
            x2="100%"
            y2="1"
            stroke={dashColor(dark, 0.18)}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </Svg>
        <View
          style={[{ width: '58%', height: 13, borderRadius: 3 }, fill(0.12)]}
        />
        <View
          style={[{ width: '38%', height: 10, borderRadius: 3 }, fill(0.08)]}
        />
      </View>
    </View>
  )
}

/** Seus bares sem nenhum salvo (`eFav`): dois ingressos e o coração. */
export function SavedEmpty({ onExplore }: { onExplore: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.favArt}>
        <View
          style={{
            position: 'absolute',
            left: '50%',
            top: 30,
            marginLeft: -149
          }}
        >
          <GhostTicket width={230} rotate={-7} opacity={0.6} />
        </View>
        <View
          style={{
            position: 'absolute',
            left: '50%',
            top: 44,
            marginLeft: -99
          }}
        >
          <GhostTicket width={230} rotate={4} />
          <View style={styles.heart}>
            <Icon name="heart" size={28} color={PAPER} accent={PAPER} />
          </View>
        </View>
      </View>
      <Copy
        plain="Nenhum bar "
        accent="salvo ainda."
        body="Toque no coração de qualquer bar para guardar aqui. Você recebe aviso quando ele publicar um jogo dos seus times."
      />
      <PillButton label="Explorar bares" leading="map" onPress={onExplore} />
    </View>
  )
}

/** Uma sugestão da semana (`sugg`): dia, jogo, bar e quem vai, e o botão. */
export type WeekGame = {
  key: string
  day: string
  title: string
  detail: string
  onPress: () => void
}

/** Meus jogos sem nada marcado (`eRes`): o ingresso com o carimbo. */
export function MyGamesEmpty({ week }: { week: WeekGame[] }) {
  const palette = usePalette()
  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignSelf: 'center', width: 300 }}>
        <GhostTicket width={300} />
        <View style={styles.stampWrap} pointerEvents="none">
          <View style={styles.stamp}>
            <Text
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
              style={styles.stampText}
            >
              Nenhum jogo
            </Text>
          </View>
        </View>
      </View>
      <Copy
        plain="Nenhum jogo "
        accent="marcado."
        body="Toque em “Vou assistir aqui” na página de um bar. O código sai na hora e fica guardado aqui."
        size={30}
      />
      {week.length ? (
        <>
          <Text style={[text(13, 'Bold'), { color: palette.ink }]}>
            Jogos desta semana perto de você
          </Text>
          <Card shadow={palette.dark ? 'rgba(201,241,53,.28)' : undefined}>
            <View style={{ paddingHorizontal: 14 }}>
              {week.map((game, index) => (
                <View
                  key={game.key}
                  style={[
                    styles.week,
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: palette.line
                    }
                  ]}
                >
                  <Text style={[styles.weekDay, { color: palette.ink }]}>
                    {game.day}
                  </Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={2}
                      style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}
                    >
                      {game.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        text(12, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {game.detail}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={game.onPress}
                    hitSlop={6}
                  >
                    <HardShadow
                      color={palette.dark ? '#000' : INK}
                      offset={3}
                      radius={4}
                    />
                    <View style={styles.going}>
                      <Text style={[text(12.5, 'Bold', 1.2), { color: INK }]}>
                        Vou assistir
                      </Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
        </>
      ) : null}
    </View>
  )
}

/** Busca sem resultado (`eSearch`): o zero, o telão, o copo e o pino. */
export function SearchEmpty({
  query,
  onAi
}: {
  query: string
  onAi: () => void
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.zeroArt}>
        <Text
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          style={[styles.zero, { color: dashColor(palette.dark, 0.06) }]}
        >
          0
        </Text>
        <View style={styles.tiles}>
          {(['tv', 'beer', 'pin'] as const).map((icon, index) => (
            <View
              key={icon}
              style={{ transform: [{ rotate: `${[-6, 3, -2][index]}deg` }] }}
            >
              <HardShadow
                color={index === 1 ? palette.liveShadow : palette.drop}
                offset={4}
                radius={7}
              />
              <View style={[styles.tile, { backgroundColor: palette.card }]}>
                <Icon
                  name={icon}
                  size={30}
                  color={palette.ink}
                  accent={index === 1 ? LIVE_INK : palette.dark ? ACID : LIVE}
                />
              </View>
            </View>
          ))}
        </View>
      </View>
      <Copy
        plain="Nada para "
        accent={`“${query}”`}
        body="Nenhum bar perto com esse nome, bairro ou time. Tente outro pedido:"
        size={30}
      />
      <Pressable accessibilityRole="button" onPress={onAi}>
        <Card shadow={palette.dark ? 'rgba(201,241,53,.28)' : undefined}>
          <View style={styles.ai}>
            <Icon
              name="sparkle"
              size={30}
              color={palette.ink}
              accent={palette.dark ? ACID : LIVE}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}>
                Pergunte à busca com IA
              </Text>
              <Text
                style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
              >
                Ela entende o pedido inteiro e procura também nas avaliações.
              </Text>
            </View>
            <Icon name="next" size={12} color={palette.muted} />
          </View>
        </Card>
      </Pressable>
    </View>
  )
}

/**
 * Conquistas sem nenhuma (`eMedals`): a primeira, perto, em 3D no cartão de
 * tinta; quatro vagas com "?"; e o que fazer para começar. Os nomes são os
 * das medalhas do produto (`ACHIEVEMENTS`).
 */
export function MedalsEmpty({ onStart }: { onStart: () => void }) {
  const palette = usePalette()
  const steps = [
    ['Valide um código', 'Marque “vou assistir” e mostre no balcão'],
    ['Assista em 3 bairros', 'Desbloqueia Rodou a cidade'],
    ['Avalie um bar', 'Desbloqueia Primeira resenha']
  ]
  return (
    <View style={{ gap: 14 }}>
      <View>
        {/* A sombra de destaque do design (`hero`): acid. */}
        <HardShadow
          color={palette.dark ? 'rgba(201,241,53,.28)' : ACID}
          offset={5}
          radius={7}
        />
        <View style={styles.first}>
          <Medal3D
            medal={{ id: 'bar1', name: 'Primeira rodada', locked: true }}
            drag
            style={{ width: 118, height: 118 }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[text(12.5, 'Bold', 1.3), { color: ACID }]}>
              A primeira está perto
            </Text>
            <Text
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
              style={styles.firstName}
            >
              Primeira rodada
            </Text>
            <Text style={[text(12.5, 'Regular', 1.35), { color: '#aaa9a4' }]}>
              Valide seu código num bar e ela é sua. Arraste para girar.
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[0, 1, 2, 3].map((slot) => (
          <View
            key={slot}
            style={[
              styles.slot,
              { borderColor: dashColor(palette.dark, 0.25) }
            ]}
          >
            <Text
              style={[styles.slotMark, { color: dashColor(palette.dark, 0.3) }]}
            >
              ?
            </Text>
          </View>
        ))}
      </View>
      <Text style={[text(13, 'Bold'), { color: palette.ink }]}>
        Para começar
      </Text>
      <Card>
        <View style={{ paddingHorizontal: 14 }}>
          {steps.map(([title, detail], index) => (
            <View
              key={title}
              style={[
                styles.toggle,
                index > 0 && {
                  borderTopWidth: 1,
                  borderTopColor: palette.line
                }
              ]}
            >
              <View
                style={[
                  styles.stepDot,
                  index === 0
                    ? { backgroundColor: INK }
                    : {
                        borderWidth: 1.5,
                        borderColor: dashColor(palette.dark, 0.3)
                      }
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    { color: index === 0 ? ACID : palette.muted }
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}
                >
                  {title}
                </Text>
                <Text
                  style={[text(12, 'Regular', 1.3), { color: palette.muted }]}
                >
                  {detail}
                </Text>
              </View>
              {index === 0 ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={onStart}
                >
                  <Text
                    style={[
                      text(12.5, 'Bold', 1.2),
                      { color: palette.dark ? ACID : '#c92b0c' }
                    ]}
                  >
                    Começar
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    </View>
  )
}

/**
 * "As primeiras" (`ctxMedals`): ao lado (ou em cima) das conquistas vazias
 * no tablet, as três que faltam menos, com o que pedem e quanto falta.
 */
export function FirstMedals({
  list,
  top,
  onOpen
}: {
  list: Achievement[]
  /** O respiro do topo (a barra de status, quando encosta nela). */
  top: number
  onOpen: (id: string) => void
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.aside,
        {
          paddingTop: top,
          backgroundColor: palette.dark ? '#161613' : '#ebe8df'
        }
      ]}
    >
      <Text
        maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
        style={[styles.asideTitle, { color: palette.dark ? ACID : '#c92b0c' }]}
      >
        As primeiras
      </Text>
      <Text style={[text(13), { color: palette.muted, marginTop: -8 }]}>
        Saem com um código validado no balcão.
      </Text>
      {firstToUnlock(list).map(({ achievement, asks, left }) => (
        <Pressable
          key={achievement.id}
          accessibilityRole="button"
          onPress={() => onOpen(achievement.id)}
        >
          <Card>
            <View style={styles.near}>
              <MedalImage id={achievement.id} locked size={70} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[text(15, 'Bold', 1.25), { color: palette.ink }]}>
                  {achievement.name}
                </Text>
                <Text
                  style={[text(12.5, 'Regular', 1.3), { color: palette.muted }]}
                >
                  {asks}
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={[text(11, 'Bold', 1.2), { color: INK }]}>
                  {left}
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  )
}

/**
 * O Explorar sem bar com jogo no raio (`eRadius`, a folha): o que falta, o
 * "Ampliar" com quantos bares o raio maior traz e os jogos de amanhã.
 */
export function RadiusEmpty({
  radiusKm,
  wider,
  widerCount,
  onWiden,
  onTomorrow
}: {
  radiusKm: number
  /** O raio maior, quando ainda dá para ampliar. */
  wider: number | null
  widerCount?: number
  onWiden: () => void
  onTomorrow: () => void
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 12 }}>
      <View style={{ marginTop: 4 }}>
        <EmptyTitle
          plain="Nenhum bar com jogo "
          accent={`a ${radiusKm} km.`}
          size={28}
        />
      </View>
      <Text
        style={[
          text(14.5, 'Regular', 1.45),
          { color: palette.muted, marginTop: -4 }
        ]}
      >
        {wider
          ? 'Os mais perto estão logo fora do seu raio.'
          : 'Ninguém publicou jogo perto de você por enquanto.'}
      </Text>
      {wider ? (
        <PillButton
          label={`Ampliar para ${wider} km${widerCount ? ` · ${widerCount} ${widerCount === 1 ? 'bar' : 'bares'}` : ''}`}
          onPress={onWiden}
        />
      ) : null}
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onTomorrow}>
        <Text
          style={[
            text(14, 'Bold', 1.3),
            { color: palette.ink, textAlign: 'center' }
          ]}
        >
          Ver jogos de amanhã
        </Text>
      </Pressable>
    </View>
  )
}

/**
 * O mapa ao lado (ou em cima) de Seus bares vazio (`ctxMap`): os bares com
 * jogo no raio, nas gotas do Explorar; tocar abre o bar, onde se salva.
 */
export function SaveMap({
  center,
  radiusKm,
  onOpen
}: {
  center: { lat: number; lng: number }
  radiusKm: number
  onOpen: (barId: string) => void
}) {
  const palette = usePalette()
  const search = useQuery(
    trpc.pubs.search.queryOptions(searchInput(NO_FILTERS, center, radiusKm))
  )
  const now = Date.now()
  // Zoom de rua, como o mapa do design: os bares mais perto de você.
  const span = ((radiusKm * 2) / 111) * 0.6
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: center.lat,
          longitude: center.lng,
          latitudeDelta: span,
          longitudeDelta: span
        }}
        mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        customMapStyle={palette.dark ? MAP_STYLE.dark : MAP_STYLE.light}
        userInterfaceStyle={palette.dark ? 'dark' : 'light'}
        showsPointsOfInterests={false}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {(search.data?.bars ?? []).slice(0, 30).map((bar) => {
          const live = bar.nextEvent ? isLive(bar.nextEvent, now) : false
          const box = dropBox({ live })
          return (
            <Marker
              key={bar.id}
              coordinate={{
                latitude: Number(bar.latitude),
                longitude: Number(bar.longitude)
              }}
              anchor={box.anchor}
              centerOffset={box.centerOffset}
              tracksViewChanges={false}
              onPress={() => onOpen(bar.id)}
            >
              <MapDrop
                live={live}
                elite={bar.plan === 'elite'}
                dark={palette.dark}
              />
            </Marker>
          )
        })}
      </MapView>
      <View style={styles.me} pointerEvents="none">
        <MeDot />
      </View>
    </View>
  )
}

/** Uma linha de aviso com o interruptor (`eNotif`). */
export type NoticeToggle = {
  icon: 'tv' | 'people' | 'crew'
  title: string
  detail?: string
  on: boolean
}

/** Avisos sem nada (`eNotif`): o sino dormindo e o que avisa. */
export function NoticesEmpty({
  toggles,
  onToggles
}: {
  toggles: NoticeToggle[]
  /** Os interruptores levam às Configurações, onde os avisos moram. */
  onToggles: () => void
}) {
  const palette = usePalette()
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.bellArt}>
        {/* O brilho acid em volta do sino (radial, como o design). */}
        <Svg width={160} height={160} style={styles.glow}>
          <Defs>
            <RadialGradient id="bell-glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACID} stopOpacity={0.14} />
              <Stop offset="0.7" stopColor={ACID} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={80} cy={80} r={80} fill="url(#bell-glow)" />
        </Svg>
        <View style={{ position: 'absolute', left: 62, top: 46 }}>
          <Icon name="bell" size={96} color={palette.ink} accent={ACID} />
        </View>
        <Text style={[styles.z, styles.zBig]}>Z</Text>
        <Text style={[styles.z, styles.zSmall, { color: palette.muted }]}>
          z
        </Text>
      </View>
      <Copy
        plain="Tudo "
        accent="em dia."
        body="Quando um bar perto publicar jogo dos seus times, ou alguém te adicionar, aparece aqui."
      />
      <Pressable accessibilityRole="button" onPress={onToggles}>
        <Card>
          <View style={{ paddingHorizontal: 14 }}>
            {toggles.map((row, index) => (
              <View
                key={row.title}
                style={[
                  styles.toggle,
                  index > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: palette.line
                  }
                ]}
              >
                <Icon
                  name={row.icon}
                  size={22}
                  color={palette.ink}
                  accent={ACID}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={[text(14, 'Bold', 1.25), { color: palette.ink }]}
                  >
                    {row.title}
                  </Text>
                  {row.detail ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        text(12, 'Regular', 1.3),
                        { color: palette.muted }
                      ]}
                    >
                      {row.detail}
                    </Text>
                  ) : null}
                </View>
                <Toggle
                  on={row.on}
                  off={palette.mark}
                  track={palette.dark ? ACID : INK}
                  knob={palette.dark ? INK : ACID}
                />
              </View>
            ))}
          </View>
        </Card>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  ghost: {
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    overflow: 'hidden'
  },
  ghostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  ghostDot: { width: 34, height: 34, borderRadius: 17 },
  ghostBar: { width: 60, height: 14, borderRadius: 3 },
  favArt: { height: 250 },
  heart: {
    position: 'absolute',
    right: -14,
    top: -16,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: LIVE,
    transform: [{ rotate: '8deg' }],
    shadowColor: INK,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 4
  },
  stampWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  // Estreito como o do design: "Nenhum / jogo" em duas linhas.
  stamp: {
    maxWidth: 140,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: LIVE_INK,
    backgroundColor: 'rgba(18,18,15,.6)',
    transform: [{ rotate: '-11deg' }]
  },
  stampText: {
    fontFamily: 'Anton',
    fontSize: 28,
    letterSpacing: 0.56,
    textTransform: 'uppercase',
    color: LIVE_INK,
    marginVertical: -0.2425 * 28
  },
  week: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  },
  weekDay: { fontFamily: 'Anton', fontSize: 20, width: 54, marginVertical: -5 },
  going: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 4,
    backgroundColor: ACID
  },
  zeroArt: { height: 150, alignItems: 'center', justifyContent: 'center' },
  zero: {
    fontFamily: 'Anton',
    fontSize: 150,
    letterSpacing: -6,
    marginVertical: -60
  },
  tiles: { position: 'absolute', flexDirection: 'row', gap: 10 },
  tile: {
    width: 62,
    height: 62,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ai: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14
  },
  bellArt: { alignSelf: 'center', width: 220, height: 200, marginTop: 10 },
  glow: { position: 'absolute', left: 30, top: 30 },
  z: { position: 'absolute', fontFamily: 'Anton' },
  zBig: {
    right: 14,
    top: 22,
    fontSize: 30,
    color: ACID,
    transform: [{ rotate: '10deg' }]
  },
  zSmall: { right: 38, top: 2, fontSize: 20, transform: [{ rotate: '14deg' }] },
  me: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center'
  },
  aside: { flex: 1, paddingHorizontal: 22, gap: 14 },
  asideTitle: {
    fontFamily: 'Anton',
    fontSize: 22,
    textTransform: 'uppercase',
    marginVertical: -0.2425 * 22
  },
  near: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12 },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: ACID
  },
  first: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderRadius: 7,
    backgroundColor: INK,
    overflow: 'hidden'
  },
  firstName: {
    fontFamily: 'Anton',
    fontSize: 30,
    textTransform: 'uppercase',
    color: PAPER,
    marginTop: 4 - 0.2425 * 30,
    marginBottom: 4 - 0.2425 * 30
  },
  slot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center'
  },
  slotMark: { fontFamily: 'Anton', fontSize: 26 },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stepNumber: { fontFamily: 'GeistMono-SemiBold', fontSize: 12 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11
  }
})
