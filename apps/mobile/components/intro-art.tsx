import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { Image, Platform, StyleSheet, useColorScheme, View } from 'react-native'
import MapView from 'react-native-maps'
import type { SharedValue } from 'react-native-reanimated'
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Rect,
  Stop
} from 'react-native-svg'
import { dropBox, MapDrop, MeDot } from '@/components/explore'
import { Glass } from '@/components/glass'
import { Enter, type Frame } from '@/components/intro-motion'
import { Text } from '@/components/ui'
import { MAP_STYLE } from '@/lib/map-style'

/*
 * As ilustrações das quatro telas de "03 Apresentação" (projeto "Onside
 * mobile app redesign"). O desenho é a 390 x 476: posições verticais escalam
 * com a altura real da ilustração (`sy`), as horizontais com a largura (`sx`).
 *
 * O vidro do design é o `Glass` (`components/glass.tsx`). A entrada de cada
 * tela é por quadros-chave (`intro-motion.ts`); no vidro só a posição anda,
 * porque o liquid glass com transparência animada sai errado no iOS 26.
 *
 * O design só desenha o tema claro. No escuro valem as mesmas formas com a
 * tinta e o papel trocados (a regra do design para a tab bar); as telas 2 e 3
 * já são escuras nos dois temas. A 4b segue o Explorar de hoje (mapa nativo,
 * gotas da Rodada 21, raio tracejado), não o desenho antigo da apresentação.
 */

const INK = '#12120f'
const PAPER = '#f1eee6'
const ACID = '#c9f135'
const LIVE = '#e8320c'
const MUTED = '#55554f'
const MUTED_DARK = '#aaa9a4'

export type ArtProps = {
  width: number
  height: number
  /** A entrada da tela, de 0 a 1. */
  progress: SharedValue<number>
}

// Quadros-chave, em fração da entrada (`ENTER_MS`). Os nomes `sp-*` são os
// `@keyframes` do design que cada movimento segue.
const pin = (at: number): Frame[] => [
  { at, y: -60, opacity: 0 }, // sp-pin
  { at: at + 0.12, y: 4 },
  { at: at + 0.18 }
]
// Nunca de zero: nada aparece do nada.
const pop = (at: number): Frame[] => [
  { at, scale: 0.6, opacity: 0 },
  { at: at + 0.1, scale: 1.15 },
  { at: at + 0.16 }
]
const MOTION = {
  mapPan: [{ at: 0, scale: 1.08 }, { at: 0.75 }], // sp-pan, ao contrário
  pins: [pin(0.16), pin(0.24)],
  livePin: [
    { at: 0.32, y: -140, opacity: 0 }, // sp-drop
    { at: 0.46, y: 5 },
    { at: 0.52 }
  ],
  you: pop(0.5),
  radius: [{ at: 0.5, scale: 0.92, opacity: 0 }, { at: 0.62 }],
  youPulse: [
    { at: 0.61, opacity: 0 }, // sp-pulse
    { at: 0.62, opacity: 0.7 },
    { at: 1, scale: 3.4, opacity: 0 }
  ],
  card: [{ at: 0.1, y: 160 }, { at: 0.42 }], // sp-wipe
  photo: [{ at: 0, scale: 1.12 }, { at: 0.85 }],
  avatars: [pop(0.4), pop(0.46), pop(0.52)],
  ticket: [
    { at: 0.08, y: -220, rotate: -6, opacity: 0 }, // sp-drop
    { at: 0.32, y: 6, rotate: 0.5 },
    { at: 0.4 }
  ],
  glow: [{ at: 0.25, opacity: 0 }, { at: 0.7 }],
  stamp: [
    { at: 0.46, scale: 1.8, opacity: 0 },
    { at: 0.56, scale: 0.92 },
    { at: 0.62 }
  ],
  code: [{ at: 0.38, y: 16, opacity: 0 }, { at: 0.6 }],
  // sp-lens; opaca logo no começo, senão a sombra aparece através da bola.
  orb: [
    { at: 0.04, scale: 0.4, opacity: 0 },
    { at: 0.1, scale: 0.6 },
    { at: 0.4 }
  ],
  star: [{ at: 0.14, scale: 0.5, rotate: -45, opacity: 0 }, { at: 0.5 }],
  ask: [{ at: 0.36, y: 30, opacity: 0 }, { at: 0.56 }],
  reply: [{ at: 0.62, y: 120 }, { at: 0.86 }]
} satisfies Record<string, Frame[] | Frame[][]>

/** Corpo de texto do design: herda `line-height: 1.4` do quadro. */
const size = (fontSize: number, lineHeight = 1.4) => ({
  fontSize,
  lineHeight: fontSize * lineHeight
})

/**
 * As peças do desenho (pinos, cards, canhoto, conversa) ficam num palco de
 * até 480 de largura no meio da tela; o fundo (mapa, foto, brilho) vai de
 * ponta a ponta. No celular o palco é a tela inteira.
 */
const STAGE = 480

const scale = ({ width, height }: ArtProps) => {
  const stage = Math.min(width, STAGE)
  return {
    sx: stage / 390,
    sy: height / 476,
    /** Onde o palco começa. */
    ox: (width - stage) / 2
  }
}

/** As margens de 18 (ou outras) do desenho, medidas a partir do palco. */
const inset = (props: ArtProps, side: number) => {
  const { ox } = scale(props)
  return { left: ox + side, right: ox + side }
}

/** A gota do Explorar (21a): a ponta fica em (x, y); o ao vivo leva o nome. */
function Pin({
  x,
  y,
  name,
  live = false,
  elite = false,
  progress,
  frames
}: {
  x: number
  y: number
  name: string
  live?: boolean
  elite?: boolean
  progress: SharedValue<number>
  frames: Frame[]
}) {
  const dark = useColorScheme() === 'dark'
  const label = live ? name : undefined
  const box = dropBox({ live, label })
  return (
    <Enter
      progress={progress}
      frames={frames}
      style={{ position: 'absolute', left: x - box.tipX, top: y - box.tipY }}
      pointerEvents="none"
    >
      <MapDrop live={live} elite={elite} dark={dark} label={label} />
    </Enter>
  )
}

/** Vila Madalena, no zoom de rua do Explorar. */
const INTRO_REGION = {
  latitude: -23.5545,
  longitude: -46.6895,
  latitudeDelta: 0.016,
  longitudeDelta: 0.011
}

/** Raio do tracejado em volta de você, no desenho de 390 pt. */
const RADIUS = 120

/** 4b, "O jogo é aqui": o mapa com os bares que passam a partida. */
export function MapArt(props: ArtProps) {
  const { sx, sy, ox } = scale(props)
  // O raio é um círculo: fora do celular, na menor das duas escalas, para não
  // sair do mapa na tela deitada.
  const r = RADIUS * (ox > 0 ? Math.min(sx, sy) : sx)
  const { progress } = props
  const dark = useColorScheme() === 'dark'
  return (
    <View style={StyleSheet.absoluteFill}>
      <Enter progress={progress} frames={MOTION.mapPan}>
        {/* O mapa do Explorar, parado: o toque passa para a paginação. */}
        <View pointerEvents="none">
          <MapView
            style={{ width: props.width, height: props.height }}
            initialRegion={INTRO_REGION}
            mapType={Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
            customMapStyle={dark ? MAP_STYLE.dark : MAP_STYLE.light}
            userInterfaceStyle={dark ? 'dark' : 'light'}
            showsPointsOfInterests={false}
            showsCompass={false}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
          />
        </View>
      </Enter>
      {/* O raio de busca em volta de você, tracejado como no Explorar. */}
      <Enter
        progress={progress}
        frames={MOTION.radius}
        style={{
          position: 'absolute',
          left: ox + 193 * sx - r,
          top: 375 * sy - r
        }}
        pointerEvents="none"
      >
        <Svg width={r * 2} height={r * 2}>
          <Circle
            cx={r}
            cy={r}
            r={r - 1}
            stroke={dark ? ACID : INK}
            strokeWidth={1.5}
            strokeDasharray="6 6"
            fill="rgba(201,241,53,.1)"
          />
        </Svg>
      </Enter>
      <Pin
        x={ox + 110 * sx}
        y={250 * sy}
        name="Casa 92"
        progress={progress}
        frames={MOTION.pins[0]}
      />
      <Pin
        x={ox + 300 * sx}
        y={226 * sy}
        name="Boteco Sete"
        elite
        progress={progress}
        frames={MOTION.pins[1]}
      />
      <Pin
        x={ox + 206 * sx}
        y={312 * sy}
        name="Bar do Zé"
        live
        progress={progress}
        frames={MOTION.livePin}
      />
      <Enter
        progress={progress}
        frames={MOTION.card}
        style={[styles.matchCard, inset(props, 18)]}
      >
        <Glass tone={dark ? 'dark' : 'light'} style={styles.matchGlass}>
          <View style={styles.matchIcon}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path
                d="M2.5 6.2 8.6 4l6.2 2.2L21 4v13.8L14.8 20l-6.2-2.2-6.1 2.2z"
                fill={PAPER}
                opacity={0.3}
              />
              <Path
                d="M15.2 4.6a3.9 3.9 0 0 1 3.9 3.9c0 2.9-3.9 6.9-3.9 6.9s-3.9-4-3.9-6.9a3.9 3.9 0 0 1 3.9-3.9z"
                fill={PAPER}
              />
              <Circle cx={15.2} cy={8.5} r={1.45} fill={ACID} />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.bold,
                { ...size(15.5), color: dark ? PAPER : INK }
              ]}
            >
              Corinthians × Palmeiras
            </Text>
            <Text
              style={[
                styles.body,
                { ...size(13), color: dark ? MUTED_DARK : MUTED }
              ]}
            >
              Hoje 21:30 · 4 bares perto de você
            </Text>
          </View>
        </Glass>
      </Enter>
      {/* Você: o ponto acid com os dois anéis do design, por cima do card como lá. */}
      <View
        style={[styles.you, { left: ox + 193 * sx - 40, top: 375 * sy - 40 }]}
        pointerEvents="none"
      >
        <Enter
          progress={progress}
          frames={MOTION.youPulse}
          style={[styles.youRing, styles.youPulse]}
        />
        <Enter progress={progress} frames={MOTION.you} style={styles.youBody}>
          <MeDot />
        </Enter>
      </View>
    </View>
  )
}

function Avatar({
  letter,
  background,
  color,
  first,
  progress,
  frames
}: {
  letter: string
  background: string
  color: string
  first?: boolean
  progress: SharedValue<number>
  frames: Frame[]
}) {
  return (
    <Enter
      progress={progress}
      frames={frames}
      style={[
        styles.avatar,
        { backgroundColor: background, marginLeft: first ? 0 : -7 }
      ]}
    >
      <Text style={[styles.bold, { fontSize: 10, color }]}>{letter}</Text>
    </Enter>
  )
}

/** 4c, "Quem vai": a foto do bar e o "Vou assistir aqui". */
export function CrowdArt(props: ArtProps) {
  const { width, height, progress } = props
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2a2a25' }]}>
      <Enter progress={progress} frames={MOTION.photo}>
        <Image
          source={require('../assets/images/intro/bar.jpg')}
          style={{ width, height }}
          resizeMode="cover"
        />
      </Enter>
      <LinearGradient
        colors={[
          'rgba(18,18,15,.25)',
          'rgba(18,18,15,0)',
          'rgba(18,18,15,.55)'
        ]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Enter
        progress={progress}
        frames={MOTION.card}
        style={[styles.goingCard, inset(props, 18)]}
      >
        <Glass tone="dark" style={styles.goingGlass}>
          <View style={styles.goingRow}>
            <View style={styles.goingRow}>
              <Avatar
                letter="M"
                background={ACID}
                color={INK}
                first
                progress={progress}
                frames={MOTION.avatars[0]}
              />
              <Avatar
                letter="R"
                background="#3a3a34"
                color={INK}
                progress={progress}
                frames={MOTION.avatars[1]}
              />
              <Avatar
                letter="J"
                background={LIVE}
                color={PAPER}
                progress={progress}
                frames={MOTION.avatars[2]}
              />
              <Text
                style={[
                  styles.semibold,
                  { marginLeft: 7, ...size(12.5), color: PAPER }
                ]}
              >
                34 vão
              </Text>
            </View>
            <Text style={[styles.body, { ...size(13), color: '#d6d3cb' }]}>
              Bar do Zé · hoje
            </Text>
          </View>
          <View style={styles.goingButton}>
            <Svg width={19} height={19} viewBox="0 0 24 24">
              <G fill={PAPER} opacity={0.3}>
                <Circle cx={16.5} cy={8} r={3.4} />
                <Path d="M12.5 20a5 5 0 0 1 9.5-1.8V20z" />
              </G>
              <Circle cx={9} cy={8} r={4} fill={PAPER} />
              <Path d="M2 20.5a7 7 0 0 1 14 0z" fill={PAPER} />
            </Svg>
            <Text style={[styles.bold, { ...size(15), color: PAPER }]}>
              Vou assistir aqui
            </Text>
          </View>
        </Glass>
      </Enter>
    </View>
  )
}

/** Meia-lua do canhoto: um círculo da cor do fundo cortado pela borda. */
function Notch({ side }: { side: 'left' | 'right' }) {
  return <View style={[styles.notch, { [side]: -9 }]} />
}

/** 4d, "Oferta da casa": o canhoto de quem marcou que vai, com o código. */
export function TicketArt(props: ArtProps) {
  const { sy } = scale(props)
  const { progress } = props
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: INK }]}>
      <Enter
        progress={progress}
        frames={MOTION.glow}
        style={StyleSheet.absoluteFill}
      >
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" rx="60%" ry="50%">
              <Stop offset="0" stopColor={ACID} stopOpacity={0.14} />
              <Stop offset="0.7" stopColor={INK} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#glow)" />
        </Svg>
      </Enter>
      <View style={[styles.ticketWrap, inset(props, 46), { top: 120 * sy }]}>
        <Enter progress={progress} frames={MOTION.ticket}>
          <View style={styles.ticketShadow} />
          <View style={styles.ticket}>
            <View style={styles.ticketHead}>
              <View>
                <Text style={[styles.bold, { ...size(17), color: INK }]}>
                  Bar do Zé
                </Text>
                <Text style={[styles.body, { ...size(12.5), color: MUTED }]}>
                  Corinthians × Palmeiras · 21:30
                </Text>
              </View>
              <Enter
                progress={progress}
                frames={MOTION.stamp}
                style={styles.badge}
              >
                <Text style={[styles.bold, { ...size(10.5, 1.2), color: INK }]}>
                  Você vai
                </Text>
              </Enter>
            </View>
            <View style={styles.tear}>
              <Notch side="left" />
              {/* Borda tracejada de um lado só não sai no iOS: é SVG. */}
              <Svg height={2} style={styles.tearLine}>
                <Line
                  x1="0"
                  y1="1"
                  x2="100%"
                  y2="1"
                  stroke="rgba(18,18,15,.16)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              </Svg>
              <Notch side="right" />
            </View>
            <View style={styles.ticketCode}>
              <Text style={[styles.semibold, { ...size(12), color: MUTED }]}>
                Seu código
              </Text>
              <Enter progress={progress} frames={MOTION.code}>
                <Text style={styles.code}>A7K·29</Text>
              </Enter>
            </View>
          </View>
        </Enter>
      </View>
    </View>
  )
}

function Bubble({
  children,
  mine,
  progress
}: {
  children: ReactNode
  mine?: boolean
  progress: SharedValue<number>
}) {
  const dark = useColorScheme() === 'dark'
  return mine ? (
    <Enter
      progress={progress}
      frames={MOTION.ask}
      style={[styles.bubbleMine, dark && { backgroundColor: PAPER }]}
    >
      {children}
    </Enter>
  ) : (
    <Enter progress={progress} frames={MOTION.reply} style={styles.replyAt}>
      <Glass tone={dark ? 'dark' : 'light'} style={styles.reply}>
        {children}
      </Glass>
    </Enter>
  )
}

/** 4e, "Busca com IA": o pedido em texto livre e a resposta. */
export function AskArt(props: ArtProps) {
  const { sy } = scale(props)
  const size = 250 * Math.min(1, sy)
  const center = 221 * sy
  const { progress } = props
  const dark = useColorScheme() === 'dark'
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: dark ? '#2a2a25' : '#e7e3db' }
      ]}
    >
      <Enter
        progress={progress}
        frames={MOTION.orb}
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            top: center - size / 2 + 6,
            marginLeft: -size / 2 + 6,
            backgroundColor: dark ? '#000' : 'rgba(18,18,15,.9)'
          }
        ]}
      />
      <Enter
        progress={progress}
        frames={MOTION.orb}
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            top: center - size / 2,
            marginLeft: -size / 2,
            backgroundColor: ACID
          }
        ]}
      />
      <Enter
        progress={progress}
        frames={MOTION.orb}
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            top: center - size / 2,
            marginLeft: -size / 2,
            alignItems: 'center',
            justifyContent: 'center'
          }
        ]}
      >
        <Enter progress={progress} frames={MOTION.star}>
          <Svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24">
            <Path
              d="M18.6 1.7Q19.3 4.7 22.3 5.4Q19.3 6.1 18.6 9.1Q17.9 6.1 14.9 5.4Q17.9 4.7 18.6 1.7Z"
              fill={INK}
              opacity={0.3}
            />
            <Path
              d="M10 5.4Q11.35 11.85 17.8 13.2Q11.35 14.55 10 21Q8.65 14.55 2.2 13.2Q8.65 11.85 10 5.4Z"
              fill={INK}
            />
            <Path
              d="M19.2 15.1Q19.7 17.3 21.9 17.8Q19.7 18.3 19.2 20.5Q18.7 18.3 16.5 17.8Q18.7 17.3 19.2 15.1Z"
              fill={LIVE}
            />
          </Svg>
        </Enter>
      </Enter>
      <View style={[styles.chat, inset(props, 18)]}>
        <Bubble mine progress={progress}>
          <Text
            style={[
              styles.body,
              styles.bubbleText,
              { color: dark ? INK : PAPER }
            ]}
          >
            Um bar com telão perto da Paulista para ver a NBA hoje
          </Text>
        </Bubble>
        <Bubble progress={progress}>
          <View style={styles.check}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" fill={INK} />
            </Svg>
          </View>
          <Text
            style={[
              styles.body,
              styles.bubbleText,
              { flexShrink: 1 },
              dark && { color: PAPER }
            ]}
          >
            Encontrei 3 bares. O mais perto fica a 600 m.
          </Text>
        </Bubble>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontFamily: 'Archivo-Regular' },
  semibold: { fontFamily: 'Archivo-SemiBold' },
  bold: { fontFamily: 'Archivo-Bold' },
  you: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center'
  },
  youBody: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  youPulse: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACID
  },
  youRing: {
    position: 'absolute',
    borderRadius: 40,
    backgroundColor: 'rgba(201,241,53,.10)'
  },
  matchCard: { position: 'absolute', left: 18, right: 18, bottom: 22 },
  matchGlass: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  matchIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: INK,
    alignItems: 'center',
    justifyContent: 'center'
  },
  goingCard: { position: 'absolute', left: 18, right: 18, bottom: 22 },
  goingGlass: {
    padding: 14,
    borderRadius: 24,
    gap: 12
  },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(30,30,27,.9)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  goingButton: {
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.4)'
  },
  ticketWrap: {
    position: 'absolute',
    left: 46,
    right: 46,
    transform: [{ rotate: '-3deg' }]
  },
  ticketShadow: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: -6,
    bottom: -6,
    borderRadius: 10,
    backgroundColor: ACID
  },
  ticket: { borderRadius: 10, backgroundColor: PAPER, overflow: 'hidden' },
  ticketHead: {
    paddingTop: 16,
    paddingHorizontal: 18,
    paddingBottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    backgroundColor: ACID
  },
  tear: { height: 18, flexDirection: 'row', alignItems: 'center' },
  tearLine: { flex: 1, marginHorizontal: 14 },
  notch: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: INK
  },
  ticketCode: {
    paddingTop: 4,
    paddingHorizontal: 18,
    paddingBottom: 20,
    alignItems: 'center'
  },
  code: {
    fontFamily: 'Anton',
    fontSize: 60,
    letterSpacing: 3.6,
    // Linha de 1em como no design, sem `lineHeight` (ver `title` em `app/intro.tsx`).
    marginTop: 6 - 15.2,
    marginBottom: -15.2,
    color: INK
  },
  orb: { position: 'absolute', left: '50%', borderRadius: 999 },
  chat: { position: 'absolute', left: 18, right: 18, bottom: 22, gap: 8 },
  bubbleMine: {
    alignSelf: 'flex-end',
    maxWidth: 298,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    backgroundColor: INK
  },
  replyAt: { alignSelf: 'flex-start' },
  reply: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4
  },
  bubbleText: { fontSize: 14, lineHeight: 19.3, color: INK },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: ACID,
    alignItems: 'center',
    justifyContent: 'center'
  }
})
