import { gameTitle, type TitledGame } from '@findsports_oficial/db/game-title'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { dayLabel } from '@/components/explore'
import { GameTitle } from '@/components/explore-board'
import { SWAP, usePress } from '@/components/motion'
import { usePalette } from '@/components/theme'
import {
  ACID,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  LIVE,
  PAPER,
  Text,
  text
} from '@/components/ui'
import { formatTime, isLive } from '@/lib/explore'

/*
 * As peças da página do bar no celular (rodada 1 do redesign, tela 4, 2g): o
 * cartão de tinta do jogo de hoje, os círculos sólidos sobre a foto e o
 * rodapé fixo com o "Vou assistir aqui", a única ação acid da tela.
 */

const MONO = 'GeistMono-SemiBold'

type CardGame = TitledGame & {
  startsAt: string
  endsAt: string | null
  onBigScreen: boolean
  withSound: boolean
  houseOffer: string | null
  going: { count: number | null } | null
}

/** "HOJE · 21:30", "AO VIVO · COMEÇOU 21:30" ou "SÁB, 14/11 · 16:00". */
export function gameKicker(game: CardGame, now: number) {
  if (isLive(game, now)) return `AO VIVO · COMEÇOU ${formatTime(game.startsAt)}`
  return `${dayLabel(game.startsAt, now).replace('.', '').toLocaleUpperCase('pt-BR')} · ${formatTime(game.startsAt)}`
}

/**
 * O jogo de hoje no bar (2g): tinta nos dois temas, o jogo em Anton, telão e
 * som deste jogo, a oferta da casa (Elite) e quantos vão. Sem conta, só a
 * contagem, nunca o nome de amigo.
 */
export function TodayCard({ game, now }: { game: CardGame; now: number }) {
  const palette = usePalette()
  const live = isLive(game, now)
  const count = game.going?.count ?? null
  return (
    <View
      style={[
        styles.today,
        palette.dark && { borderWidth: 1, borderColor: 'rgba(241,238,230,.1)' }
      ]}
    >
      <View style={styles.todayHead}>
        <Text style={[styles.mono11, { color: live ? LIVE : '#aaa9a4' }]}>
          {gameKicker(game, now)}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.mono11, { color: '#aaa9a4', flexShrink: 1 }]}
        >
          {game.championship.toLocaleUpperCase('pt-BR')}
        </Text>
      </View>
      <GameTitle
        title={gameTitle(game)}
        size={32}
        color={PAPER}
        accent={ACID}
      />
      {game.onBigScreen || game.withSound ? (
        <View style={styles.screens}>
          {game.onBigScreen ? (
            <View style={styles.screen}>
              <Icon name="tv" size={15} color="#cfccc4" />
              <Text style={[text(13, 'Regular', 1.3), { color: '#cfccc4' }]}>
                Telão
              </Text>
            </View>
          ) : null}
          {game.withSound ? (
            <View style={styles.screen}>
              <Icon name="sound" size={15} color="#cfccc4" />
              <Text style={[text(13, 'Regular', 1.3), { color: '#cfccc4' }]}>
                Som do jogo ligado
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {game.houseOffer ? (
        <View style={styles.offer}>
          <Icon name="ticket" size={18} color={ACID} accent={ACID} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.mono10, { color: '#aaa9a4' }]}>
              OFERTA DA CASA · NESTE JOGO
            </Text>
            <Text style={[text(14, 'SemiBold', 1.3), { color: PAPER }]}>
              {game.houseOffer}
            </Text>
          </View>
        </View>
      ) : null}
      {count ? (
        <View style={styles.goingRow}>
          <Icon name="people" size={16} color="#cfccc4" />
          <Text style={[text(13.5, 'Regular', 1.3), { color: '#cfccc4' }]}>
            <Text style={[text(13.5, 'Bold', 1.3), { color: PAPER }]}>
              {count.toLocaleString('pt-BR')}
            </Text>{' '}
            {count === 1 ? 'pessoa vai' : 'pessoas vão'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** Círculo sólido sobre a foto (voltar, coração, compartilhar): não é vidro. */
export function SolidRound({
  label,
  selected,
  onPress,
  children
}: {
  label: string
  selected?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.8 }]}
    >
      {children}
    </Pressable>
  )
}

/**
 * O rodapé fixo (2g): o jogo à esquerda e "Vou assistir aqui" em acid à
 * direita. Desce 3 pt no toque (120 ms); o háptico de sucesso é da folha,
 * quando a presença grava.
 */
export function AttendDock({
  game,
  now,
  attending,
  code,
  bottom,
  onPress,
  onCode
}: {
  game: CardGame
  now: number
  attending: boolean
  /** O código do balcão (Elite): marcado, o botão vira "Ver código". */
  code: string | null
  bottom: number
  onPress: () => void
  onCode: () => void
}) {
  const palette = usePalette()
  const press = usePress(0, 3)
  const count = game.going?.count ?? null
  const when = isLive(game, now)
    ? 'ao vivo'
    : `${dayLabel(game.startsAt, now).toLowerCase()} ${formatTime(game.startsAt)}`
  return (
    <View
      style={[
        styles.dock,
        {
          paddingBottom: bottom,
          backgroundColor: palette.sheet,
          borderTopColor: palette.line
        }
      ]}
    >
      {/* Marcado (rodada 2, tela 3), o rodapé diz o estado; é troca, não
          deslizamento: crossfade de 150 ms. */}
      <Animated.View
        key={attending ? 'marcado' : 'livre'}
        entering={SWAP}
        style={{ flex: 1, minWidth: 0 }}
      >
        <View style={styles.dockTitle}>
          {attending ? (
            <Icon name="check" size={14} color={palette.ink} />
          ) : null}
          <Text
            numberOfLines={1}
            style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}
          >
            {attending ? 'Presença marcada' : gameTitle(game)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.mono11, { color: palette.muted }]}
        >
          {attending ? `${gameTitle(game)} · ` : ''}
          {when}
          {!attending && count ? ` · ${count.toLocaleString('pt-BR')} vão` : ''}
        </Text>
      </Animated.View>
      {attending && code ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCode}
          style={[styles.codeButton, { backgroundColor: palette.ink }]}
        >
          <Icon name="qr" size={16} color={palette.bg} />
          <Text style={[text(14.5, 'Bold', 1.2), { color: palette.bg }]}>
            Ver código
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: attending }}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          onPress={onPress}
        >
          <View style={styles.goEdge} />
          <Animated.View style={[styles.go, press.style]}>
            {attending ? <Icon name="check" size={16} color={INK} /> : null}
            <Animated.Text
              key={attending ? 'vai' : 'vou'}
              entering={SWAP}
              numberOfLines={1}
              maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
              style={[text(15, 'Bold', 1.2), { color: INK }]}
            >
              {attending ? 'Você vai' : 'Vou assistir aqui'}
            </Animated.Text>
          </Animated.View>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  today: {
    backgroundColor: INK,
    borderRadius: 22,
    padding: 16,
    gap: 12
  },
  todayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  mono11: { fontFamily: MONO, fontSize: 11, letterSpacing: 0.4 },
  mono10: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.5 },
  screens: { flexDirection: 'row', gap: 16 },
  screen: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(201,241,53,.1)'
  },
  goingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.12)'
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PAPER,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }
  },
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth
  },
  dockTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  codeButton: {
    height: 46,
    paddingHorizontal: 18,
    borderRadius: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  goEdge: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    bottom: -3,
    borderRadius: 25,
    backgroundColor: INK
  },
  go: {
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 25,
    backgroundColor: ACID,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  }
})
