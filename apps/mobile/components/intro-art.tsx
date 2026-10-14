import { LinearGradient } from 'expo-linear-gradient'
import type { ReactNode } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop
} from 'react-native-svg'

/*
 * As ilustrações das quatro telas de "03 Apresentação" (projeto "Onside
 * mobile app redesign"). O desenho é a 390 x 476: posições verticais escalam
 * com a altura real da ilustração (`sy`), as horizontais com a largura (`sx`).
 *
 * O vidro do design (`backdrop-filter`) não existe no React Native sem
 * dependência nova: aqui é cor translúcida mais opaca, que lê igual.
 */

const INK = '#12120f'
const PAPER = '#f1eee6'
const ACID = '#c9f135'
const LIVE = '#e8320c'
const MUTED = '#55554f'

type ArtProps = { width: number; height: number }

const scale = ({ width, height }: ArtProps) => ({
  sx: width / 390,
  sy: height / 476
})

/** Pino de bar no mapa: a ponta fica em (x, y). */
function Pin({
  x,
  y,
  label,
  live
}: {
  x: number
  y: number
  label: string
  live?: boolean
}) {
  const color = live ? LIVE : INK
  return (
    <View
      style={[styles.pin, { left: x - 100, top: y - 60 }]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.pinLabel,
          live && styles.pinLabelLive,
          { backgroundColor: color }
        ]}
      >
        {live ? <View style={styles.pinDot} /> : null}
        <Text style={[styles.pinText, live && { fontSize: 13 }]}>{label}</Text>
      </View>
      <View style={[styles.pinTip, { backgroundColor: color }]} />
    </View>
  )
}

/** 4b, "O jogo é aqui": o mapa com os bares que passam a partida. */
export function MapArt(props: ArtProps) {
  const { sx, sy } = scale(props)
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        source={require('../assets/images/intro/map.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <Pin x={110 * sx} y={250 * sy} label="Casa 92" />
      <Pin x={300 * sx} y={226 * sy} label="Boteco Sete" />
      <Pin x={206 * sx} y={312 * sy} label="Bar do Zé" live />
      <View style={[styles.glassLight, styles.matchCard]}>
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
          <Text style={[styles.bold, { fontSize: 15.5, color: INK }]}>
            Corinthians × Palmeiras
          </Text>
          <Text style={[styles.body, { fontSize: 13, color: MUTED }]}>
            Hoje 21:30 · 4 bares perto de você
          </Text>
        </View>
      </View>
      {/* Você: o ponto acid com os dois anéis do design, por cima do card como lá. */}
      <View
        style={[styles.you, { left: 193 * sx - 40, top: 375 * sy - 40 }]}
        pointerEvents="none"
      >
        <View style={[styles.youRing, { width: 80, height: 80 }]} />
        <View
          style={[
            styles.youRing,
            {
              width: 44,
              height: 44,
              backgroundColor: 'rgba(201,241,53,.25)'
            }
          ]}
        />
        <View style={styles.youDot} />
      </View>
      {/* Condição da ODbL: o mapa é OpenStreetMap, pelos tiles da Onside. */}
      <Text style={styles.attribution}>© OpenStreetMap</Text>
    </View>
  )
}

function Avatar({
  letter,
  background,
  color,
  first
}: {
  letter: string
  background: string
  color: string
  first?: boolean
}) {
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: background, marginLeft: first ? 0 : -7 }
      ]}
    >
      <Text style={[styles.bold, { fontSize: 10, color }]}>{letter}</Text>
    </View>
  )
}

/** 4c, "Quem vai": a foto do bar e o "Vou assistir aqui". */
export function CrowdArt(_: ArtProps) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#2a2a25' }]}>
      <Image
        source={require('../assets/images/intro/bar.jpg')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          'rgba(18,18,15,.25)',
          'rgba(18,18,15,0)',
          'rgba(18,18,15,.55)'
        ]}
        locations={[0, 0.3, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glassDark, styles.goingCard]}>
        <View style={styles.goingRow}>
          <View style={styles.goingRow}>
            <Avatar letter="M" background={ACID} color={INK} first />
            <Avatar letter="R" background="#3a3a34" color={INK} />
            <Avatar letter="J" background={LIVE} color={PAPER} />
            <Text
              style={[
                styles.semibold,
                { marginLeft: 7, fontSize: 12.5, color: PAPER }
              ]}
            >
              34 vão
            </Text>
          </View>
          <Text style={[styles.body, { fontSize: 13, color: '#d6d3cb' }]}>
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
          <Text style={[styles.bold, { fontSize: 15, color: PAPER }]}>
            Vou assistir aqui
          </Text>
        </View>
      </View>
    </View>
  )
}

/** Meia-lua do canhoto: um círculo da cor do fundo cortado pela borda. */
function Notch({ side }: { side: 'left' | 'right' }) {
  return <View style={[styles.notch, { [side]: -9 }]} />
}

/** 4d, "Mesa garantida": o canhoto da reserva confirmada. */
export function TicketArt(props: ArtProps) {
  const { sy } = scale(props)
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: INK }]}>
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" rx="60%" ry="50%">
            <Stop offset="0" stopColor={ACID} stopOpacity={0.14} />
            <Stop offset="0.7" stopColor={INK} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
      <View style={[styles.ticketWrap, { top: 120 * sy }]}>
        <View style={styles.ticketShadow} />
        <View style={styles.ticket}>
          <View style={styles.ticketHead}>
            <View>
              <Text style={[styles.bold, { fontSize: 17, color: INK }]}>
                Bar do Zé
              </Text>
              <Text style={[styles.body, { fontSize: 12.5, color: MUTED }]}>
                Mesa para 4 · hoje 21:30
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={[styles.bold, { fontSize: 10.5, color: INK }]}>
                Confirmada
              </Text>
            </View>
          </View>
          <View style={styles.tear}>
            <Notch side="left" />
            <View style={styles.tearLine} />
            <Notch side="right" />
          </View>
          <View style={styles.ticketCode}>
            <Text style={[styles.semibold, { fontSize: 12, color: MUTED }]}>
              Seu código
            </Text>
            <Text style={styles.code}>A7K·29</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function Bubble({ children, mine }: { children: ReactNode; mine?: boolean }) {
  return (
    <View style={mine ? styles.bubbleMine : [styles.glassLight, styles.reply]}>
      {children}
    </View>
  )
}

/** 4e, "Busca com IA": o pedido em texto livre e a resposta. */
export function AskArt(props: ArtProps) {
  const { sy } = scale(props)
  const size = 250 * Math.min(1, sy)
  const center = 221 * sy
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#e7e3db' }]}>
      <View
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            top: center - size / 2 + 6,
            marginLeft: -size / 2 + 6,
            backgroundColor: 'rgba(18,18,15,.9)'
          }
        ]}
      />
      <View
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
      <View
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
      </View>
      <View style={styles.chat}>
        <Bubble mine>
          <Text style={[styles.body, styles.bubbleText, { color: PAPER }]}>
            Um bar com telão perto da Paulista para ver a NBA hoje
          </Text>
        </Bubble>
        <Bubble>
          <View style={styles.check}>
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <Path d="m4.2 12.4 1.8-1.8 4 4 8-8 1.8 1.8-9.8 9.8z" fill={INK} />
            </Svg>
          </View>
          <Text style={[styles.body, styles.bubbleText, { flexShrink: 1 }]}>
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
  glassLight: {
    backgroundColor: 'rgba(255,255,255,.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.9)',
    shadowColor: INK,
    shadowOpacity: 0.25,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  glassDark: {
    backgroundColor: 'rgba(30,30,27,.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.24)'
  },
  pin: {
    position: 'absolute',
    width: 200,
    height: 60,
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  pinLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: PAPER
  },
  pinLabelLive: { paddingVertical: 8, paddingHorizontal: 12 },
  pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: PAPER },
  pinText: { fontFamily: 'Archivo-Bold', fontSize: 12, color: PAPER },
  pinTip: {
    width: 9,
    height: 9,
    marginTop: -6,
    transform: [{ rotate: '45deg' }]
  },
  you: {
    position: 'absolute',
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center'
  },
  youRing: {
    position: 'absolute',
    borderRadius: 40,
    backgroundColor: 'rgba(201,241,53,.10)'
  },
  youDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: INK,
    backgroundColor: ACID
  },
  matchCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 22,
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
  attribution: {
    position: 'absolute',
    right: 22,
    bottom: 5,
    fontFamily: 'Archivo-Regular',
    fontSize: 9,
    color: 'rgba(18,18,15,.45)'
  },
  goingCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 22,
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
  tearLine: {
    flex: 1,
    marginHorizontal: 14,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(18,18,15,.16)'
  },
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
    maxWidth: 270,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    backgroundColor: INK
  },
  reply: {
    alignSelf: 'flex-start',
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
