import { useQuery } from '@tanstack/react-query'
import {
  type Href,
  useGlobalSearchParams,
  usePathname,
  useRouter
} from 'expo-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets
} from 'react-native-safe-area-context'
import { InnerLayout, useLayout, useNavInsets } from '@/components/layout'
import { EASE } from '@/components/motion'
import { FrameKind, Pane, useOnboarding } from '@/components/onboarding'
import {
  ACID,
  BG,
  DISPLAY_FONT_SCALE,
  Icon,
  INK,
  PAPER,
  PillButton,
  StatusBarOver,
  Text,
  Title,
  text
} from '@/components/ui'
import { coverNote, FLOW, frameOf, stepOf, twoDigits } from '@/lib/onboarding'
import { trpc } from '@/lib/trpc'

/*
 * O entorno do onboarding fora do celular (WEB-492, Adaptativo 09): o passo
 * fica numa coluna e o caminho aparece em volta, como painel escuro à
 * esquerda (tela larga), faixa no topo (tablet em pé) ou a pergunta em cima
 * (mesa). Na tela de fora do Flip, só o aviso para terminar no celular
 * aberto. As medidas e a escolha estão em `lib/onboarding.ts`.
 *
 * A pilha dos passos fica sempre no mesmo lugar da árvore: dobrar, abrir ou
 * girar só troca o entorno e o estilo, e o passo e as escolhas continuam
 * onde estavam.
 */

const MUTED = '#aaa9a4'
const PHOTO = require('../assets/images/intro/bar.jpg')
const WORDMARK = require('../assets/images/brand/wordmark-light.png')

/** O número grande troca subindo, como quem vira a página. */
const NUMBER_IN = FadeInDown.duration(260).easing(EASE)

function Wordmark({ height }: { height: number }) {
  return (
    <Image
      source={WORDMARK}
      accessibilityLabel="Onside"
      style={{ height, width: (height * 845) / 256 }}
    />
  )
}

/** A foto do bar, apagada, atrás da tinta (como a entrada do design). */
function Photo({ opacity }: { opacity: number }) {
  return (
    <Image
      source={PHOTO}
      resizeMode="cover"
      style={[StyleSheet.absoluteFill, { opacity }]}
    />
  )
}

/** "02" em Anton: a altura de linha do design (0,85) pela margem negativa. */
function StepNumber({ step, size }: { step: number; size: number }) {
  return (
    <Animated.Text
      key={step}
      entering={NUMBER_IN}
      maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
      style={{
        fontFamily: 'Anton',
        fontSize: size,
        color: ACID,
        marginVertical: -0.3275 * size
      }}
    >
      {twoDigits(step + 1)}
    </Animated.Text>
  )
}

/** Os passos em barras, acesas até o atual. */
function Bars({ step, gap }: { step: number; gap: number }) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {FLOW.map((item, index) => (
        <View
          key={item.name}
          style={[
            styles.bar,
            { flex: 1 },
            index <= step && { backgroundColor: ACID }
          ]}
        />
      ))}
    </View>
  )
}

/** Tela larga: o caminho à esquerda, com o número grande e a lista. */
function Side({ step, height }: { step: number; height: number }) {
  const insets = useSafeAreaInsets()
  const big = height > 760
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top + 30,
        paddingBottom: Math.max(insets.bottom, 16) + 20,
        gap: big ? 26 : 16
      }}
    >
      <Wordmark height={24} />
      <View style={[styles.numberRow, { marginTop: big ? 20 : 4 }]}>
        <StepNumber step={step} size={big ? 120 : 84} />
        <Text style={styles.of}>DE {twoDigits(FLOW.length)}</Text>
      </View>
      <View style={{ gap: big ? 16 : 11 }}>
        {FLOW.map((item, index) => {
          const done = index < step
          const on = index === step
          return (
            <View
              key={item.name}
              style={[styles.row, { opacity: on ? 1 : done ? 0.75 : 0.5 }]}
            >
              <View>
                {on ? <View style={styles.squareEdge} /> : null}
                <View
                  style={[
                    styles.square,
                    on
                      ? { backgroundColor: ACID }
                      : done
                        ? { backgroundColor: 'rgba(201,241,53,.18)' }
                        : styles.squareTodo
                  ]}
                >
                  {done ? (
                    <Icon name="check" size={16} color={ACID} accent={ACID} />
                  ) : (
                    <Text
                      maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
                      style={[styles.squareNumber, on && { color: INK }]}
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[text(big ? 16 : 15, 'Bold', 1.25), { color: PAPER }]}
                >
                  {item.name}
                </Text>
                {on || big ? (
                  <Text style={[text(12.5, 'Regular', 1.3), { color: MUTED }]}>
                    {item.hint}
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
      <View style={{ flex: 1 }} />
      <Text style={[text(13, 'Regular', 1.45), { color: MUTED }]}>
        Leva menos de um minuto. Dá pra mudar tudo depois no perfil.
      </Text>
    </View>
  )
}

/**
 * O "Pular" do design, no topo da faixa e da mesa. O produto não pula o
 * cadastro inteiro: só aparece nos passos que o celular já deixa pular
 * (Times e Localização) e faz o mesmo que eles.
 */
function Skip({ step }: { step: number }) {
  const router = useRouter()
  const skip = FLOW[step].skip
  if (!skip) return null
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={12}
      onPress={() =>
        skip.replace
          ? router.replace(skip.to as Href)
          : router.push(skip.to as Href)
      }
    >
      <Text style={[text(14, 'SemiBold', 1.2), { color: MUTED }]}>Pular</Text>
    </Pressable>
  )
}

/** A marca à esquerda e o "Pular" à direita. */
function TopRow({ step, height }: { step: number; height: number }) {
  return (
    <View style={styles.topRow}>
      <Wordmark height={height} />
      <Skip step={step} />
    </View>
  )
}

/** Tablet em pé: a etapa atual e os passos em linha, na faixa do topo. */
function Band({ step }: { step: number }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[styles.bandInner, { top: insets.top + 30 }]}
      pointerEvents="box-none"
    >
      <TopRow step={step} height={24} />
      <View style={styles.bandNumber}>
        <StepNumber step={step} size={96} />
        <View style={{ paddingBottom: 6 }}>
          <Text style={[styles.of, { fontSize: 12 }]}>
            DE {twoDigits(FLOW.length)}
          </Text>
          <Animated.Text
            key={step}
            entering={NUMBER_IN}
            maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
            style={styles.bandName}
          >
            {FLOW[step].name}
          </Animated.Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {FLOW.map((item, index) => (
          <View key={item.name} style={{ flex: 1, minWidth: 0, gap: 7 }}>
            <View
              style={[styles.bar, index <= step && { backgroundColor: ACID }]}
            />
            <Text
              numberOfLines={1}
              style={[
                text(11.5, index === step ? 'Bold' : 'SemiBold', 1.2),
                { color: index === step ? PAPER : MUTED }
              ]}
            >
              {item.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

/** Mesa: a pergunta e o progresso na metade de cima. */
function TableTop({ step, wide }: { step: number; wide: boolean }) {
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.tableInner,
        { top: insets.top + 10, left: wide ? 44 : 30, right: wide ? 44 : 30 }
      ]}
    >
      <TopRow step={step} height={22} />
      <View>
        <View style={styles.numberRow}>
          <StepNumber step={step} size={64} />
          <Text style={[styles.of, { fontSize: 12 }]}>
            DE {twoDigits(FLOW.length)} · {FLOW[step].name.toUpperCase()}
          </Text>
        </View>
        <Animated.Text
          key={step}
          entering={NUMBER_IN}
          maxFontSizeMultiplier={DISPLAY_FONT_SCALE}
          style={[
            styles.ask,
            {
              fontSize: wide ? 40 : 32,
              marginVertical: -0.2425 * (wide ? 40 : 32),
              marginTop: 12 - 0.2425 * (wide ? 40 : 32)
            }
          ]}
        >
          {FLOW[step].ask}
        </Animated.Text>
        <View style={{ marginTop: 14 }}>
          <Bars step={step} gap={5} />
        </View>
      </View>
    </View>
  )
}

/**
 * A tela de fora do Flip: não dá para escolher time ali. Diz o que está
 * salvo e o que falta; "Continuar" mostra o passo onde a pessoa parou.
 */
function Cover({ step, onContinue }: { step: number; onContinue: () => void }) {
  const { choices } = useOnboarding()
  const sports = useQuery(trpc.pubs.getSports.queryOptions())
  const names = (sports.data ?? [])
    .filter((sport) => choices.sportIds.includes(sport.id))
    .map((sport) => sport.name)
  return (
    <Animated.View
      entering={FadeIn.duration(200).easing(EASE)}
      exiting={FadeOut.duration(140).easing(EASE)}
      style={styles.cover}
    >
      <Text style={styles.coverKicker}>
        CADASTRO · {twoDigits(step + 1)} DE {twoDigits(FLOW.length)}
      </Text>
      <Bars step={step} gap={4} />
      <View style={{ marginTop: 4 }}>
        <Title
          lines={[['Termine no'], ['celular aberto']]}
          size={26}
          color={PAPER}
        />
      </View>
      <Text style={[text(12.5, 'Regular', 1.4), { color: MUTED }]}>
        {coverNote(names, step)}
      </Text>
      <View style={{ alignSelf: 'flex-end', width: 180, marginTop: 2 }}>
        <PillButton
          label="Continuar"
          height={48}
          edge="#000"
          onPress={onContinue}
        />
      </View>
    </Animated.View>
  )
}

/** O passo do onboarding com o entorno do aparelho. */
export function OnboardingFrame({ children }: { children: ReactNode }) {
  const layout = useLayout()
  const insets = useSafeAreaInsets()
  const step = stepOf(usePathname())
  // A edição pelas Configurações (esportes e times) não é o caminho do
  // cadastro: só a coluna, sem o entorno.
  const editing = useGlobalSearchParams<{ edit?: string }>().edit === '1'
  // Sem a postura, o dobrável aberto do Android se divide na metade da tela.
  const fold =
    layout.gap > 0 || (Platform.OS === 'android' && layout.nav === 'float')
  // No iPhone Duo a barra de status e a ilha ficam na faixa da direita: o
  // onboarding fica à esquerda dela.
  const strip = useNavInsets().right
  const frame = frameOf({ ...layout, width: layout.width - strip }, fold)
  const kind = editing && frame.kind !== 'cover' ? 'column' : frame.kind

  // O aviso da tela de fora volta a cada vez que o Flip fecha.
  const [coverSeen, setCoverSeen] = useState(false)
  useEffect(() => {
    if (frame.kind !== 'cover') setCoverSeen(false)
  }, [frame.kind])

  const { height } = layout
  const width = layout.width - strip
  // A área do passo, o entorno (atrás ou ao lado) e o respiro do topo.
  let pane = { left: 0, top: 0, width, height }
  let column = width
  let top = insets.top
  let decor: ReactNode = null
  if (frame.kind === 'side' && kind === 'side') {
    pane = { left: width - frame.pane, top: 0, width: frame.pane, height }
    column = frame.column
    // O passo começa onde o design o põe (56), abaixo da barra de status.
    top = Math.max(insets.top, 48)
    decor = (
      <View style={[styles.panel, { width: frame.panel }]}>
        <Photo opacity={0.18} />
        <View
          style={{ flex: 1, paddingHorizontal: frame.panel > 440 ? 44 : 30 }}
        >
          <Side step={step} height={height} />
        </View>
      </View>
    )
  } else if (frame.kind === 'band' && kind === 'band') {
    pane = {
      left: 0,
      top: frame.band,
      width,
      height: height - frame.band
    }
    column = frame.column
    top = 20
    decor = (
      <View style={[styles.panel, { right: strip, height: frame.band + 30 }]}>
        <Photo opacity={0.22} />
        <Band step={step} />
      </View>
    )
  } else if (frame.kind === 'table' && kind === 'table') {
    const below = frame.top + frame.gap
    pane = { left: 0, top: below, width, height: height - below }
    column = frame.column
    top = 8
    decor = (
      <View style={[styles.panel, { right: strip, height: frame.top }]}>
        <Photo opacity={0.18} />
        <TableTop step={step} wide={width > 800} />
      </View>
    )
  } else if (kind === 'column') {
    column = Math.min(540, width - 48)
  }
  // Dentro do quadro do passo, a barra de status só conta onde ele encosta.
  const paneInsets = { ...insets, top }
  const side = (pane.width - Math.min(column, pane.width)) / 2

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: decor ? INK : BG
      }}
    >
      {decor}
      <View style={[styles.pane, pane, kind === 'band' && styles.sheet]}>
        <SafeAreaInsetsContext.Provider value={paneInsets}>
          <StatusBarOver.Provider value={decor ? 'light' : null}>
            <FrameKind.Provider value={kind === 'column' ? 'phone' : kind}>
              {/* O passo já está na coluna dele: para as telas de dentro
                  (e o `Screen`), é um celular, sem faixa do Duo nem mesa. */}
              <InnerLayout.Provider
                value={{
                  kind: 'phone',
                  nav: 'tabs',
                  width: pane.width,
                  height: pane.height,
                  split: pane.width,
                  gap: 0,
                  wide: false
                }}
              >
                <Pane.Provider
                  value={{
                    width: pane.width,
                    height: pane.height,
                    side,
                    wide: layout.kind !== 'phone'
                  }}
                >
                  {children}
                </Pane.Provider>
              </InnerLayout.Provider>
            </FrameKind.Provider>
          </StatusBarOver.Provider>
        </SafeAreaInsetsContext.Provider>
      </View>
      {frame.kind === 'cover' && !coverSeen ? (
        <Cover step={step} onContinue={() => setCoverSeen(true)} />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: INK,
    overflow: 'hidden'
  },
  pane: { position: 'absolute', backgroundColor: BG, overflow: 'hidden' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  numberRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  of: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 13,
    color: MUTED
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  square: {
    width: 34,
    height: 34,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  squareTodo: { borderWidth: 1.5, borderColor: 'rgba(241,238,230,.3)' },
  // A sombra dura de tinta do passo atual (3 x 3).
  squareEdge: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 34,
    height: 34,
    borderRadius: 5,
    backgroundColor: '#000'
  },
  squareNumber: {
    fontFamily: 'Anton',
    fontSize: 17,
    color: PAPER,
    marginVertical: -4
  },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(241,238,230,.2)'
  },
  bandInner: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 52,
    justifyContent: 'space-between'
  },
  bandNumber: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  bandName: {
    fontFamily: 'Anton',
    fontSize: 30,
    textTransform: 'uppercase',
    color: PAPER,
    marginTop: 6 - 0.2425 * 30,
    marginBottom: -0.2425 * 30
  },
  tableInner: {
    position: 'absolute',
    bottom: 24,
    justifyContent: 'space-between'
  },
  ask: {
    fontFamily: 'Anton',
    textTransform: 'uppercase',
    color: PAPER
  },
  cover: {
    ...StyleSheet.absoluteFill,
    backgroundColor: INK,
    paddingTop: 40,
    paddingHorizontal: 22,
    gap: 10
  },
  coverKicker: {
    fontFamily: 'GeistMono-SemiBold',
    fontSize: 11,
    letterSpacing: 0.66,
    color: ACID
  }
})
