import { gameTitle, type TitledGame } from '@findsports_oficial/db/game-title'
import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming
} from 'react-native-reanimated'
import { dayLabel } from '@/components/explore'
import { GameTitle } from '@/components/explore-board'
import { DotField } from '@/components/fan-card'
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
export function TodayCard({
  game,
  now,
  noCode,
  closedNote
}: {
  game: CardGame
  now: number
  /**
   * Bar sem código (Starter e Pro, rodada 8): nada de oferta nem código; no
   * lugar, o check-in que faz a avaliação contar.
   */
  noCode?: boolean
  /** Fechado agora (rodada 8): "O bar abre às 17:00, duas horas antes do jogo." */
  closedNote?: string | null
}) {
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
      {closedNote ? (
        <View style={styles.warn}>
          <Icon name="calendar" size={18} color={PAPER} accent={ACID} />
          <Text style={[text(13.5, 'Regular', 1.4), { color: PAPER, flex: 1 }]}>
            {closedNote}
          </Text>
        </View>
      ) : null}
      {noCode ? (
        <View style={styles.offer}>
          <Icon name="pin" size={20} color={ACID} accent={ACID} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.mono10, { color: '#aaa9a4' }]}>
              CHEGANDO LÁ
            </Text>
            <Text style={[text(14, 'Regular', 1.4), { color: PAPER }]}>
              Faça o check-in e sua avaliação conta na nota do bar.
            </Text>
          </View>
        </View>
      ) : game.houseOffer ? (
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

type LiveGame = CardGame & {
  championship: string
  hereNow: {
    count: number | null
    friends: { id: string; name: string }[]
  } | null
}

/** "Marina e Rafael", "Marina, Rafael e mais 2". */
function namesLine(names: string[]) {
  const first = names.map((name) => name.trim().split(/\s+/)[0] ?? name)
  if (first.length <= 2) return first.join(' e ')
  return `${first.slice(0, 2).join(', ')} e mais ${first.length - 2}`
}

/**
 * O placar do bar no jogo ao vivo (rodada 8, tela 1, refeito em 09/11): faixa
 * vermelha "AO VIVO AQUI" com o horário de início (a Onside não sabe o minuto
 * e não o inventa), os dois times grandes, um sobre o outro, liga, telas e
 * som em etiquetas, e dois números: quem está no bar agora (check-in e
 * código) e quem marcou presença. Os amigos que estão lá fecham o cartão.
 */
export function LiveCard({
  game,
  screens
}: {
  game: LiveGame
  /** Quantos telões o bar declarou ("telão · 6 telas"). */
  screens: number | null
}) {
  const palette = usePalette()
  const sides = gameTitle(game).split(' × ')
  const here = game.hereNow
  const going = game.going?.count ?? null
  const tags = [
    game.championship,
    game.onBigScreen
      ? screens && screens > 1
        ? `telão · ${screens} telas`
        : 'telão'
      : null,
    game.withSound ? 'som ligado' : null
  ].filter((tag): tag is string => Boolean(tag))
  return (
    <View
      style={[styles.live, { backgroundColor: palette.dark ? '#1c1c18' : INK }]}
    >
      <DotField id="ao-vivo" radius={24} />
      <View style={styles.liveBand}>
        <LiveDot />
        <Text style={styles.liveBandText}>AO VIVO AQUI</Text>
        <Text style={[styles.liveBandText, styles.liveStart]}>
          começou {formatTime(game.startsAt)}
        </Text>
      </View>
      <View style={styles.liveTeams}>
        {sides.length === 2 ? (
          <>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.team}>
              {sides[0]}
            </Text>
            <Text style={styles.teamX}>×</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.team}>
              {sides[1]}
            </Text>
          </>
        ) : (
          <Text numberOfLines={2} adjustsFontSizeToFit style={styles.team}>
            {gameTitle(game)}
          </Text>
        )}
      </View>
      {tags.length ? (
        <View style={styles.liveTags}>
          {tags.map((tag) => (
            <View key={tag} style={styles.liveTag}>
              <Text style={styles.liveTagText}>
                {tag.toLocaleUpperCase('pt-BR')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {here?.count || going ? (
        <View style={styles.liveStats}>
          <View style={styles.liveStat}>
            <Text style={[styles.liveNumber, { color: ACID }]}>
              {here?.count ?? '—'}
            </Text>
            <Text style={styles.liveLabel}>no bar agora</Text>
          </View>
          <View style={[styles.liveStat, styles.liveStatLine]}>
            <Text style={[styles.liveNumber, { color: PAPER }]}>
              {going ?? '—'}
            </Text>
            <Text style={styles.liveLabel}>marcaram presença</Text>
          </View>
        </View>
      ) : null}
      {here?.friends.length ? (
        <View style={styles.liveFriends}>
          <View style={{ flexDirection: 'row' }}>
            {here.friends.slice(0, 3).map((friend, index) => (
              <Animated.View
                key={friend.id}
                entering={FACE_IN}
                style={[
                  styles.liveFace,
                  {
                    backgroundColor: index % 2 ? PAPER : ACID,
                    marginLeft: index ? -7 : 0
                  }
                ]}
              >
                <Text style={[text(11, 'Bold', 1), { color: INK }]}>
                  {friend.name.trim().charAt(0).toUpperCase()}
                </Text>
              </Animated.View>
            ))}
          </View>
          <Text
            style={[text(13, 'Regular', 1.3), { color: '#aaa9a4', flex: 1 }]}
          >
            <Text style={[text(13, 'Bold', 1.3), { color: PAPER }]}>
              {namesLine(here.friends.map((friend) => friend.name))}
            </Text>{' '}
            {here.friends.length === 1 ? 'está lá' : 'estão lá'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

/** O ponto do ao vivo: pulsa (1,6 s a volta); reduzido, parado. */
function LiveDot() {
  const reduced = useReducedMotion()
  const fade = useSharedValue(1)
  useEffect(() => {
    if (reduced) return
    fade.set(withRepeat(withTiming(0.3, { duration: 800 }), -1, true))
    return () => cancelAnimation(fade)
  }, [reduced, fade])
  const style = useAnimatedStyle(() => ({ opacity: fade.get() }))
  return <Animated.View style={[styles.liveDot, style]} />
}

/** O amigo novo entra na pilha: .9 → 1 e opacidade, 180 ms. */
const FACE_IN = () => {
  'worklet'
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 180 }),
      transform: [{ scale: withTiming(1, { duration: 180 }) }]
    }
  }
}

/** A oferta da casa fora do cartão, em acid (rodada 8). */
export function OfferStrip({ offer }: { offer: string }) {
  return (
    <View style={styles.offerStrip}>
      <Icon name="ticket" size={22} color={INK} accent={INK} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.offerKicker}>OFERTA DA CASA · NESTE JOGO</Text>
        <Text style={[text(15, 'Bold', 1.25), { color: INK }]}>{offer}</Text>
      </View>
    </View>
  )
}

/**
 * Sem jogo hoje (rodada 8): o próximo jogo do bar, com o dia em destaque.
 * "Vou assistir aqui" fica no rodapé para ele.
 */
export function NextCard({
  game
}: {
  game: CardGame & { championship: string }
}) {
  const palette = usePalette()
  const date = new Date(game.startsAt)
  const part = (options: Intl.DateTimeFormatOptions) =>
    date
      .toLocaleDateString('pt-BR', {
        ...options,
        timeZone: 'America/Sao_Paulo'
      })
      .replace('.', '')
      .toLocaleUpperCase('pt-BR')
  const count = game.going?.count ?? null
  return (
    <View
      style={[
        styles.nextCard,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <Text style={[styles.kicker, { color: palette.muted }]}>
        PRÓXIMO JOGO AQUI
      </Text>
      <View style={styles.nextRow}>
        <View style={[styles.dateBig, { backgroundColor: palette.ink }]}>
          <Text style={[styles.dateSmall, { color: palette.bg }]}>
            {part({ weekday: 'short' })}
          </Text>
          <Text style={[styles.dateDay, { color: palette.bg }]}>
            {part({ day: 'numeric' })}
          </Text>
          <Text style={[styles.dateSmall, { color: palette.bg }]}>
            {part({ month: 'short' })}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <GameTitle
            title={gameTitle(game)}
            size={30}
            color={palette.ink}
            accent={palette.hot}
          />
          <Text style={[text(13, 'Regular', 1.35), { color: palette.muted }]}>
            {[
              formatTime(game.startsAt),
              game.championship,
              game.onBigScreen ? 'telão' : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {count ? (
            <Text style={[text(13, 'Regular', 1.35), { color: palette.muted }]}>
              {count.toLocaleString('pt-BR')}{' '}
              {count === 1 ? 'pessoa vai' : 'pessoas vão'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/**
 * "Hoje não tem jogo aqui" (rodada 8): a página não vira beco. O botão é o
 * "Avisar" que já existe (o bar e os seus times).
 */
export function NoGameToday({
  on,
  busy,
  onAlert
}: {
  on: boolean
  busy: boolean
  onAlert: () => void
}) {
  const palette = usePalette()
  return (
    <View
      style={[
        styles.empty,
        { backgroundColor: palette.card, shadowColor: palette.drop }
      ]}
    >
      <Text style={[styles.emptyTitle, { color: palette.ink }]}>
        Hoje não tem jogo aqui
      </Text>
      <Text style={[text(14, 'Regular', 1.45), { color: palette.muted }]}>
        Salve o bar e avisamos quando ele marcar jogo dos seus times.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on, busy }}
        disabled={busy}
        onPress={onAlert}
        style={({ pressed }) => [
          styles.alertButton,
          { backgroundColor: palette.ink },
          pressed && { transform: [{ scale: 0.97 }] }
        ]}
      >
        <Animated.View
          key={on ? 'on' : 'off'}
          entering={SWAP}
          style={styles.alertInner}
        >
          <Icon
            name={on ? 'check' : 'bell'}
            size={16}
            color={palette.bg}
            accent={LIVE}
          />
          <Text style={[text(14.5, 'Bold', 1.2), { color: palette.bg }]}>
            {on ? 'Vamos avisar' : 'Avisar quando marcar'}
          </Text>
        </Animated.View>
      </Pressable>
    </View>
  )
}

/**
 * O rodapé sem jogo nenhum marcado (rodada 8): "Salvar o bar", e avisamos
 * quando ele marcar jogo.
 */
export function SaveDock({
  bottom,
  saved,
  onPress
}: {
  bottom: number
  saved: boolean
  onPress: () => void
}) {
  const palette = usePalette()
  const press = usePress(0, 3)
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}
        >
          {saved ? 'Bar salvo' : 'Sem jogo marcado'}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.mono11, { color: palette.muted }]}
        >
          avisamos quando marcar jogo
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={onPress}
      >
        <View style={styles.goEdge} />
        <Animated.View style={[styles.go, press.style]}>
          {saved ? <Icon name="check" size={16} color={INK} /> : null}
          <Animated.Text
            key={saved ? 'salvo' : 'salvar'}
            entering={SWAP}
            numberOfLines={1}
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
            style={[text(15, 'Bold', 1.2), { color: INK }]}
          >
            {saved ? 'Salvo' : 'Salvar o bar'}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </View>
  )
}

/**
 * O rodapé no jogo ao vivo para quem está no bar (rodada 8): "Você está no
 * bar?" e "Estou aqui", o check-in que faz a avaliação contar na nota.
 */
export function CheckInDock({
  bottom,
  phase,
  error,
  denied,
  onPress,
  onSettings
}: {
  bottom: number
  phase: 'idle' | 'locating' | 'sending'
  error: string | null
  denied: boolean
  onPress: () => void
  onSettings: () => void
}) {
  const palette = usePalette()
  const press = usePress(0, 3)
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
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[text(14.5, 'Bold', 1.25), { color: palette.ink }]}
        >
          {denied ? 'Sem a sua localização' : 'Você está no bar?'}
        </Text>
        <Text
          numberOfLines={2}
          style={[
            styles.mono11,
            { color: error ? palette.live : palette.muted }
          ]}
        >
          {error ??
            (denied
              ? 'o check-in precisa saber que você está lá'
              : 'check-in a até 150 m · conta na nota')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: phase !== 'idle' }}
        disabled={phase !== 'idle'}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={denied ? onSettings : onPress}
      >
        <View style={styles.goEdge} />
        <Animated.View style={[styles.go, press.style]}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
            style={[text(15, 'Bold', 1.2), { color: INK }]}
          >
            {denied
              ? 'Abrir Ajustes'
              : phase === 'locating'
                ? 'Localizando…'
                : phase === 'sending'
                  ? 'Conferindo…'
                  : 'Estou aqui'}
          </Text>
        </Animated.View>
      </Pressable>
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
  here,
  code,
  bottom,
  onPress,
  onCode
}: {
  game: CardGame
  now: number
  attending: boolean
  /** O check-in deste jogo foi feito: "Você está aqui" (rodada 3). */
  here?: boolean
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
        key={here ? 'aqui' : attending ? 'marcado' : 'livre'}
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
            {here
              ? 'Você está aqui'
              : attending
                ? 'Presença marcada'
                : gameTitle(game)}
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
  live: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(243,66,29,.4)',
    shadowColor: '#000',
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 }
  },
  liveBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#e8320c'
  },
  liveBandText: {
    fontFamily: MONO,
    fontSize: 12,
    letterSpacing: 0.96,
    color: INK
  },
  liveStart: { marginLeft: 'auto', letterSpacing: 0.48 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: INK },
  liveTeams: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 },
  // Anton 46 a .9: margem negativa no lugar do entrelinha curto.
  team: {
    fontFamily: 'Anton',
    fontSize: 46,
    textTransform: 'uppercase',
    color: PAPER,
    marginVertical: -11.2
  },
  teamX: {
    fontFamily: 'Anton',
    fontSize: 20,
    color: '#6a6a63',
    marginLeft: 2,
    marginTop: 4,
    marginBottom: -2
  },
  liveTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 14
  },
  liveTag: {
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(241,238,230,.08)'
  },
  liveTagText: {
    fontFamily: MONO,
    fontSize: 11,
    letterSpacing: 0.66,
    color: '#c9c7c0'
  },
  liveStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.1)'
  },
  liveStat: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  liveStatLine: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(241,238,230,.1)'
  },
  // Anton 40: margem negativa no lugar do entrelinha curto.
  liveNumber: { fontFamily: 'Anton', fontSize: 40, marginVertical: -9.7 },
  liveLabel: {
    fontSize: 12.5,
    fontFamily: 'Archivo-Regular',
    color: '#aaa9a4'
  },
  liveFriends: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(241,238,230,.1)'
  },
  liveFace: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: INK
  },
  offerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: ACID
  },
  offerKicker: {
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.76,
    color: '#3d4a06',
    marginBottom: 4
  },
  nextCard: {
    borderRadius: 24,
    padding: 16,
    gap: 12,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  kicker: { fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.05 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dateBig: {
    width: 70,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 8
  },
  dateSmall: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 1,
    opacity: 0.75
  },
  // Anton 38: margem negativa no lugar do entrelinha curto.
  dateDay: { fontFamily: 'Anton', fontSize: 38, marginVertical: -6 },
  empty: {
    borderRadius: 20,
    padding: 16,
    gap: 8,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 }
  },
  // Anton 24: margem negativa no lugar do entrelinha curto.
  emptyTitle: {
    fontFamily: 'Anton',
    fontSize: 24,
    textTransform: 'uppercase',
    marginVertical: -5.8
  },
  alertButton: {
    alignSelf: 'flex-start',
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 4,
    justifyContent: 'center'
  },
  alertInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(241,238,230,.08)'
  },
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
